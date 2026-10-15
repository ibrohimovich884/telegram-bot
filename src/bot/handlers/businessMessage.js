import { askGemini } from "../../services/gemini.service.js";
import { logError } from "../../utils/errors.js";
import { stats, logActivity } from "../../services/activity.service.js";

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
 * Telegram Business mijozlaridan kelgan matnli xabarlarni qayta ishlash
 * @param {import("grammy").Bot} bot
 */
export function registerBusinessMessageHandler(bot) {
  bot.on("business_message:text", async (ctx) => {
    stats.businessMessages++;
    const connectionId = ctx.msg.business_connection_id;
    const incomingText = ctx.msg.text || "";
    const sender = ctx.from?.first_name || (ctx.from?.username ? `@${ctx.from.username}` : `ID: ${ctx.from?.id}`);

    try {
      // 1. Akkaunt egasining o'z xabariga javob bermaymiz
      const ownerId = await getOwnerId(ctx.api, connectionId);
      if (ctx.from?.id === ownerId) {
        console.log("[SKIP] egasining o'z xabari");
        logActivity({
          type: "message_skip",
          title: "Egasining o'z xabari (o'tkazib yuborildi)",
          details: `Egasi: ${sender} | Matn: "${incomingText.slice(0, 60)}"`,
          status: "ok",
        });
        return;
      }

      // 2. Mijozdan xabar kelganini jurnalga kiritamiz
      logActivity({
        type: "incoming_message",
        title: `Mijozdan yangi xabar: ${sender}`,
        details: `"${incomingText.slice(0, 80)}" (Chat: ${ctx.chat.id})`,
        status: "ok",
      });

      // 3. Gemini AI'dan javob so'raymiz
      const startTime = Date.now();
      const reply = await askGemini(incomingText);
      const durationMs = Date.now() - startTime;

      if (!reply) {
        throw new Error("Gemini bo'sh javob qaytardi");
      }

      // 4. Javobni Telegram orqali biznes mijozga yuboramiz
      await ctx.api.sendMessage(ctx.chat.id, reply, {
        business_connection_id: connectionId,
      });

      stats.geminiReplies++;
      console.log(`[JAVOB] chat=${ctx.chat.id} yuborildi (${durationMs}ms)`);

      logActivity({
        type: "ai_reply",
        title: `Gemini AI muvaffaqiyatli javob yubordi (${durationMs}ms)`,
        details: `Javob: "${reply.slice(0, 90)}"`,
        status: "ok",
        metadata: { durationMs, replyPreview: reply.slice(0, 150) },
      });
    } catch (err) {
      logError("business_message", err);
    }
  });
}

export default registerBusinessMessageHandler;
