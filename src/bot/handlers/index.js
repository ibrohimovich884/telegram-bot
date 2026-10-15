import { registerUpdateMiddleware } from "./updates.js";
import { registerBusinessConnectionHandler } from "./businessConnection.js";
import { registerBusinessMessageHandler } from "./businessMessage.js";
import { registerDirectMessageHandler } from "./directMessage.js";
import { logError } from "../../utils/errors.js";

/**
 * Grammy bot instansiyasiga barcha hodisa ishlovchilarini (handlers) ulaydi
 * @param {import("grammy").Bot} bot
 */
export function registerHandlers(bot) {
  // 1. Kelgan barcha yangilanishlarni qayd qilish
  registerUpdateMiddleware(bot);

  // 2. Telegram Business ulanishlari
  registerBusinessConnectionHandler(bot);

  // 3. Biznes xabarlarini qayta ishlash va Gemini AI avto-javob (alohida xotira bilan)
  registerBusinessMessageHandler(bot);

  // 4. Shaxsiy (direct) xabarlarni qayta ishlash (alohida xotira bilan)
  registerDirectMessageHandler(bot);

  // 5. Grammy xatolarini ushlab qolish
  bot.catch((err) => {
    logError("bot.catch", err.error ?? err);
  });
}

export default registerHandlers;
