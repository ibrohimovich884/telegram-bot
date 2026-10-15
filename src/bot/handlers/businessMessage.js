import { askGemini } from "../../services/gemini.service.js";
import { logError } from "../../utils/errors.js";
import { stats, logActivity } from "../../services/activity.service.js";
import { clearUserMemory, getUserMemory } from "../../services/memory.service.js";

// business_connection_id -> akkaunt egasining ID si
const ownerCache = new Map();

async function getOwnerId(api, connectionId) {
  if (ownerCache.has(connectionId)) {
    return ownerCache.get(connectionId);
  }
  const conn = await api.getBusinessConnection(connectionId);
  ownerCache.set(connectionId, conn.user.id);
  return conn.user.id;
}

/**
 * Telegram Business mijozlaridan kelgan matnli xabarlarni qayta ishlash.
 * Har bir mijoz uchun alohida intellektual xotira (Gemini AI multi-turn memory) ishlatiladi.
 * 
 * @param {import("grammy").Bot} bot
 */
export function registerBusinessMessageHandler(bot) {
  bot.on("business_message:text", async (ctx) => {
    stats.businessMessages++;
    const connectionId = ctx.msg.business_connection_id;
    const incomingText = ctx.msg.text || "";
    const userId = String(ctx.from?.id);
    const firstName = ctx.from?.first_name || "";
    const lastName = ctx.from?.last_name || "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const username = ctx.from?.username ? `@${ctx.from.username}` : "";
    const sender = fullName || username || `Mijoz #${userId}`;

    try {
      // 1. Akkaunt egasining o'z xabariga javob bermaymiz
      const ownerId = await getOwnerId(ctx.api, connectionId);
      if (ctx.from?.id === ownerId) {
        console.log("[SKIP] Egasining o'z xabari");
        logActivity({
          type: "message_skip",
          title: "Egasining o'z xabari (o'tkazib yuborildi)",
          details: `Egasi: ${sender} | Matn: "${incomingText.slice(0, 60)}"`,
          status: "ok",
        });
        return;
      }

      // 2. Xotirani tozalash buyruqlari (/clear, /reset, /tozala, /yangi)
      const cleanCmd = incomingText.trim().toLowerCase();
      if (["/clear", "/reset", "/tozala", "/yangi"].includes(cleanCmd)) {
        clearUserMemory(userId);
        logActivity({
          type: "memory_clear",
          title: `Suhbat xotirasi tozalandi: ${sender}`,
          details: `Foydalanuvchi (${userId}) buyruq yubordi: "${cleanCmd}". Shaxsiy xotirasi tozalandi.`,
          status: "ok",
          metadata: { userId, sender },
        });

        await ctx.api.sendMessage(
          ctx.chat.id,
          "Siz bilan bo'lgan suhbat xotirasi muvaffaqiyatli tozalandi. Yangi savolingizni berishingiz mumkin!",
          { business_connection_id: connectionId }
        );
        return;
      }

      // 3. Mijozdan xabar kelganini jurnalga qayd qilish
      const currentMemory = getUserMemory(userId);
      const prevTurnsCount = currentMemory?.turns?.length || 0;

      logActivity({
        type: "incoming_message",
        title: `Mijozdan yangi xabar: ${sender}`,
        details: `"${incomingText.slice(0, 80)}" (Chat: ${ctx.chat.id}, Oldingi xotira: ${prevTurnsCount} ta xabar)`,
        status: "ok",
        metadata: { userId, sender, prevTurnsCount },
      });

      // 4. Gemini AI'dan individual xotira bilan javob so'raymiz
      const startTime = Date.now();
      const reply = await askGemini(incomingText, {
        userId,
        userName: sender,
        username,
        chatId: ctx.chat.id,
      });
      const durationMs = Date.now() - startTime;

      if (!reply) {
        throw new Error("Gemini bo'sh javob qaytardi");
      }

      // 5. Javobni Telegram orqali biznes mijozga yuboramiz
      await ctx.api.sendMessage(ctx.chat.id, reply, {
        business_connection_id: connectionId,
      });

      stats.geminiReplies++;
      console.log(`[JAVOB] chat=${ctx.chat.id} userId=${userId} yuborildi (${durationMs}ms)`);

      const updatedMemory = getUserMemory(userId);
      const totalTurnsNow = updatedMemory?.turns?.length || 0;

      logActivity({
        type: "ai_reply",
        title: `Gemini AI javob berdi (${durationMs}ms) [${sender}]`,
        details: `Javob: "${reply.slice(0, 90)}" | Xotirada: ${totalTurnsNow} ta xabar`,
        status: "ok",
        metadata: {
          durationMs,
          userId,
          totalTurns: totalTurnsNow,
          replyPreview: reply.slice(0, 150),
        },
      });
    } catch (err) {
      logError("business_message", err);
    }
  });
}

export default registerBusinessMessageHandler;
