import { sendJson, readBody } from "../../utils/http.js";
import { askGemini } from "../../services/gemini.service.js";
import { logActivity } from "../../services/activity.service.js";
import { logError } from "../../utils/errors.js";
import { GEMINI_MODEL } from "../../config/index.js";

/**
 * POST /api/test-gemini -> Gemini AI modelini test qilish
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleGeminiTestRoute(req, res) {
  if (req.method === "POST") {
    const body = await readBody(req);
    const text = String(body.text || "").trim();

    if (!text) {
      sendJson(res, 400, { success: false, error: "Matn kiritilmadi" });
      return true;
    }

    const t0 = Date.now();
    try {
      const reply = await askGemini(text);
      const durationMs = Date.now() - t0;

      logActivity({
        type: "ai_reply",
        title: `Gemini sinovi: javob olindi (${durationMs}ms)`,
        details: `Sinov savoli: "${text.slice(0, 50)}" -> Javob: "${reply.slice(0, 80)}"`,
        status: "ok",
        metadata: { durationMs, testText: text },
      });

      sendJson(res, 200, {
        success: true,
        reply,
        durationMs,
        model: GEMINI_MODEL,
      });
    } catch (err) {
      const durationMs = Date.now() - t0;
      logError("test-gemini", err);
      sendJson(res, 500, {
        success: false,
        error: err?.message || "Gemini javob qaytara olmadi",
        durationMs,
      });
    }
    return true;
  }
  return false;
}

export default handleGeminiTestRoute;
