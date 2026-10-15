import { sendJson, readBody } from "../../utils/http.js";
import { askGemini } from "../../services/gemini.service.js";
import { logActivity } from "../../services/activity.service.js";
import { getUserMemory } from "../../services/memory.service.js";
import { logError } from "../../utils/errors.js";
import { GEMINI_MODEL } from "../../config/index.js";

/**
 * POST /api/test-gemini -> Gemini AI modelini test qilish (individual xotira bilan yoki xotirasiz)
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleGeminiTestRoute(req, res) {
  if (req.method === "POST") {
    const body = await readBody(req);
    const text = String(body.text || "").trim();
    const userId = body.userId ? String(body.userId).trim() : null;
    const userName = body.userName ? String(body.userName).trim() : (userId ? `Sinovchi (${userId})` : null);
    const disableMemory = Boolean(body.disableMemory);

    if (!text) {
      sendJson(res, 400, { success: false, error: "Matn kiritilmadi" });
      return true;
    }

    const t0 = Date.now();
    try {
      const reply = await askGemini(text, {
        userId,
        userName,
        disableMemory,
      });
      const durationMs = Date.now() - t0;

      const userMemory = userId ? getUserMemory(userId) : null;
      const turnsCount = userMemory?.turns?.length || 0;

      logActivity({
        type: "ai_reply",
        title: `Gemini sinovi: javob olindi (${durationMs}ms)${userId ? ` [User: ${userId}]` : ""}`,
        details: `Savol: "${text.slice(0, 50)}" -> Javob: "${reply.slice(0, 80)}" ${userId ? `(Xotirada: ${turnsCount} ta)` : ""}`,
        status: "ok",
        metadata: { durationMs, testText: text, userId, turnsCount },
      });

      sendJson(res, 200, {
        success: true,
        reply,
        durationMs,
        model: GEMINI_MODEL,
        userId,
        turnsCount,
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
