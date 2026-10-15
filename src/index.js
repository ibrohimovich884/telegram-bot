import { startServer } from "./server/index.js";
import { startBot } from "./bot/index.js";

// 1. HTTP serverni ishga tushirish (Web Dashboard & API)
const server = startServer();

// 2. Telegram botini ishga tushirish
const bot = await startBot();

export { server, bot };
export default { server, bot };
