import { askGemini } from "../../services/gemini.service.js";
import { logError } from "../../utils/errors.js";
import { stats, logActivity } from "../../services/activity.service.js";
import { clearUserMemory, getUserMemory } from "../../services/memory.service.js";

/**
 * Botga to'g'ridan-to'g'ri yuborilgan shaxsiy xabarlarni qayta ishlash.
 * Bu yerda ham har bir foydalanuvchi uchun alohida xotira ishlaydi.
 * 
 * @param {import("grammy").Bot} bot
 */
export function registerDirectMessageHandler(bot) {
  // Faqat shaxsiy (private) xabarlarni qayta ishlaymiz
  bot.chatType("private").on("message:text", async (ctx) => {
    // Agar bu update allaqachon boshqa maxsus handler tomonidan olingan bo'lsa
    const incomingText = ctx.msg.text || "";
    const userId = String(ctx.from?.id);
    const firstName = ctx.from?.first_name || "";
    const lastName = ctx.from?.last_name || "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const username = ctx.from?.username ? `@${ctx.from.username}` : "";
    const sender = fullName || username || `Foydalanuvchi #${userId}`;

    try {
      // 1. /start buyrug'i
      if (incomingText.startsWith("/start")) {
        const greeting = [
          `👋 Assalomu alaykum, ${sender}!`,
          ``,
          `🤖 Men Telegram Business yordamchi botiman.`,
          `🧠 Yangi funksiya: Men har bir foydalanuvchini alohida xotirada eslab qolaman!`,
          `🔒 Siz aytgan barcha ma'lumotlar faqat siz uchun saqlanadi va boshqa foydalanuvchilarga mutlaqo aralashmaydi.`,
          ``,
          `📌 Foydali buyruqlar:`,
          `• Savolingizni shunchaki yozing - sun'iy intellekt javob beradi.`,
          `• /clear yoki /tozala - hozirgi suhbat xotirasini yangilash.`,
        ].join("\n");

        await ctx.reply(greeting);
        return;
      }

      // 2. /clear, /reset, /tozala buyruqlari
      const cleanCmd = incomingText.trim().toLowerCase();
      if (["/clear", "/reset", "/tozala", "/yangi"].includes(cleanCmd)) {
        clearUserMemory(userId);
        logActivity({
          type: "memory_clear",
          title: `Shaxsiy chat xotirasi tozalandi: ${sender}`,
          details: `Foydalanuvchi (${userId}) shaxsiy chatida xotirani tozaladi.`,
          status: "ok",
          metadata: { userId, sender },
        });

        await ctx.reply("✨ Siz bilan bo'lgan suhbat xotirasi tozalandi. Yangi mavzuni boshlashingiz mumkin!");
        return;
      }

      // 3. Normal matnli xabar kelganda
      const currentMemory = getUserMemory(userId);
      const prevTurns = currentMemory?.turns?.length || 0;

      logActivity({
        type: "incoming_message",
        title: `Shaxsiy chatdan xabar: ${sender}`,
        details: `"${incomingText.slice(0, 80)}" (Xotirada: ${prevTurns} ta xabar)`,
        status: "ok",
        metadata: { userId, sender, prevTurns },
      });

      const t0 = Date.now();
      const reply = await askGemini(incomingText, {
        userId,
        userName: sender,
        username,
        chatId: ctx.chat.id,
      });
      const durationMs = Date.now() - t0;

      if (!reply) {
        throw new Error("Gemini bo'sh javob qaytardi");
      }

      await ctx.reply(reply);
      stats.geminiReplies++;

      logActivity({
        type: "ai_reply",
        title: `Gemini shaxsiy chatga javob berdi (${durationMs}ms)`,
        details: `Javob: "${reply.slice(0, 80)}" [${sender}]`,
        status: "ok",
        metadata: { durationMs, userId, replyPreview: reply.slice(0, 150) },
      });
    } catch (err) {
      logError("direct_message", err);
      try {
        await ctx.reply("Kechirasiz, javob tayyorlashda xatolik yuz berdi. Iltimos, birozdan so'ng qayta urinib ko'ring.");
      } catch (_) {}
    }
  });
}

export default registerDirectMessageHandler;
