import { askGemini } from "./gemini.js";
import { logError } from "./errors.js";

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
    const types = Object.keys(ctx.update).filter((k) => k !== "update_id");
    console.log(`[UPDATE] ${new Date().toISOString()} | ${types.join(", ")}`);
    await next();
  });

  bot.on("business_connection", (ctx) => {
    const c = ctx.businessConnection;
    console.log(
      `[ULANISH] user=${c.user.id} faol=${c.is_enabled} javob_berish=${c.can_reply}`
    );
  });

  bot.on("business_message:text", async (ctx) => {
    const connectionId = ctx.msg.business_connection_id;

    try {
      // Egasining o'z xabariga javob bermaymiz
      const ownerId = await getOwnerId(ctx.api, connectionId);
      if (ctx.from.id === ownerId) {
        console.log("[SKIP] egasining o'z xabari");
        return;
      }

      const reply = await askGemini(ctx.msg.text);
      if (!reply) throw new Error("Gemini bo'sh javob qaytardi");

      await ctx.api.sendMessage(ctx.chat.id, reply, {
        business_connection_id: connectionId,
      });
      console.log(`[JAVOB] chat=${ctx.chat.id} yuborildi`);
    } catch (err) {
      logError("business_message", err);
    }
  });

  bot.catch((err) => logError("bot.catch", err.error ?? err));
}
