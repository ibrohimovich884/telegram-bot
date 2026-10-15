import { sendJson } from "../../utils/http.js";
import { getErrors, clearErrors } from "../../utils/errors.js";
import { logActivity } from "../../services/activity.service.js";

/**
 * Xatoliklarni ko'rish va tozalash marshrutlari (/errors, /api/errors, /api/errors/clear)
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} pathname
 */
export async function handleErrorsRoutes(req, res, pathname) {
  // GET /errors yoki GET /api/errors
  if (req.method === "GET" && (pathname === "/errors" || pathname === "/api/errors")) {
    const errors = getErrors();
    sendJson(res, 200, {
      count: errors.length,
      errors,
    });
    return true;
  }

  // POST /api/errors/clear
  if (req.method === "POST" && pathname === "/api/errors/clear") {
    clearErrors();
    logActivity({
      type: "system",
      title: "Xatoliklar jurnali tozalandi",
      details: "Administrator interfeys orqali xatolar jurnalini tozaladi.",
      status: "ok",
    });
    sendJson(res, 200, { success: true, message: "Xatoliklar tozalandi" });
    return true;
  }

  return false;
}

export default handleErrorsRoutes;
