import { sendJson, readBody } from "../../utils/http.js";
import { botState } from "../../bot/state.js";
import { getBot } from "../../bot/index.js";
import { findUserMemoryByUsername, getUserMemory, addModelTurn } from "../../services/memory.service.js";
import { logActivity } from "../../services/activity.service.js";

/**
 * Telegram botini boshqarish marshrutlari
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

  // 3. POST /api/telegram/send-custom-message -> Bot nomidan unga interfeysdan xabar yuborish
  if (req.method === "POST" && pathname === "/api/telegram/send-custom-message") {
    const body = await readBody(req);
    const username = body.username ? String(body.username).trim() : null;
    const chatId = body.chatId ? String(body.chatId).trim() : null;
    const userId = body.userId ? String(body.userId).trim() : null;
    const text = body.text ? String(body.text).trim() : null;

    if (!text) {
      sendJson(res, 400, { success: false, error: "Xabar matni kiritilmadi" });
      return true;
    }

    let target = chatId || userId;
    let memoryUser = userId ? getUserMemory(userId) : null;

    if (!target && username) {
      memoryUser = findUserMemoryByUsername(username);
      if (memoryUser && memoryUser.chatId) {
        target = memoryUser.chatId;
      } else {
        target = username.startsWith("@") ? username : "@" + username;
      }
    }

    if (!target) {
      sendJson(res, 400, { success: false, error: "Target (Chat ID yoki Username) topilmadi" });
      return true;
    }

    const bot = getBot();
    if (!bot) {
      sendJson(res, 500, { success: false, error: "Telegram bot ishga tushmagan" });
      return true;
    }

    await bot.api.sendMessage(target, text);

    if (memoryUser) {
      addModelTurn(memoryUser.userId, text, { model: "admin-manual" });
    }

    logActivity({
      type: "ai_reply",
      title: `Admin bot nomidan xabar yubordi: ${target}`,
      details: `"${text.slice(0, 80)}"`,
      status: "ok",
      metadata: { target, text: text.slice(0, 100) },
    });

    sendJson(res, 200, {
      success: true,
      message: "Xabar muvaffaqiyatli yuborildi",
      target,
    });
    return true;
  }

  // 4. GET /api/telegram/info -> Bot va Webhook holatini Telegram API orqali tekshirish
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
