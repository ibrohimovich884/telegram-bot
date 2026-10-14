import { Bot } from "grammy";
import { BOT_TOKEN } from "./config.js";
import { logError } from "./errors.js";
import { sleep } from "./gemini.js";
import { registerHandlers } from "./handlers.js";
import { startServer } from "./server.js";
import { logActivity, setBotInfo } from "./activity.js";

let shuttingDown = false;
let bot = null;

startServer();

async function startBot() {
  if (!BOT_TOKEN) {
    console.warn("[BOT] BOT_TOKEN kiritilmagan. Bot polling to'xtatildi, lekin HTTP server 3000-portda ishlamoqda.");
    logActivity({
      type: "system",
      title: "BOT_TOKEN kiritilmagan",
      details: "Telegram polling boshlanmadi. Web interfeys va monitoring to'liq faol.",
      status: "warn",
    });
    return;
  }

  try {
    bot = new Bot(BOT_TOKEN);
    registerHandlers(bot);
  } catch (err) {
    logError("new Bot", err);
    return;
  }

  while (!shuttingDown) {
    try {
      await bot.start({
        allowed_updates: ["message", "business_connection", "business_message"],
        onStart: (info) => {
          console.log(`Bot ishga tushdi: @${info.username}`);
          setBotInfo(info);
          logActivity({
            type: "bot_start",
            title: `Bot muvaffaqiyatli ishga tushdi: @${info.username}`,
            details: `Telegram serveriga ulandi (ID: ${info.id}). Biznes xabarlarini qabul qilishga tayyor.`,
            status: "ok",
            metadata: { username: info.username, id: info.id },
          });
        },
      });
      return; // bot.stop() chaqirilganda shu yerga keladi
    } catch (err) {
      const errMsg = String(err?.message ?? err);
      const isConflict = errMsg.includes("409: Conflict");
      if (isConflict) {
        logActivity({
          type: "system",
          title: "Telegram Polling To'qnashuvi (409 Conflict)",
          details: "Boshqa nusxa (Render serveringiz) hozirda xabarlarni qabul qilmoqda. Telegram bir vaqtda faqat bitta faol nusxaga ruxsat beradi.",
          status: "warn",
        });
      }
      logError("bot.start", err);
      const waitSeconds = isConflict ? 25 : 10;
      console.log(`[QAYTA] ${waitSeconds} soniyadan keyin qayta uriniladi...`);
      await sleep(waitSeconds * 1000);
    }
  }
}

// Render deploy paytida eski nusxa polling'ni tezroq bo'shatishi uchun
const shutdown = async () => {
  shuttingDown = true;
  console.log("To'xtatilmoqda...");
  logActivity({
    type: "system",
    title: "Server to'xtatilmoqda (SIGINT/SIGTERM)",
    details: "Bot jarayoni yakunlanmoqda...",
    status: "warn",
  });
  if (bot) {
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
