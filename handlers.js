import { askGemini } from "./gemini.js";
import { logError } from "./errors.js";
import { logActivity, stats, registerBusinessConnection } from "./activity.js";

// business_connection_id -> akkaunt egasining ID si
const ownerCache = new Map();

async function getOwnerId(api, connectionId) {
  if (ownerCache.has(connectionId)) return ownerCache.get(connectionId);
  const conn = await api.getBusinessConnection(connectionId);
  ownerCache.set(connectionId, conn.user.id);
  return conn.user.id;
}

export function registerHandlers(bot) {
  // Kelgan har bir update turini logga yozamiz
  bot.use(async (ctx, next) => {
    stats.totalUpdates++;
    const types = Object.keys(ctx.update).filter((k) => k !== "update_id");
    const typeLabel = types.join(", ");
    console.log(`[UPDATE] ${new Date().toISOString()} | ${typeLabel}`);

    logActivity({
      type: "update",
      title: `Telegram hodisasi: ${typeLabel || "nomalum"}`,
      details: `Update #${ctx.update.update_id} qabul qilindi`,
      status: "ok",
      metadata: { types, updateId: ctx.update.update_id },
    });

    await next();
  });

  bot.on("business_connection", (ctx) => {
    const c = ctx.businessConnection;
    console.log(
      `[ULANISH] user=${c.user.id} faol=${c.is_enabled} javob_berish=${c.can_reply}`
    );

    registerBusinessConnection(c);

    logActivity({
      type: "connection",
      title: `Biznes ulanish ${c.is_enabled ? "faollashtirildi" : "to'xtatildi"}`,
      details: `Foydalanuvchi: ${c.user.first_name || ""} (@${c.user.username || c.user.id}) | Javob berish: ${c.can_reply ? "Mumkin" : "Taqiqlangan"}`,
      status: c.is_enabled ? "ok" : "warn",
      metadata: {
        userId: c.user.id,
        isEnabled: c.is_enabled,
        canReply: c.can_reply,
      },
    });
  });

  bot.on("business_message:text", async (ctx) => {
    stats.businessMessages++;
    const connectionId = ctx.msg.business_connection_id;
    const incomingText = ctx.msg.text || "";
    const sender = ctx.from.first_name || `@${ctx.from.username}` || `ID: ${ctx.from.id}`;

    try {
      // Egasining o'z xabariga javob bermaymiz
      const ownerId = await getOwnerId(ctx.api, connectionId);
      if (ctx.from.id === ownerId) {
        console.log("[SKIP] egasining o'z xabari");
        logActivity({
          type: "message_skip",
          title: "Egasining o'z xabari (o'tkazib yuborildi)",
          details: `Egasi: ${sender} | Matn: "${incomingText.slice(0, 60)}"`,
          status: "ok",
        });
        return;
      }

      logActivity({
        type: "incoming_message",
        title: `Mijozdan yangi xabar: ${sender}`,
        details: `"${incomingText.slice(0, 80)}" (Chat: ${ctx.chat.id})`,
        status: "ok",
      });

      const startTime = Date.now();
      const reply = await askGemini(incomingText);
      const durationMs = Date.now() - startTime;

      if (!reply) throw new Error("Gemini bo'sh javob qaytardi");

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

  bot.catch((err) => logError("bot.catch", err.error ?? err));
}
