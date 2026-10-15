/**
 * Telegram Business Bot - Asosiy ishga tushirish fayli
 * Yangi modulli arxitektura `src/` katalogida joylashgan.
 */

import { startServer } from "./src/server/index.js";
import { startBot } from "./src/bot/index.js";

// 1. HTTP serverni ishga tushirish (Render va AI Studio uchun)
const server = startServer();

// 2. Telegram botini ishga tushirish
const bot = await startBot();

export { server, bot };
export default { server, bot };
