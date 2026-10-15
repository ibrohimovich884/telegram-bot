import { sendJson, readBody } from "../../utils/http.js";
import {
  getAllMemoriesSummary,
  getMemoryStats,
  getUserMemory,
  clearUserMemory,
  clearAllMemories,
  findUserMemoryByUsername,
  addModelTurn,
} from "../../services/memory.service.js";
import { logActivity, stats } from "../../services/activity.service.js";
import { askGemini } from "../../services/gemini.service.js";
import { getBot } from "../../bot/index.js";

/**
 * Xotira va Username orqali tekshirish/xabar yuborish API marshrutlari:
 * - GET /api/memory -> Barcha foydalanuvchilar xotirasi xulosasi va statistikasi
 * - GET /api/memory?userId=... -> Aniq bitta foydalanuvchining to'liq dialog xabarlari
 * - POST /api/memory/clear -> Foydalanuvchi yoki barcha xotiralarni tozalash
 * - POST /api/memory/search-username -> Username bo'yicha so'nggi kun chatlarini tekshirish
 * - POST /api/memory/auto-reply-username -> Username bo'yicha Gemini avtojavob berish
 * - POST /api/telegram/send-custom-message -> Bot nomidan to'g'ridan-to'g'ri xabar yuborish
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

    const statsData = getMemoryStats();
    const users = getAllMemoriesSummary();

    sendJson(res, 200, {
      success: true,
      stats: statsData,
      users,
    });
    return true;
  }

  // 2. POST /api/memory/search-username (Username bo'yicha oxirgi kun chatlarini o'qish va tekshirish)
  if (req.method === "POST" && pathname === "/api/memory/search-username") {
    const body = await readBody(req);
    const username = body.username ? String(body.username).trim() : null;
    if (!username) {
      sendJson(res, 400, { success: false, error: "Username kiritilmadi" });
      return true;
    }

    const userMemory = findUserMemoryByUsername(username);
    if (!userMemory) {
      sendJson(res, 200, {
        success: true,
        found: false,
        message: "Avval suhbatlashilmagan",
      });
      return true;
    }

    // So'nggi kunda yuborilgan xabarlarni filtrlash
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const turns = userMemory.turns || [];
    const lastDayTurns = turns.filter((t) => now - new Date(t.timestamp).getTime() < dayMs);
    const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
    const isUnanswered = lastTurn && lastTurn.role === "user";

    sendJson(res, 200, {
      success: true,
      found: true,
      user: {
        userId: userMemory.userId,
        userName: userMemory.userName,
        username: userMemory.username,
        chatId: userMemory.chatId,
        createdAt: userMemory.createdAt,
        updatedAt: userMemory.updatedAt,
        messagesCount: userMemory.messagesCount,
        turnsCount: turns.length,
        turns,
        lastDayTurns,
        lastMessage: lastTurn ? lastTurn.text : "",
        lastRole: lastTurn ? lastTurn.role : null,
        isUnanswered,
      },
    });
    return true;
  }

  // 3. POST /api/memory/auto-reply-username (Agar so'nggi marta savol bergan bo'lsa, Gemini orqali javob berish)
  if (req.method === "POST" && pathname === "/api/memory/auto-reply-username") {
    const body = await readBody(req);
    const username = body.username ? String(body.username).trim() : null;
    if (!username) {
      sendJson(res, 400, { success: false, error: "Username kiritilmadi" });
      return true;
    }

    const userMemory = findUserMemoryByUsername(username);
    if (!userMemory) {
      sendJson(res, 404, { success: false, error: "Avval suhbatlashilmagan" });
      return true;
    }

    const turns = userMemory.turns || [];
    const lastUserTurn = turns.slice().reverse().find((t) => t.role === "user");
    const promptText = lastUserTurn ? lastUserTurn.text : "Salom, qanday yordam bera olaman?";

    const bot = getBot();
    const targetChatId =
      userMemory.chatId ||
      (userMemory.username ? (userMemory.username.startsWith("@") ? userMemory.username : "@" + userMemory.username) : null);

    if (!targetChatId || !bot) {
      sendJson(res, 400, { success: false, error: "Chat ID yoki Telegram bot topilmadi" });
      return true;
    }

    const reply = await askGemini(promptText, {
      userId: userMemory.userId,
      userName: userMemory.userName,
      username: userMemory.username,
      chatId: userMemory.chatId,
    });

    await bot.api.sendMessage(targetChatId, reply);
    stats.geminiReplies++;

    logActivity({
      type: "ai_reply",
      title: `Gemini AI avtojavob berdi (Username: @${username})`,
      details: `Javob: "${reply.slice(0, 80)}"`,
      status: "ok",
      metadata: { userId: userMemory.userId, username },
    });

    sendJson(res, 200, {
      success: true,
      reply,
      userId: userMemory.userId,
    });
    return true;
  }

  // 4. POST /api/telegram/send-custom-message (Bot nomidan unga interfeydan SMS yuborish)
  if (req.method === "POST" && pathname === "/api/telegram/send-custom-message") {
    const body = await readBody(req);
    const username = body.username ? String(body.username).trim() : null;
    const chatId = body.chatId ? String(body.chatId).trim() : null;
    const userId = body.userId ? String(body.userId).trim() : null;
    const text = body.text ? String(body.text).trim() : null;

    if (!text) {
      sendJson(res, 400, { success: false, error: "Xabar matni kiritilmadi" });
      return true;
    }

    let target = chatId || userId;
    let memoryUser = userId ? getUserMemory(userId) : null;

    if (!target && username) {
      memoryUser = findUserMemoryByUsername(username);
      if (memoryUser && memoryUser.chatId) {
        target = memoryUser.chatId;
      } else {
        target = username.startsWith("@") ? username : "@" + username;
      }
    }

    if (!target) {
      sendJson(res, 400, { success: false, error: "Target (Chat ID yoki Username) topilmadi" });
      return true;
    }

    const bot = getBot();
    if (!bot) {
      sendJson(res, 500, { success: false, error: "Telegram bot ishga tushmagan" });
      return true;
    }

    await bot.api.sendMessage(target, text);

    if (memoryUser) {
      addModelTurn(memoryUser.userId, text, { model: "admin-manual" });
    }

    logActivity({
      type: "ai_reply",
      title: `Admin bot nomidan xabar yubordi: ${target}`,
      details: `"${text.slice(0, 80)}"`,
      status: "ok",
      metadata: { target, text: text.slice(0, 100) },
    });

    sendJson(res, 200, {
      success: true,
      message: "Xabar muvaffaqiyatli yuborildi",
      target,
    });
    return true;
  }

  // 5. POST /api/memory/clear
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
