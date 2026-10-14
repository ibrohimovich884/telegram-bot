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

  // 1. Agar ADMIN_PASSWORD belgilanmagan bo'lsa: 503 bilan himoyalangan
  if (!adminPassword) {
    return { ok: false, status: 503, reason: "ADMIN_PASSWORD_NOT_CONFIGURED" };
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

// ADMIN_PASSWORD belgilanmaganda ko'rsatiladigan 503 HTML sahifasi
function render503Page() {
  return `<!DOCTYPE html>
<html lang="uz" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>503 - Dashboard Himoyalangan</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-[#090d16] text-slate-200 flex items-center justify-center p-4 font-sans">
  <div class="max-w-md w-full p-8 rounded-2xl bg-[#111726] border border-amber-500/30 shadow-2xl space-y-4 text-center">
    <div class="w-12 h-12 mx-auto rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-xl">
      &#128274;
    </div>
    <h1 class="text-xl font-bold text-white tracking-tight">Dashboard Himoyalangan (503)</h1>
    <p class="text-xs text-slate-400 leading-relaxed">
      Xavfsizlik maqsadida boshqaruv paneli va API'lar yopiq. Serveringiz (<strong class="text-slate-300">Render Environment</strong>) sozlamalariga <code class="px-1.5 py-0.5 rounded bg-surface-canvas text-amber-400 font-mono">ADMIN_PASSWORD</code> o'zgaruvchisini qo'shing.
    </p>
    <div class="p-3 rounded-lg bg-[#090d16] border border-slate-800 text-left text-xs space-y-1">
      <div class="text-slate-400">&#10003; Telegram Bot faoliyat yuritmoqda</div>
      <div class="text-slate-400">&#10003; <a href="/health" class="text-sky-400 underline">/health</a> UptimeRobot uchun ochiq</div>
    </div>
  </div>
</body>
</html>`;
}

// 401 Unauthorized HTML sahifasi (foydalanuvchi Basic Auth oynasini bekor qilganda)
function render401Page() {
  return `<!DOCTYPE html>
<html lang="uz" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>401 - Ruxsat Berilmadi</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-[#090d16] text-slate-200 flex items-center justify-center p-4 font-sans">
  <div class="max-w-md w-full p-8 rounded-2xl bg-[#111726] border border-rose-500/30 shadow-2xl space-y-4 text-center">
    <div class="w-12 h-12 mx-auto rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center font-bold text-xl">
      &#128683;
    </div>
    <h1 class="text-xl font-bold text-white tracking-tight">401 - Ruxsat Berilmadi</h1>
    <p class="text-xs text-slate-400 leading-relaxed">
      Dashboard va API'dan foydalanish uchun administrator paroli kiritilishi shart. Sahifani yangilab (F5), parolni qaytadan kiriting.
    </p>
    <button onclick="window.location.reload()" class="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-500 transition-colors">
      Qayta urinish
    </button>
  </div>
</body>
</html>`;
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
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
        polling: botState.pollingStatus,
        adminPasswordConfigured: Boolean((process.env.ADMIN_PASSWORD || ADMIN_PASSWORD || "").trim()),
      });
      return;
    }

    // Barcha boshqa yo'llar (/api/*, /errors, /, /index.html) uchun avtorizatsiyani tekshiramiz
    const auth = checkAuth(req);
    const isHtmlRequest =
      pathname === "/" ||
      pathname === "/index.html" ||
      (req.headers.accept && req.headers.accept.includes("text/html"));

    if (!auth.ok) {
      // Agar ADMIN_PASSWORD belgilanmagan bo'lsa -> 503
      if (auth.status === 503) {
        if (isHtmlRequest) {
          res.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
          res.end(render503Page());
          return;
        }
        sendJson(res, 503, {
          error: "Dashboard yopiq: ADMIN_PASSWORD belgilanmagan",
          code: "ADMIN_PASSWORD_REQUIRED",
          message: "Render (yoki .env) Environment sozlamalariga ADMIN_PASSWORD qo'shing. /health ochiq.",
          health: "/health",
        });
        return;
      }

      // Agar parol noto'g'ri yoki kiritilmagan bo'lsa -> 401 (WWW-Authenticate bilan brauzerda oyna chiqaradi)
      const wwwAuthHeader = {
        "WWW-Authenticate": 'Basic realm="Telegram Bot Admin Dashboard", charset="UTF-8"',
      };

      if (isHtmlRequest) {
        res.writeHead(401, {
          "Content-Type": "text/html; charset=utf-8",
          ...wwwAuthHeader,
        });
        res.end(render401Page());
        return;
      }

      sendJson(res, 401, {
        error: "Ruxsat berilmadi: Parol kiritilmadi yoki noto'g'ri (401 Unauthorized)",
        status: 401,
      }, wwwAuthHeader);
      return;
    }

    // --- AVTORIZATSIYADAN O'TGAN SO'ROVLAR ---
    try {
      // 1. /api/status -> Jonli tizim holati va 409 diagnostikasi
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
          details: "Administrator interfeys orqali xatolar jurnalini tozaladi.",
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

      // 6. /api/ping-render -> SSRF himoyalangan: faqat o'z Render manzilini tekshiradi
      if (req.method === "POST" && pathname === "/api/ping-render") {
        const pingResult = await pingRender();
        sendJson(res, 200, pingResult);
        return;
      }

      // 6a. /api/polling/toggle -> Polling holatini o'zgartirish (Standby / Active)
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

      // 6b. /api/telegram/reset-webhook -> Webhook va sessiyani tozalash (409 xatosini yechish)
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

      // 6c. /api/telegram/info -> Bot va Webhook holatini Telegram API orqali tekshirish
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

      // Fallback
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
