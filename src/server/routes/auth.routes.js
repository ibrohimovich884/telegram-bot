import { sendJson, readBody } from "../../utils/http.js";
import { checkAuth, getExpectedPassword } from "../auth.js";
import { ADMIN_PASSWORD } from "../../config/index.js";

/**
 * Autentifikatsiya marshrutlari (/api/auth/login, /api/auth/verify)
 * Eslatma: Brauzerda tashqi alert / native prompt ochilmasligi uchun hech qanday
 * WWW-Authenticate sarlavhasi yuborilmaydi. Faqat toza JSON qaytariladi.
 * 
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} pathname
 */
export async function handleAuthRoutes(req, res, pathname) {
  const isEnvConfigured = Boolean((process.env.ADMIN_PASSWORD || ADMIN_PASSWORD || "").trim());

  // 1. POST /api/auth/login
  if (req.method === "POST" && pathname === "/api/auth/login") {
    const body = await readBody(req);
    const password = String(body.password || "").trim();
    const expected = getExpectedPassword();

    if (!password) {
      sendJson(res, 400, {
        success: false,
        error: "Parol kiritilmadi",
      });
      return true;
    }

    if (password === expected) {
      sendJson(res, 200, {
        success: true,
        message: "Muvaffaqiyatli kirdingiz",
        isEnvConfigured,
      });
      return true;
    }

    sendJson(res, 401, {
      success: false,
      error: "Noto'g'ri parol. Qaytadan urinib ko'ring.",
      isEnvConfigured,
    });
    return true;
  }

  // 2. GET /api/auth/verify
  if (req.method === "GET" && pathname === "/api/auth/verify") {
    const auth = checkAuth(req);
    sendJson(res, 200, {
      authenticated: auth.ok,
      isEnvConfigured,
    });
    return true;
  }

  return false;
}

export default handleAuthRoutes;
