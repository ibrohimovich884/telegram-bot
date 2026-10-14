import { Bot } from "grammy";
import { BOT_TOKEN, ENABLE_POLLING } from "./config.js";
import { logError } from "./errors.js";
import { sleep } from "./gemini.js";
import { registerHandlers } from "./handlers.js";
import { startServer } from "./server.js";
import { logActivity, setBotInfo } from "./activity.js";
import { botState, setPollingStatus, registerBotController } from "./botState.js";

let shuttingDown = false;
let bot = null;
let activePollingPromise = null;
let isRunnerActive = false;

// 1. HTTP serverni ishga tushirish (Render va AI Studio uchun)
startServer();

// 2. Telegram diagnostika funksiyasi
async function getTelegramDiagnostics() {
  if (!bot && BOT_TOKEN) {
    try {
      bot = new Bot(BOT_TOKEN);
    } catch {
      return null;
    }
  }
  if (!bot) return null;

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

// 3. Webhook va sessiyani tozalash funksiyasi
async function resetWebhook(dropPending = false) {
  if (!bot && BOT_TOKEN) {
    bot = new Bot(BOT_TOKEN);
  }
  if (!bot) throw new Error("Bot yoki BOT_TOKEN mavjud emas");

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
    logError("resetWebhook", err);
    throw err;
  }
}

// 4. Polling'ni to'xtatish (Standby rejim)
async function pausePolling() {
  botState.isPollingEnabled = false;
  setPollingStatus("paused");
  console.log("[POLLING] Standby rejimga o'tkazildi (polling to'xtatildi)");

  logActivity({
    type: "system",
    title: "Polling to'xtatildi (Standby rejim faol)",
    details: "AI Studio polling'ni to'xtatdi. Endi Render serveringiz 409 xatosisiz xabarlarni erkin qabul qiladi.",
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

// 5. Polling'ni qayta yoqish
async function resumePolling() {
  botState.isPollingEnabled = true;
  setPollingStatus("running");
  console.log("[POLLING] Polling qayta yoqilmoqda...");

  logActivity({
    type: "system",
    title: "Polling qayta ishga tushirildi",
    details: "Telegram getUpdates so'rovlari ushbu serverdan yuborilmoqda.",
    status: "ok",
  });

  if (!isRunnerActive) {
    runPollingLoop().catch((err) => logError("runPollingLoop", err));
  }
  return { success: true, status: "running" };
}

// Kontroller funksiyalarini ro'yxatdan o'tkazamiz (server.js API orqali boshqarish uchun)
registerBotController({
  pause: pausePolling,
  resume: resumePolling,
  resetWebhook,
  getDiagnostics: getTelegramDiagnostics,
});

async function runPollingLoop() {
  if (isRunnerActive || shuttingDown) return;
  if (!botState.isPollingEnabled) {
    setPollingStatus("paused");
    return;
  }

  isRunnerActive = true;

  while (!shuttingDown && botState.isPollingEnabled) {
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
          "Agar Render'da ishlashini xohlasangiz, AI Studio'da polling'ni Standby (to'xtatilgan) qilib qo'yishingiz mumkin.\n" +
          "=======================================================\n"
        );

        logActivity({
          type: "conflict",
          title: "Telegram 409 Conflict: Bot boshqa serverda ishlamoqda",
          details: "Render serveringiz hozirda @ibrohimovvvich_bot xabarlarini qabul qilmoqda. Telegram 2 ta nusxani bir vaqtda ishlashiga yo'l qo'ymaydi. Render erkin ishlashi uchun ushbu muhitda Polling'ni to'xtating.",
          status: "warn",
          metadata: { error: errMsg },
        });

        // 409 bo'lganda Render'ni uzib qo'ymaslik uchun 30-40 soniya kutib keyin qayta urinadi
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

async function startBot() {
  if (!BOT_TOKEN) {
    console.warn("[BOT] BOT_TOKEN kiritilmagan. Bot polling to'xtatildi, lekin HTTP server ishlamoqda.");
    setPollingStatus("stopped");
    logActivity({
      type: "system",
      title: "BOT_TOKEN kiritilmagan",
      details: "Telegram polling boshlanmadi. Web interfeys va monitoring faol.",
      status: "warn",
    });
    return;
  }

  try {
    bot = new Bot(BOT_TOKEN);
    registerHandlers(bot);
    // Bot va webhook diagnostika ma'lumotlarini dastlabki olish
    getTelegramDiagnostics().catch(() => {});
  } catch (err) {
    logError("new Bot", err);
    setPollingStatus("error");
    return;
  }

  if (botState.isPollingEnabled) {
    runPollingLoop().catch((err) => logError("runPollingLoop", err));
  } else {
    console.log("[POLLING] ENABLE_POLLING=false tufayli Standby rejimda boshlandi.");
    setPollingStatus("paused");
  }
}

// Render yoki OS to'xtatish signali
const shutdown = async () => {
  shuttingDown = true;
  console.log("To'xtatilmoqda...");
  logActivity({
    type: "system",
    title: "Server to'xtatilmoqda (SIGINT/SIGTERM)",
    details: "Bot jarayoni yakunlanmoqda...",
    status: "warn",
  });
  if (bot && isRunnerActive) {
    try {
      await bot.stop();
    } catch (err) {
      logError("bot.stop", err);
    }
  }
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

startBot();

