import { Bot } from "grammy";
import { BOT_TOKEN } from "../config/index.js";
import { logError } from "../utils/errors.js";
import { logActivity } from "../services/activity.service.js";
import { botState, setPollingStatus, registerBotController } from "./state.js";
import { registerHandlers } from "./handlers/index.js";
import { runPollingLoop, pausePolling, resumePolling, setShuttingDown, getIsRunnerActive } from "./polling.js";
import { getTelegramDiagnostics, resetTelegramWebhook } from "../services/telegram.service.js";

let bot = null;

export function getBot() {
  return bot;
}

/**
 * Telegram botini sozlash va ishga tushirish
 */
export async function startBot() {
  if (!BOT_TOKEN) {
    console.warn("[BOT] BOT_TOKEN kiritilmagan. Bot polling to'xtatildi, lekin HTTP server ishlamoqda.");
    setPollingStatus("stopped");
    logActivity({
      type: "system",
      title: "BOT_TOKEN kiritilmagan",
      details: "Telegram polling boshlanmadi. Web interfeys va monitoring faol.",
      status: "warn",
    });
    return null;
  }

  try {
    bot = new Bot(BOT_TOKEN);
    registerHandlers(bot);

    // Controller funksiyalarini ro'yxatdan o'tkazamiz
    registerBotController({
      pause: () => pausePolling(bot),
      resume: () => resumePolling(bot),
      resetWebhook: (dropPending) => resetTelegramWebhook(bot, dropPending),
      getDiagnostics: () => getTelegramDiagnostics(bot),
    });

    // Dastlabki diagnostika ma'lumotlarini olish
    getTelegramDiagnostics(bot).catch(() => {});
  } catch (err) {
    logError("startBot.init", err);
    setPollingStatus("error");
    return null;
  }

  if (botState.isPollingEnabled) {
    runPollingLoop(bot).catch((err) => logError("runPollingLoop", err));
  } else {
    console.log("[POLLING] ENABLE_POLLING=false tufayli Standby rejimda boshlandi.");
    setPollingStatus("paused");
  }

  return bot;
}

/**
 * Server yoki jarayon to'xtatilganda toza yopilish
 */
export async function shutdownBot() {
  setShuttingDown(true);
  console.log("Bot to'xtatilmoqda...");
  logActivity({
    type: "system",
    title: "Server to'xtatilmoqda (SIGINT/SIGTERM)",
    details: "Bot jarayoni yakunlanmoqda...",
    status: "warn",
  });

  if (bot && getIsRunnerActive()) {
    try {
      await bot.stop();
    } catch (err) {
      logError("bot.stop", err);
    }
  }
}

process.on("SIGTERM", shutdownBot);
process.on("SIGINT", shutdownBot);

export default {
  startBot,
  getBot,
  shutdownBot,
};
