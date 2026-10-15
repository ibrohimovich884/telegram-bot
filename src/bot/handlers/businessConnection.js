import { registerBusinessConnection, logActivity } from "../../services/activity.service.js";

/**
 * Telegram Business hisobiga bot ulanganda yoki uzilganda ishlaydi
 * @param {import("grammy").Bot} bot
 */
export function registerBusinessConnectionHandler(bot) {
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
}

export default registerBusinessConnectionHandler;
