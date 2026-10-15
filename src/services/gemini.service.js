import { GoogleGenAI } from "@google/genai";
import { GEMINI_API_KEY, GEMINI_MODEL, SYSTEM_PROMPT } from "../config/index.js";
import { sleep } from "../utils/sleep.js";
import {
  addUserTurn,
  addModelTurn,
  getFormattedHistory,
} from "./memory.service.js";

export { sleep };

function getAiClient() {
  const key = process.env.GEMINI_API_KEY || GEMINI_API_KEY;
  return new GoogleGenAI(key ? {
    apiKey: key,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  } : {});
}

/**
 * Gemini AI orqali foydalanuvchi xabariga javob oladi.
 * Har bir foydalanuvchi (userId) uchun alohida xotira (multi-turn dialog) qo'llab-quvvatlanadi.
 * 
 * 503 (high demand), 429 (rate limit) yoki 404 (not found) holatlarida
 * avtomatik ravishda zaxira modellarga o'tadi.
 * 
 * @param {string} text - Mijoz xabari
 * @param {string|object} [optionsOrPrompt] - Ixtiyoriy tizim ko'rsatmasi yoki parametrlar obyekti { userId, userName, username, chatId, customPrompt, disableMemory }
 * @returns {Promise<string>}
 */
export async function askGemini(text, optionsOrPrompt = null) {
  let customPrompt = null;
  let userId = null;
  let userName = null;
  let username = null;
  let chatId = null;
  let disableMemory = false;

  if (typeof optionsOrPrompt === "string") {
    customPrompt = optionsOrPrompt;
  } else if (optionsOrPrompt && typeof optionsOrPrompt === "object") {
    customPrompt = optionsOrPrompt.customPrompt || null;
    userId = optionsOrPrompt.userId ? String(optionsOrPrompt.userId) : null;
    userName = optionsOrPrompt.userName || null;
    username = optionsOrPrompt.username || null;
    chatId = optionsOrPrompt.chatId || null;
    disableMemory = Boolean(optionsOrPrompt.disableMemory);
  }

  // Model fallback ro'yxati (Skill bo'yicha ruxsat etilgan zamonaviy modellar)
  const modelsToTry = [
    "gemini-3.8-flash",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
  ];

  if (GEMINI_MODEL && !modelsToTry.includes(GEMINI_MODEL)) {
    modelsToTry.unshift(GEMINI_MODEL);
  }

  // Takrorlanmas modellar ro'yxati
  const uniqueModels = [...new Set(modelsToTry.filter(Boolean))];
  const ai = getAiClient();
  let lastError = null;

  // 1. Foydalanuvchi uchun alohida tizim ko'rsatmasi va kontekst shakllantirish
  let effectiveSystemInstruction = customPrompt || SYSTEM_PROMPT;
  if (userId) {
    const userLabel = userName ? `Ismi: "${userName}"` : `Mijoz ID: ${userId}`;
    effectiveSystemInstruction += `\n\n[Mijoz Konteksti: Siz hozir ${userLabel} bilan suhbatlashmoqdasiz. Ushbu foydalanuvchi bilan bo'lgan suhbat xotirasi boshqa mijozlardan mutlaqo ajratilgan. Suhbatdoshning oldingi xabarlarida bergan ma'lumotlarini (ism, manzil, buyurtma, qiziqishlari) eslab qoling va shu asosda do'stona, aniq yordam bering.]`;
  }

  // 2. Multi-turn xotira tarkibini shakllantirish
  let contents = text;
  if (userId && !disableMemory) {
    const pastTurns = getFormattedHistory(userId);
    if (pastTurns && pastTurns.length > 0) {
      // Oldingi suhbat tarixi + yangi foydalanuvchi xabari
      contents = [
        ...pastTurns,
        {
          role: "user",
          parts: [{ text: String(text).trim() }],
        },
      ];
    }
  }

  for (let round = 1; round <= 2; round++) {
    for (const model of uniqueModels) {
      try {
        const t0 = Date.now();
        const result = await ai.models.generateContent({
          model,
          contents,
          config: { systemInstruction: effectiveSystemInstruction },
        });

        if (result?.text) {
          const reply = result.text.trim();
          const durationMs = Date.now() - t0;

          // 3. Agar so'rov aniq foydalanuvchiga tegishli bo'lsa, xabarlarni uning shaxsiy xotirasiga kiritamiz
          if (userId && !disableMemory && reply) {
            addUserTurn(userId, text, { userName, username, chatId });
            addModelTurn(userId, reply, { durationMs, model });
          }

          return reply;
        }
      } catch (err) {
        lastError = err;
        const msg = String(err?.message ?? err).toLowerCase();
        const status = err?.status;

        const isNotFound =
          status === 404 ||
          msg.includes("404") ||
          msg.includes("not found") ||
          msg.includes("not_found") ||
          msg.includes("is not found for api version") ||
          msg.includes("no longer available");

        const isBusy =
          status === 503 ||
          status === 429 ||
          msg.includes("503") ||
          msg.includes("unavailable") ||
          msg.includes("resource_exhausted") ||
          msg.includes("high demand") ||
          msg.includes("quota") ||
          msg.includes("overloaded");

        if (isNotFound) {
          console.warn(`[GEMINI] Model topilmadi (${model}: 404 Not Found). Keyingi modelga o'tilmoqda...`);
        } else if (isBusy) {
          console.warn(`[GEMINI] ${model} vaqtincha band (503/429 High Demand). Zaxira model tekshiriladi...`);
        } else {
          console.warn(`[GEMINI] ${model} xatolik berdi (${err?.message || err}). Zaxira model tekshiriladi...`);
        }
      }
    }

    if (round === 1) {
      await sleep(800);
    }
  }

  throw lastError || new Error("Gemini AI javob qaytara olmadi (barcha zaxira modellar tekshirildi)");
}

export default {
  askGemini,
  sleep,
};
