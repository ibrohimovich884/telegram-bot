import { sendJson, readBody } from "../../utils/http.js";
import {
  getAllMemoriesSummary,
  getMemoryStats,
  getUserMemory,
  clearUserMemory,
  clearAllMemories,
} from "../../services/memory.service.js";
import { logActivity } from "../../services/activity.service.js";

/**
 * Xotira API marshrutlarini boshqarish:
 * - GET /api/memory -> Barcha foydalanuvchilar xotirasi xulosasi va statistikasi
 * - GET /api/memory?userId=... -> Aniq bitta foydalanuvchining to'liq dialog xabarlari
 * - POST /api/memory/clear -> Foydalanuvchi yoki barcha xotiralarni tozalash
 * 
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} pathname
 */
export async function handleMemoryRoutes(req, res, pathname) {
  // 1. GET /api/memory
  if (req.method === "GET" && (pathname === "/api/memory" || pathname === "/api/memory/list")) {
    const url = new URL(req.url, "http://localhost");
    const userId = url.searchParams.get("userId");

    if (userId) {
      const userMemory = getUserMemory(userId);
      if (!userMemory) {
        sendJson(res, 404, {
          success: false,
          error: "Foydalanuvchi xotirasi topilmadi",
          userId,
        });
        return true;
      }
      sendJson(res, 200, {
        success: true,
        user: userMemory,
      });
      return true;
    }

    const stats = getMemoryStats();
    const users = getAllMemoriesSummary();

    sendJson(res, 200, {
      success: true,
      stats,
      users,
    });
    return true;
  }

  // 2. POST /api/memory/clear
  if (req.method === "POST" && pathname === "/api/memory/clear") {
    const body = await readBody(req);
    const userId = body.userId ? String(body.userId).trim() : null;
    const isAll = Boolean(body.all);

    if (isAll) {
      const clearedCount = clearAllMemories();
      logActivity({
        type: "memory_clear",
        title: "Barcha foydalanuvchilar xotirasi tozalandi",
        details: `Administrator veb-interfeys orqali barcha (${clearedCount} ta) foydalanuvchi xotirasini tozaladi.`,
        status: "ok",
      });
      sendJson(res, 200, {
        success: true,
        message: `Barcha (${clearedCount} ta) foydalanuvchi xotirasi muvaffaqiyatli tozalandi`,
      });
      return true;
    }

    if (userId) {
      const ok = clearUserMemory(userId);
      if (!ok) {
        sendJson(res, 404, {
          success: false,
          error: "Bunday foydalanuvchi xotirasi topilmadi yoki allaqachon tozalangan",
        });
        return true;
      }

      logActivity({
        type: "memory_clear",
        title: `Foydalanuvchi (${userId}) xotirasi tozalandi`,
        details: `Administrator veb-interfeys orqali ${userId} ID ga ega foydalanuvchi suhbat xotirasini tozaladi.`,
        status: "ok",
        metadata: { userId },
      });

      sendJson(res, 200, {
        success: true,
        message: `Foydalanuvchi (${userId}) xotirasi tozalandi`,
        userId,
      });
      return true;
    }

    sendJson(res, 400, {
      success: false,
      error: "userId ko'rsatilmadi yoki all: true belgilanmadi",
    });
    return true;
  }

  return false;
}

export default handleMemoryRoutes;
