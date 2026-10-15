import { BOT_TOKEN } from "../config/index.js";
import { botState } from "../bot/state.js";
import { logActivity, setBotInfo } from "./activity.service.js";
import { logError } from "../utils/errors.js";

/**
 * Telegram diagnostika ma'lumotlarini (getMe va getWebhookInfo) oladi
 * @param {import("grammy").Bot} bot
 * @returns {Promise<{ me: object, webhook: object }|null>}
 */
export async function getTelegramDiagnostics(bot) {
  if (!bot && !BOT_TOKEN) return null;

  try {
    const [me, webhook] = await Promise.all([
      bot.api.getMe(),
      bot.api.getWebhookInfo(),
    ]);
    botState.botInfo = me;
    botState.webhookInfo = webhook;
    setBotInfo(me);
    return { me, webhook };
  } catch (err) {
    console.error("[TELEGRAM DIAG] Ma'lumot olishda xato:", err?.message);
    return null;
  }
}

/**
 * Telegram webhook va sessiyasini tozalaydi (409 Conflict yechimi)
 * @param {import("grammy").Bot} bot
 * @param {boolean} [dropPending=false]
 * @returns {Promise<object>}
 */
export async function resetTelegramWebhook(bot, dropPending = false) {
  if (!bot) {
    throw new Error("Bot yoki BOT_TOKEN mavjud emas");
  }

  try {
    await bot.api.deleteWebhook({ drop_pending_updates: dropPending });
    logActivity({
      type: "system",
      title: "Telegram sessiya / Webhook tozalandi",
      details: dropPending
        ? "deleteWebhook(drop_pending_updates=true) bajarildi. Barcha to'plangan navbat va qulflar bo'shatildi."
        : "deleteWebhook() bajarildi.",
      status: "ok",
    });
    return { success: true, dropPending };
  } catch (err) {
    logError("resetTelegramWebhook", err);
    throw err;
  }
}

export default {
  getTelegramDiagnostics,
  resetTelegramWebhook,
};
