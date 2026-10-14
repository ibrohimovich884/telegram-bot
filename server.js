import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PORT,
  BOT_TOKEN,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  SYSTEM_PROMPT,
  ADMIN_PASSWORD,
  RENDER_EXTERNAL_URL,
} from "./config.js";
import { getErrors, clearErrors, logError } from "./errors.js";
import { getActivities, getStats, logActivity } from "./activity.js";
import { askGemini } from "./gemini.js";
import { botState } from "./botState.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");
const INDEX_HTML_PATH = path.join(PUBLIC_DIR, "index.html");

// CORS olib tashlandi: faqat to'g'ridan-to'g'ri yoki bir xil manbali so'rovlar qabul qilinadi
function sendJson(res, statusCode, data, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    ...extraHeaders,
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

// SSRF himoyasi: faqat o'z Render manzilini tekshiradi, ixtiyoriy tashqi URL qabul qilinmaydi
async function pingRender() {
  const url = (RENDER_EXTERNAL_URL || "https://telegram-bot-imap.onrender.com").replace(/\/+$/, "");
  const t0 = Date.now();
  let rootRes = null;
  let rootText = "";
  let rootDuration = 0;
  let errorsCount = null;
  let isAlive = false;
  let errorMessage = null;

  try {
    const res = await fetch(`${url}/health`, {
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

// Parol va avtorizatsiyani tekshirish (HTTP Basic Auth & x-admin-password)
function checkAuth(req) {
  const adminPassword = (process.env.ADMIN_PASSWORD || ADMIN_PASSWORD || "").trim();

  // 1. Agar ADMIN_PASSWORD belgilanmagan bo'lsa
  if (!adminPassword) {
    return { ok: false, status: 401, reason: "ADMIN_PASSWORD_NOT_CONFIGURED" };
  }

  const authHeader = req.headers["authorization"] || "";
  const xAdminPass = req.headers["x-admin-password"];

  // To'g'ridan-to'g'ri header orqali parol yuborilgan bo'lsa
  if (xAdminPass && xAdminPass === adminPassword) {
    return { ok: true };
  }

  // HTTP Basic Auth: "Basic dXNlcm5hbWU6cGFzc3dvcmQ="
  if (authHeader.startsWith("Basic ")) {
    try {
      const credentials = Buffer.from(authHeader.slice(6).trim(), "base64").toString("utf-8");
      const separatorIndex = credentials.indexOf(":");
      if (separatorIndex !== -1) {
        // login: istalgan (masalan: admin), parol: adminPassword
        const password = credentials.slice(separatorIndex + 1);
        if (password === adminPassword) {
          return { ok: true };
        }
      } else if (credentials === adminPassword) {
        return { ok: true };
      }
    } catch {
      // Base64 xatosi
    }
  }

  // Bearer token varianti
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token === adminPassword) {
      return { ok: true };
    }
  }

  return { ok: false, status: 401, reason: "UNAUTHORIZED" };
}

export function startServer() {
  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = parsedUrl.pathname;

    // OPTIONS so'rovlari
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // 0. /health -> OCHIQ marshrut (UptimeRobot va monitoring uchun, parol talab qilinmaydi)
    if (req.method === "GET" && pathname === "/health") {
      sendJson(res, 200, {
        status: "ok",
        service: "telegram-business-bot",
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
        polling: botState.pollingStatus,
        adminPasswordConfigured: Boolean((process.env.ADMIN_PASSWORD || ADMIN_PASSWORD || "").trim()),
      });
      return;
    }

    // 1. Statik fayllar va Bosh sahifa (Dashboard HTML) - Har doim 200 OK qaytaradi
    // Bu orqali AI Studio warmup va iframe to'xtovsiz yuklanadi, dashboard ichida esa parol so'raladi
    if (pathname === "/" || pathname === "/index.html") {
      if (fs.existsSync(INDEX_HTML_PATH)) {
        const html = fs.readFileSync(INDEX_HTML_PATH, "utf-8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
    }

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

    // 2. BARCHA API va Maxfiy marshrutlar (/api/* va /errors) uchun avtorizatsiyani tekshiramiz
    const auth = checkAuth(req);
    if (!auth.ok) {
      const isPasswordConfigured = Boolean((process.env.ADMIN_PASSWORD || ADMIN_PASSWORD || "").trim());
      const wwwAuthHeader = {
        "WWW-Authenticate": 'Basic realm="Telegram Bot Admin Dashboard", charset="UTF-8"',
      };

      sendJson(res, 401, {
        error: isPasswordConfigured
          ? "Ruxsat berilmadi: Parol kiritilmadi yoki noto'g'ri (401 Unauthorized)"
          : "Dashboard yopiq: ADMIN_PASSWORD belgilanmagan. Server Environment sozlamalariga ADMIN_PASSWORD qo'shing.",
        code: isPasswordConfigured ? "UNAUTHORIZED" : "ADMIN_PASSWORD_REQUIRED",
        status: 401,
        adminPasswordConfigured: isPasswordConfigured,
      }, wwwAuthHeader);
      return;
    }

    // --- AVTORIZATSIYADAN O'TGAN SO'ROVLAR ---
    try {
      // /api/status -> Jonli tizim holati va 409 diagnostikasi
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
            renderUrl: RENDER_EXTERNAL_URL,
            port: PORT,
            authEnabled: true,
          },
          polling: {
            enabled: botState.isPollingEnabled,
            status: botState.pollingStatus,
            conflictCount: botState.conflictCount,
            lastConflictAt: botState.lastConflictAt,
            conflictMessage: botState.conflictMessage,
          },
          telegram: {
            botInfo: botState.botInfo,
            webhookInfo: botState.webhookInfo,
          },
          stats: {
            totalUpdates: statsData.totalUpdates,
            businessMessages: statsData.businessMessages,
            geminiReplies: statsData.geminiReplies,
            errorsCount: statsData.errorsCount,
            lastActivityAt: statsData.lastActivityAt,
            botUsername: statsData.botUsername || botState.botInfo?.username,
          },
        });
        return;
      }

      // /api/activities -> Bot hodisalari
      if (req.method === "GET" && pathname === "/api/activities") {
        const activities = getActivities();
        sendJson(res, 200, {
          count: activities.length,
          activities,
        });
        return;
      }

      // /errors va /api/errors -> Xatoliklar
      if (req.method === "GET" && (pathname === "/errors" || pathname === "/api/errors")) {
        const errors = getErrors();
        sendJson(res, 200, {
          count: errors.length,
          errors,
        });
        return;
      }

      // /api/errors/clear -> Xatoliklarni tozalash
      if (req.method === "POST" && pathname === "/api/errors/clear") {
        clearErrors();
        logActivity({
          type: "system",
          title: "Xatoliklar jurnali tozalandi",
          details: "Administrator interfeys orqali xatolar jurnalini tozaladi.",
          status: "ok",
        });
        sendJson(res, 200, { success: true, message: "Xatoliklar tozalandi" });
        return;
      }

      // /api/test-gemini -> Gemini AI'ni test qilish
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

      // /api/ping-render -> SSRF himoyalangan: faqat o'z Render manzilini tekshiradi
      if (req.method === "POST" && pathname === "/api/ping-render") {
        const pingResult = await pingRender();
        sendJson(res, 200, pingResult);
        return;
      }

      // /api/polling/toggle -> Polling holatini o'zgartirish (Standby / Active)
      if (req.method === "POST" && pathname === "/api/polling/toggle") {
        const body = await readBody(req);
        let result;
        if (body.action === "pause" || (botState.isPollingEnabled && body.action !== "resume")) {
          result = await botState.controller.pause();
        } else {
          result = await botState.controller.resume();
        }
        sendJson(res, 200, {
          success: true,
          isPollingEnabled: botState.isPollingEnabled,
          pollingStatus: botState.pollingStatus,
          result,
        });
        return;
      }

      // /api/telegram/reset-webhook -> Webhook va sessiyani tozalash (409 xatosini yechish)
      if (req.method === "POST" && pathname === "/api/telegram/reset-webhook") {
        const body = await readBody(req);
        const dropPending = body.dropPending !== false;
        try {
          const resDrop = await botState.controller.resetWebhook(dropPending);
          sendJson(res, 200, {
            success: true,
            message: "Telegram sessiya va webhook tozalandi. Qulflar bo'shatildi.",
            dropPending,
            resDrop,
          });
        } catch (err) {
          sendJson(res, 500, {
            success: false,
            error: err?.message || "Webhookni tozalashda xatolik",
          });
        }
        return;
      }

      // /api/telegram/info -> Bot va Webhook holatini Telegram API orqali tekshirish
      if (req.method === "GET" && pathname === "/api/telegram/info") {
        try {
          const diag = await botState.controller.getDiagnostics();
          sendJson(res, 200, {
            success: true,
            pollingStatus: botState.pollingStatus,
            isPollingEnabled: botState.isPollingEnabled,
            conflictCount: botState.conflictCount,
            lastConflictAt: botState.lastConflictAt,
            botInfo: botState.botInfo,
            webhookInfo: botState.webhookInfo,
            diag,
          });
        } catch (err) {
          sendJson(res, 500, {
            success: false,
            error: err?.message || "Telegram ma'lumotlarini olishda xatolik",
          });
        }
        return;
      }

      // Boshqa har qanday noma'lum yo'l uchun 404
      sendJson(res, 404, { error: "Sahifa topilmadi", status: 404 });
    } catch (err) {
      logError("server.request", err);
      sendJson(res, 500, { error: "Server ichki xatoligi" });
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[HTTP SERVER] Bot interfeysi va API port: ${PORT} da ishga tushdi`);
  });

  return server;
}
