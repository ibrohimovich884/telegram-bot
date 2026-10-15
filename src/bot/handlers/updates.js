import { stats, logActivity } from "../../services/activity.service.js";

/**
 * Kelgan barcha Telegram update'larini qayd qiluvchi middleware
 * @param {import("grammy").Bot} bot
 */
export function registerUpdateMiddleware(bot) {
  bot.use(async (ctx, next) => {
    stats.totalUpdates++;
    const types = Object.keys(ctx.update).filter((k) => k !== "update_id");
    const typeLabel = types.join(", ");
    console.log(`[UPDATE] ${new Date().toISOString()} | ${typeLabel || "empty"}`);

    logActivity({
      type: "update",
      title: `Telegram hodisasi: ${typeLabel || "noma'lum"}`,
      details: `Update #${ctx.update.update_id} qabul qilindi`,
      status: "ok",
      metadata: { types, updateId: ctx.update.update_id },
    });

    await next();
  });
}

export default registerUpdateMiddleware;
