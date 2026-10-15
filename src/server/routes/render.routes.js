import { sendJson } from "../../utils/http.js";
import { pingRender } from "../../services/render.service.js";

/**
 * POST /api/ping-render -> SSRF-himoyalangan Render serverini tekshirish
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleRenderPingRoute(req, res) {
  if (req.method === "POST") {
    const pingResult = await pingRender();
    sendJson(res, 200, pingResult);
    return true;
  }
  return false;
}

export default handleRenderPingRoute;
