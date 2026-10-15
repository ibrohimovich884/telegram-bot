import { sendJson, readBody } from "../../utils/http.js";
import { botState } from "../../bot/state.js";

/**
 * Telegram botini boshqarish marshrutlari (/api/polling/toggle, /api/telegram/reset-webhook, /api/telegram/info)
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} pathname
 */
export async function handleTelegramRoutes(req, res, pathname) {
  // 1. POST /api/polling/toggle -> Polling holatini o'zgartirish (Standby / Active)
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
    return true;
  }

  // 2. POST /api/telegram/reset-webhook -> Webhook va sessiyani tozalash (409 xatosini yechish)
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
    return true;
  }

  // 3. GET /api/telegram/info -> Bot va Webhook holatini Telegram API orqali tekshirish
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
    return true;
  }

  return false;
}

export default handleTelegramRoutes;
