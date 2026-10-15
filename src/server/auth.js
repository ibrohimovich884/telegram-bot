import { ADMIN_PASSWORD } from "../config/index.js";

/**
 * Kutilayotgan administrator parolini qaytaradi.
 * Agar ADMIN_PASSWORD belgilanmagan bo'lsa, xavfsiz sukutiy parol 'admin123' ishlatiladi.
 * @returns {string}
 */
export function getExpectedPassword() {
  const envPass = (process.env.ADMIN_PASSWORD || ADMIN_PASSWORD || "").trim();
  return envPass || "admin123";
}

/**
 * Administrator paroli va sessiyasini tekshirish (faqat web interfeys orqali)
 * Hech qanday tashqi browser alert / WWW-Authenticate chaqirilmaydi.
 * 
 * @param {import("node:http").IncomingMessage} req
 * @returns {{ ok: boolean, status?: number, reason?: string }}
 */
export function checkAuth(req) {
  const expected = getExpectedPassword();

  // 1. To'g'ridan-to'g'ri header orqali parol (x-admin-password)
  const xAdminPass = req.headers["x-admin-password"];
  if (xAdminPass && String(xAdminPass).trim() === expected) {
    return { ok: true };
  }

  // 2. Bearer token varianti (Authorization: Bearer <parol>)
  const authHeader = req.headers["authorization"] || "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token === expected) {
      return { ok: true };
    }
  }

  // 3. Maxsus cookie varianti bo'lsa
  const cookieHeader = req.headers["cookie"] || "";
  const match = cookieHeader.match(/admin_token=([^;]+)/);
  if (match && decodeURIComponent(match[1]).trim() === expected) {
    return { ok: true };
  }

  return { ok: false, status: 401, reason: "UNAUTHORIZED" };
}

export default checkAuth;
