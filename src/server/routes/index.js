import { sendJson } from "../../utils/http.js";
import { logError } from "../../utils/errors.js";
import { checkAuth } from "../auth.js";
import { handleAuthRoutes } from "./auth.routes.js";
import { handleStatusRoute } from "./status.routes.js";
import { handleActivitiesRoute } from "./activities.routes.js";
import { handleErrorsRoutes } from "./errors.routes.js";
import { handleGeminiTestRoute } from "./gemini.routes.js";
import { handleRenderPingRoute } from "./render.routes.js";
import { handleTelegramRoutes } from "./telegram.routes.js";

/**
 * Barcha API so'rovlarini yo'naltiruvchi bosh router
 * Eslatma: Hech qachon WWW-Authenticate sarlavhasi yuborilmaydi (tashqi alert chiqmasligi uchun)
 * 
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} pathname
 */
export async function dispatchApiRoutes(req, res, pathname) {
  try {
    // 1. Ochiq autentifikatsiya marshrutlari (/api/auth/login, /api/auth/verify)
    if (pathname.startsWith("/api/auth/")) {
      if (await handleAuthRoutes(req, res, pathname)) return true;
    }

    // 2. Qolgan barcha API (/api/* va /errors) uchun veb-interfeys autentifikatsiyasi
    const auth = checkAuth(req);
    if (!auth.ok) {
      sendJson(res, 401, {
        error: "UNAUTHORIZED",
        message: "Kirish ruxsati berilmadi. Veb interfeysda admin parolini kiriting.",
      });
      return true;
    }

    // --- AVTORIZATSIYADAN O'TGAN SO'ROVLAR ---

    // 3. /api/status
    if (pathname === "/api/status") {
      if (handleStatusRoute(req, res)) return true;
    }

    // 4. /api/activities
    if (pathname === "/api/activities") {
      if (handleActivitiesRoute(req, res)) return true;
    }

    // 5. /errors yoki /api/errors*
    if (pathname === "/errors" || pathname.startsWith("/api/errors")) {
      if (await handleErrorsRoutes(req, res, pathname)) return true;
    }

    // 6. /api/test-gemini
    if (pathname === "/api/test-gemini") {
      if (await handleGeminiTestRoute(req, res)) return true;
    }

    // 7. /api/ping-render
    if (pathname === "/api/ping-render") {
      if (await handleRenderPingRoute(req, res)) return true;
    }

    // 8. /api/polling/* yoki /api/telegram/*
    if (pathname.startsWith("/api/polling") || pathname.startsWith("/api/telegram")) {
      if (await handleTelegramRoutes(req, res, pathname)) return true;
    }

    // Noma'lum marshrut -> 404 Not Found
    sendJson(res, 404, { error: "API marshruti topilmadi", status: 404 });
    return true;
  } catch (err) {
    logError("api.dispatch", err);
    sendJson(res, 500, { error: "Server ichki xatoligi", message: err?.message });
    return true;
  }
}

export default dispatchApiRoutes;
