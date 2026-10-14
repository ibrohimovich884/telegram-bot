import { Bot } from "grammy";
import { BOT_TOKEN } from "./config.js";
import { logError } from "./errors.js";
import { sleep } from "./gemini.js";
import { registerHandlers } from "./handlers.js";
import { startServer } from "./server.js";

const bot = new Bot(BOT_TOKEN);
registerHandlers(bot);
startServer();

// 409 Conflict (deploy paytida eski nusxa hali o'chmagan bo'lsa) chiqsa,
// bot to'xtab qolmasligi uchun 10 soniyadan keyin qayta ishga tushiriladi
let shuttingDown = false;

async function startBot() {
  while (!shuttingDown) {
    try {
      await bot.start({
        allowed_updates: ["message", "business_connection", "business_message"],
        onStart: (info) => console.log(`Bot ishga tushdi: @${info.username}`),
      });
      return; // bot.stop() chaqirilganda shu yerga keladi
    } catch (err) {
      logError("bot.start", err);
      console.log("[QAYTA] 10 soniyadan keyin qayta ishga tushiriladi");
      await sleep(10000);
    }
  }
}

// Render deploy paytida eski nusxa polling'ni tezroq bo'shatishi uchun
process.on("SIGTERM", async () => {
  shuttingDown = true;
  console.log("SIGTERM: bot to'xtatilmoqda");
  try {
    await bot.stop();
  } catch (err) {
    logError("SIGTERM", err);
  }
  process.exit(0);
});

startBot();
