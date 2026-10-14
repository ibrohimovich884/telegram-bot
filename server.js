import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PORT, BOT_TOKEN, GEMINI_API_KEY, GEMINI_MODEL, SYSTEM_PROMPT } from "./config.js";
import { getErrors, clearErrors, logError } from "./errors.js";
import { getActivities, getStats, logActivity } from "./activity.js";
import { askGemini } from "./gemini.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");
const INDEX_HTML_PATH = path.join(PUBLIC_DIR, "index.html");

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error("So'rov hajmi juda katta"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

async function pingRender(targetUrl = "https://telegram-bot-imap.onrender.com") {
  const url = (targetUrl || "https://telegram-bot-imap.onrender.com").replace(/\/+$/, "");
  const t0 = Date.now();
  let rootRes = null;
  let rootText = "";
  let rootDuration = 0;
  let errorsCount = null;
  let isAlive = false;
  let errorMessage = null;

  try {
    const res = await fetch(`${url}/`, {
      headers: { "User-Agent": "TelegramBotDashboard/1.0" },
      signal: AbortSignal.timeout(25000),
    });
    rootDuration = Date.now() - t0;
    rootText = await res.text();
    isAlive = res.ok;
    rootRes = {
      status: res.status,
      statusText: res.statusText,
    };
  } catch (err) {
    rootDuration = Date.now() - t0;
    errorMessage = err?.message || "Render serveriga ulanishda xatolik";
  }

  // Masofadagi /errors ni ham tekshirib ko'ramiz
  if (isAlive) {
    try {
      const errRes = await fetch(`${url}/errors`, {
        headers: { "User-Agent": "TelegramBotDashboard/1.0" },
        signal: AbortSignal.timeout(6000),
      });
      if (errRes.ok) {
        const errJson = await errRes.json();
        errorsCount = errJson.count ?? (Array.isArray(errJson.errors) ? errJson.errors.length : 0);
      }
    } catch {
      // Remote errors endpoint failure is not critical
    }
  }

  return {
    url,
    isAlive,
    status: rootRes?.status || 0,
    statusText: rootRes?.statusText || (isAlive ? "OK" : "Offline / Timeout"),
    durationMs: rootDuration,
    responseText: (rootText || "").trim().slice(0, 300),
    errorsCount,
    errorMessage,
    checkedAt: new Date().toISOString(),
  };
}

export function startServer() {
  const server = http.createServer(async (req, res) => {
    // CORS Preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = parsedUrl.pathname;

    try {
      // 1. /api/status -> Jonli tizim holati
      if (req.method === "GET" && pathname === "/api/status") {
        const statsData = getStats();
        sendJson(res, 200, {
          status: "online",
          ...statsData,
          nodeVersion: process.version,
          platform: process.platform,
          botConfig: {
            hasBotToken: Boolean(BOT_TOKEN),
            hasGeminiKey: Boolean(GEMINI_API_KEY),
            geminiModel: GEMINI_MODEL,
            systemPrompt: SYSTEM_PROMPT,
            renderUrl: "https://telegram-bot-imap.onrender.com",
          },
          stats: {
            totalUpdates: statsData.totalUpdates,
            businessMessages: statsData.businessMessages,
            geminiReplies: statsData.geminiReplies,
            errorsCount: statsData.errorsCount,
            lastActivityAt: statsData.lastActivityAt,
            botUsername: statsData.botUsername,
          },
        });
        return;
      }

      // 2. /api/activities -> Bot hodisalari
      if (req.method === "GET" && pathname === "/api/activities") {
        const activities = getActivities();
        sendJson(res, 200, {
          count: activities.length,
          activities,
        });
        return;
      }

      // 3. /errors va /api/errors -> Xatoliklar
      if (req.method === "GET" && (pathname === "/errors" || pathname === "/api/errors")) {
        const errors = getErrors();
        sendJson(res, 200, {
          count: errors.length,
          errors,
        });
        return;
      }

      // 4. /api/errors/clear -> Xatoliklarni tozalash
      if (req.method === "POST" && pathname === "/api/errors/clear") {
        clearErrors();
        logActivity({
          type: "system",
          title: "Xatoliklar jurnali tozalandi",
          details: "Foydalanuvchi interfeys orqali xatolar jurnalini tozaladi.",
          status: "ok",
        });
        sendJson(res, 200, { success: true, message: "Xatoliklar tozalandi" });
        return;
      }

      // 5. /api/test-gemini -> Gemini AI'ni test qilish
      if (req.method === "POST" && pathname === "/api/test-gemini") {
        const body = await readBody(req);
        const text = String(body.text || "").trim();

        if (!text) {
          sendJson(res, 400, { success: false, error: "Matn kiritilmadi" });
          return;
        }

        const t0 = Date.now();
        try {
          const reply = await askGemini(text);
          const durationMs = Date.now() - t0;

          logActivity({
            type: "ai_reply",
            title: `Gemini sinovi: javob olindi (${durationMs}ms)`,
            details: `Sinov savoli: "${text.slice(0, 50)}" -> Javob: "${reply.slice(0, 80)}"`,
            status: "ok",
            metadata: { durationMs, testText: text },
          });

          sendJson(res, 200, {
            success: true,
            reply,
            durationMs,
            model: GEMINI_MODEL,
          });
        } catch (err) {
          const durationMs = Date.now() - t0;
          logError("test-gemini", err);
          sendJson(res, 500, {
            success: false,
            error: err?.message || "Gemini javob qaytara olmadi",
            durationMs,
          });
        }
        return;
      }

      // 6. /api/ping-render -> Render serverini tekshirish
      if (req.method === "POST" && pathname === "/api/ping-render") {
        const body = await readBody(req);
        const targetUrl = body.url || "https://telegram-bot-imap.onrender.com";
        const pingResult = await pingRender(targetUrl);
        sendJson(res, 200, pingResult);
        return;
      }

      // 7. Bosh sahifa (Dashboard UI)
      if (pathname === "/" || pathname === "/index.html") {
        if (fs.existsSync(INDEX_HTML_PATH)) {
          const html = fs.readFileSync(INDEX_HTML_PATH, "utf-8");
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(html);
          return;
        }
      }

      // 8. Boshqa statik fayllar (agar public papkasida bo'lsa)
      const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
      const filePath = path.join(PUBLIC_DIR, safePath);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const contentTypes = {
          ".html": "text/html; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".js": "application/javascript; charset=utf-8",
          ".json": "application/json; charset=utf-8",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".jpg": "image/jpeg",
        };
        const contentType = contentTypes[ext] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": contentType });
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      // Fallback: Agar boshqa yo'l bo'lsa ham dashboard'ga yo'naltiramiz yoki 404
      if (fs.existsSync(INDEX_HTML_PATH)) {
        const html = fs.readFileSync(INDEX_HTML_PATH, "utf-8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bot ishlayapti");
    } catch (err) {
      logError("server.request", err);
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Server ichki xatoligi" }));
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[HTTP SERVER] Bot interfeysi va API port: ${PORT} da ishga tushdi`);
  });

  return server;
}
