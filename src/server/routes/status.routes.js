import { sendJson } from "../../utils/http.js";
import { getStats } from "../../services/activity.service.js";
import { getMemoryStats } from "../../services/memory.service.js";
import { botState } from "../../bot/state.js";
import {
  PORT,
  BOT_TOKEN,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  SYSTEM_PROMPT,
  RENDER_EXTERNAL_URL,
} from "../../config/index.js";

/**
 * GET /api/status -> Jonli tizim holati, bot parametrlari, xotira va diagnostika
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export function handleStatusRoute(req, res) {
  if (req.method === "GET") {
    const statsData = getStats();
    const memoryStats = getMemoryStats();

    sendJson(res, 200, {
      status: "online",
      ...statsData,
      memoryStats,
      nodeVersion: process.version,
      platform: process.platform,
      botConfig: {
        hasBotToken: Boolean(BOT_TOKEN),
        hasGeminiKey: Boolean(GEMINI_API_KEY),
        geminiModel: GEMINI_MODEL,
        systemPrompt: SYSTEM_PROMPT,
        renderUrl: RENDER_EXTERNAL_URL,
        port: PORT,
        authEnabled: true,
      },
      polling: {
        enabled: botState.isPollingEnabled,
        status: botState.pollingStatus,
        conflictCount: botState.conflictCount,
        lastConflictAt: botState.lastConflictAt,
        conflictMessage: botState.conflictMessage,
      },
      telegram: {
        botInfo: botState.botInfo,
        webhookInfo: botState.webhookInfo,
      },
      stats: {
        totalUpdates: statsData.totalUpdates,
        businessMessages: statsData.businessMessages,
        geminiReplies: statsData.geminiReplies,
        errorsCount: statsData.errorsCount,
        lastActivityAt: statsData.lastActivityAt,
        botUsername: statsData.botUsername || botState.botInfo?.username,
      },
    });
    return true;
  }
  return false;
}

export default handleStatusRoute;
