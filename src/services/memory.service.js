/**
 * Telegram Business Bot - Foydalanuvchilar Xotira Xizmati (Memory Service)
 * 
 * Har bir foydalanuvchi uchun alohida, izolyatsiya qilingan xotira:
 * - Bir foydalanuvchining ma'lumotlari ikkinchi foydalanuvchiga aslo aralashmaydi.
 * - Har bir foydalanuvchi bo'yicha suhbat tarixi (multi-turn dialog) saqlanadi.
 * - Token chegarasidan oshib ketmaslik uchun so'nggi N ta xabar saqlanadi.
 * - Server qayta ishga tushganda ma'lumotlar yo'qolmasligi uchun diskka (data/memory.json) xavfsiz saqlanadi.
 */

import fs from "node:fs";
import path from "node:path";
import { logError } from "../utils/errors.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const MEMORY_FILE = path.join(DATA_DIR, "memory.json");

// Bitta foydalanuvchi uchun saqlanadigan maksimal dialog xabarlari soni (15 user + 15 model)
const MAX_TURNS_PER_USER = 30;

/**
 * Xotirada saqlanadigan barcha foydalanuvchilar ma'lumotlari Map'i
 * Kalit: String(userId) -> Foydalanuvchi xotirasi
 * @type {Map<string, {
 *   userId: string,
 *   userName: string,
 *   username: string,
 *   chatId: string|number|null,
 *   createdAt: string,
 *   updatedAt: string,
 *   messagesCount: number,
 *   turns: Array<{ id: string, role: 'user'|'model', text: string, timestamp: string, durationMs?: number, model?: string }>
 * }>}
 */
const userMemories = new Map();

let isSaveScheduled = false;

/**
 * Xotirani fayldan xavfsiz yuklab oladi
 */
function loadMemoriesFromFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(MEMORY_FILE)) {
      const raw = fs.readFileSync(MEMORY_FILE, "utf-8");
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.userId) {
              const uId = String(item.userId);
              userMemories.set(uId, {
                userId: uId,
                userName: String(item.userName || ""),
                username: String(item.username || ""),
                chatId: item.chatId ?? null,
                createdAt: item.createdAt || new Date().toISOString(),
                updatedAt: item.updatedAt || new Date().toISOString(),
                messagesCount: Number(item.messagesCount || (item.turns ? item.turns.length : 0)),
                turns: Array.isArray(item.turns) ? item.turns.filter((t) => t && t.role && t.text) : [],
              });
            }
          }
          console.log(`[XOTIRA] ${userMemories.size} ta foydalanuvchi xotirasi fayldan yuklandi.`);
        }
      }
    }
  } catch (err) {
    console.warn("[XOTIRA] Fayldan yuklashda ogohlantirish (bo'sh xotira bilan boshlanadi):", err?.message);
  }
}

/**
 * Diskka saqlashni kechiktirib (debounced) bajaradi
 */
function scheduleSave() {
  if (isSaveScheduled) return;
  isSaveScheduled = true;

  setTimeout(() => {
    isSaveScheduled = false;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const dataToSave = Array.from(userMemories.values());
      fs.writeFileSync(MEMORY_FILE, JSON.stringify(dataToSave, null, 2), "utf-8");
    } catch (err) {
      logError("memory.save", err);
    }
  }, 1000);
}

// Xizmat yuklanganda darhol diskdan o'qiymiz
loadMemoriesFromFile();

/**
 * Foydalanuvchi xotirasini oladi yoki yangisini yaratadi
 * @param {string|number} rawUserId
 * @param {object} [details]
 * @returns {object}
 */
export function getOrCreateUserMemory(rawUserId, details = {}) {
  const userId = String(rawUserId);
  if (!userMemories.has(userId)) {
    const newRecord = {
      userId,
      userName: details.userName || details.name || "",
      username: details.username || "",
      chatId: details.chatId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messagesCount: 0,
      turns: [],
    };
    userMemories.set(userId, newRecord);
    return newRecord;
  }

  const existing = userMemories.get(userId);
  if (details.userName && details.userName !== existing.userName) {
    existing.userName = details.userName;
  }
  if (details.username && details.username !== existing.username) {
    existing.username = details.username;
  }
  if (details.chatId && !existing.chatId) {
    existing.chatId = details.chatId;
  }
  return existing;
}

/**
 * Foydalanuvchi yuborgan xabarni uning shaxsiy xotirasiga qo'shadi
 * @param {string|number} rawUserId
 * @param {string} text
 * @param {object} [details]
 */
export function addUserTurn(rawUserId, text, details = {}) {
  if (!rawUserId || !text || !String(text).trim()) return null;
  const userId = String(rawUserId);
  const memory = getOrCreateUserMemory(userId, details);

  const turn = {
    id: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    role: "user",
    text: String(text).trim(),
    timestamp: new Date().toISOString(),
  };

  memory.turns.push(turn);
  memory.messagesCount++;
  memory.updatedAt = turn.timestamp;

  if (memory.turns.length > MAX_TURNS_PER_USER) {
    memory.turns.splice(0, memory.turns.length - MAX_TURNS_PER_USER);
  }

  scheduleSave();
  return turn;
}

/**
 * Gemini model javobini foydalanuvchining shaxsiy xotirasiga qo'shadi
 * @param {string|number} rawUserId
 * @param {string} text
 * @param {object} [meta]
 */
