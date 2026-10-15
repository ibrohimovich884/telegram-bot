import { botState, setPollingStatus } from "./state.js";
import { logActivity, setBotInfo } from "../services/activity.service.js";
import { logError } from "../utils/errors.js";
import { sleep } from "../utils/sleep.js";

let isRunnerActive = false;
let isShuttingDown = false;

export function setShuttingDown(val) {
  isShuttingDown = Boolean(val);
}

export function getIsRunnerActive() {
  return isRunnerActive;
}

/**
 * Polling'ni to'xtatadi (Standby rejim)
 * @param {import("grammy").Bot|null} bot
 */
export async function pausePolling(bot) {
  botState.isPollingEnabled = false;
  setPollingStatus("paused");
  console.log("[POLLING] Standby rejimga o'tkazildi (polling to'xtatildi)");

  logActivity({
    type: "system",
    title: "Polling to'xtatildi (Standby rejim faol)",
    details: "Ushbu serverda polling to'xtatildi. Endi boshqa serveringiz (masalan Render) 409 xatosisiz xabarlarni erkin qabul qiladi.",
    status: "ok",
  });

  if (bot && isRunnerActive) {
    try {
      await bot.stop();
      isRunnerActive = false;
    } catch (err) {
      console.warn("[POLLING] bot.stop xatosi:", err?.message);
    }
  }
  return { success: true, status: "paused" };
}

/**
 * Polling'ni qayta yoqadi
 * @param {import("grammy").Bot|null} bot
 */
export async function resumePolling(bot) {
  botState.isPollingEnabled = true;
  setPollingStatus("running");
  console.log("[POLLING] Polling qayta yoqilmoqda...");

  logActivity({
    type: "system",
    title: "Polling qayta ishga tushirildi",
    details: "Telegram getUpdates so'rovlari ushbu serverdan yuborilmoqda.",
    status: "ok",
  });

  if (!isRunnerActive && bot) {
    runPollingLoop(bot).catch((err) => logError("runPollingLoop", err));
  }
  return { success: true, status: "running" };
}

/**
 * Grammy getUpdates tsikli (409 Conflict aniqlanganda aqlli tanaffus bilan)
 * @param {import("grammy").Bot} bot
 */
export async function runPollingLoop(bot) {
  if (isRunnerActive || isShuttingDown) return;
  if (!botState.isPollingEnabled) {
    setPollingStatus("paused");
    return;
  }

  isRunnerActive = true;

  while (!isShuttingDown && botState.isPollingEnabled) {
    try {
      setPollingStatus("running");

      // Boshlashdan oldin qolib ketgan webhook'larni tozalab olish
      try {
        await bot.api.deleteWebhook({ drop_pending_updates: false });
      } catch {
        // e'tiborsiz qoldiramiz
      }

      await bot.start({
        allowed_updates: ["message", "business_connection", "business_message"],
        onStart: (info) => {
          console.log(`Bot ishga tushdi: @${info.username}`);
          setBotInfo(info);
          botState.botInfo = info;
          botState.conflictMessage = null;
          setPollingStatus("running");

          logActivity({
            type: "bot_start",
            title: `Bot muvaffaqiyatli ishga tushdi: @${info.username}`,
            details: `Telegram serveriga ulandi (ID: ${info.id}). Biznes xabarlarini qabul qilishga tayyor.`,
            status: "ok",
            metadata: { username: info.username, id: info.id },
          });
        },
      });
      break;
    } catch (err) {
      const errMsg = String(err?.message ?? err);
      const isConflict = errMsg.includes("409: Conflict");

      if (isConflict) {
        setPollingStatus("conflict", {
          conflict: true,
          message: "Telegram 409 Conflict: Bot ayni paytda boshqa serverda (masalan, Render yoki kompyuteringizda) ishlamoqda.",
        });

        console.warn(
          "\n=======================================================\n" +
          "[OGOHLANTIRISH 409 CONFLICT] Telegram bir vaqtda faqat bitta getUpdates ulanishiga ruxsat beradi!\n" +
          "Sizning botingiz Render serverida (yoki boshqa joyda) allaqachon ishlab turibdi.\n" +
          "Agar Render'da ishlashini xohlasangiz, ushbu serverda polling'ni Standby (to'xtatilgan) qilib qo'yishingiz mumkin.\n" +
          "=======================================================\n"
        );

        logActivity({
          type: "conflict",
          title: "Telegram 409 Conflict: Bot boshqa serverda ishlamoqda",
          details: "Boshqa serveringiz hozirda bot xabarlarini qabul qilmoqda. Telegram 2 ta nusxani bir vaqtda ishlashiga yo'l qo'ymaydi.",
          status: "warn",
          metadata: { error: errMsg },
        });

        // 409 bo'lganda boshqa serverga xalaqit bermaslik uchun 35 soniya kutib keyin qayta tekshiradi
        const waitSeconds = 35;
        console.log(`[POLLING] ${waitSeconds} soniya tanaffus (boshqa nusxaga xalaqit bermaslik uchun)...`);
        await sleep(waitSeconds * 1000);
      } else {
        logError("bot.start", err);
        setPollingStatus("error", { message: errMsg });
        await sleep(10000);
      }
    }
  }

  isRunnerActive = false;
}

export default {
  runPollingLoop,
  pausePolling,
  resumePolling,
  setShuttingDown,
  getIsRunnerActive,
};
