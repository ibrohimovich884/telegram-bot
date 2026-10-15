import { sendJson } from "../../utils/http.js";
import { botState } from "../../bot/state.js";
import { ADMIN_PASSWORD } from "../../config/index.js";

/**
 * /health -> Ochiq monitoring marshruti (UptimeRobot, Render health check uchun, parol talab qilinmaydi)
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export function handleHealthRoute(req, res) {
  if (req.method === "GET") {
    sendJson(res, 200, {
      status: "ok",
      service: "telegram-business-bot",
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      polling: botState.pollingStatus,
      adminPasswordConfigured: Boolean((process.env.ADMIN_PASSWORD || ADMIN_PASSWORD || "").trim()),
    });
    return true;
  }
  return false;
}

export default handleHealthRoute;