export function addModelTurn(rawUserId, text, meta = {}) {
  if (!rawUserId || !text || !String(text).trim()) return null;
  const userId = String(rawUserId);
  const memory = getOrCreateUserMemory(userId);

  const turn = {
    id: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    role: "model",
    text: String(text).trim(),
    timestamp: new Date().toISOString(),
    durationMs: meta.durationMs,
    model: meta.model,
  };

  memory.turns.push(turn);
  memory.messagesCount++;
  memory.updatedAt = turn.timestamp;

  if (memory.turns.length > MAX_TURNS_PER_USER) {
    memory.turns.splice(0, memory.turns.length - MAX_TURNS_PER_USER);
  }

  scheduleSave();
  return turn;
}

/**
 * Gemini API talab qiladigan to'g'ri multi-turn formatdagi suhbat tarixini oladi
 * @param {string|number} rawUserId
 * @returns {Array<{ role: 'user'|'model', parts: Array<{ text: string }> }>}
 */
export function getFormattedHistory(rawUserId) {
  if (!rawUserId) return [];
  const userId = String(rawUserId);
  const memory = userMemories.get(userId);
  if (!memory || !memory.turns || memory.turns.length === 0) {
    return [];
  }

  const formatted = [];
  let expectedRole = "user";

  for (const turn of memory.turns) {
    if (!turn || !turn.text || !turn.role) continue;
    const cleanText = String(turn.text).trim();
    if (!cleanText) continue;

    if (turn.role === expectedRole) {
      formatted.push({
        role: turn.role,
        parts: [{ text: cleanText }],
      });
      expectedRole = expectedRole === "user" ? "model" : "user";
    } else if (turn.role === "user" && formatted.length > 0 && formatted[formatted.length - 1].role === "user") {
      formatted[formatted.length - 1].parts[0].text += "\n" + cleanText;
    }
  }

  while (formatted.length > 0 && formatted[formatted.length - 1].role !== "model") {
    formatted.pop();
  }

  return formatted;
}

/**
 * Aniq bitta foydalanuvchi xotirasini tozalaydi
 * @param {string|number} rawUserId
 * @returns {boolean}
 */
export function clearUserMemory(rawUserId) {
  if (!rawUserId) return false;
  const userId = String(rawUserId);
  if (userMemories.has(userId)) {
    userMemories.delete(userId);
    scheduleSave();
    console.log(`[XOTIRA] Foydalanuvchi (${userId}) xotirasi tozalandi.`);
    return true;
  }
  return false;
}

/**
 * Barcha foydalanuvchilar xotirasini butunlay tozalaydi
 */
export function clearAllMemories() {
  const count = userMemories.size;
  userMemories.clear();
  scheduleSave();
  console.log(`[XOTIRA] Barcha (${count} ta) xotira tozalandi.`);
  return count;
}

/**
 * Aniq bitta foydalanuvchi xotirasi ma'lumotlarini qaytaradi
 * @param {string|number} rawUserId
 * @returns {object|null}
 */
export function getUserMemory(rawUserId) {
  if (!rawUserId) return null;
  const userId = String(rawUserId);
  return userMemories.get(userId) || null;
}

/**
 * Username bo'yicha foydalanuvchi xotirasini qidiradi
 * @param {string} rawUsername
 * @returns {object|null}
 */
export function findUserMemoryByUsername(rawUsername) {
  if (!rawUsername) return null;
  const target = String(rawUsername).trim().replace(/^@/, "").toLowerCase();
  for (const m of userMemories.values()) {
    const u = (m.username || "").trim().replace(/^@/, "").toLowerCase();
    if (u === target) {
      return m;
    }
  }
  return null;
}

/**
 * Dashboard va interfeys uchun barcha foydalanuvchilar ro'yxati va xulosasini qaytaradi
 * @returns {Array<object>}
 */
export function getAllMemoriesSummary() {
  const list = [];
  for (const item of userMemories.values()) {
    const lastTurn = item.turns && item.turns.length > 0 ? item.turns[item.turns.length - 1] : null;
    list.push({
      userId: item.userId,
      userName: item.userName || `Foydalanuvchi #${item.userId}`,
      username: item.username || "",
      chatId: item.chatId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      messagesCount: item.messagesCount,
      turnsCount: item.turns ? item.turns.length : 0,
      lastMessage: lastTurn ? lastTurn.text.slice(0, 100) : "",
      lastRole: lastTurn ? lastTurn.role : null,
      lastTimestamp: lastTurn ? lastTurn.timestamp : item.updatedAt,
    });
  }

  list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return list;
}

/**
 * Xotira bo'yicha umumiy statistika
 * @returns {object}
 */
export function getMemoryStats() {
  let totalTurns = 0;
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  let activeWithin24h = 0;

  for (const m of userMemories.values()) {
    totalTurns += m.turns ? m.turns.length : 0;
    const updated = new Date(m.updatedAt).getTime();
    if (now - updated < dayMs) {
      activeWithin24h++;
    }
  }

  return {
    totalUsers: userMemories.size,
    totalMessages: totalTurns,
    activeWithin24h,
    storageFile: MEMORY_FILE,
  };
}

export default {
  getOrCreateUserMemory,
  addUserTurn,
  addModelTurn,
  getFormattedHistory,
  clearUserMemory,
  clearAllMemories,
  getUserMemory,
  getAllMemoriesSummary,
  getMemoryStats,
  findUserMemoryByUsername,
};
