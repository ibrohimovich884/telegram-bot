import { GoogleGenAI } from "@google/genai";
import { GEMINI_API_KEY, GEMINI_MODEL, SYSTEM_PROMPT } from "../config/index.js";
import { sleep } from "../utils/sleep.js";

export { sleep };

function getAiClient() {
  const key = process.env.GEMINI_API_KEY || GEMINI_API_KEY;
  return new GoogleGenAI(key ? { apiKey: key } : {});
}

/**
 * Gemini AI orqali foydalanuvchi xabariga javob oladi.
 * 503 (high demand), 429 (rate limit) yoki 404 (not found) holatlarida
 * avtomatik ravishda boshqa zaxira modellarga o'tadi.
 * 
 * @param {string} text - Mijoz xabari
 * @param {string} [customPrompt] - Ixtiyoriy tizim ko'rsatmasi
 * @returns {Promise<string>}
 */
export async function askGemini(text, customPrompt = null) {
  const modelsToTry = [
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
    "gemini-3.5-flash",
  ];

  if (GEMINI_MODEL && !modelsToTry.includes(GEMINI_MODEL)) {
    modelsToTry.unshift(GEMINI_MODEL);
  }

  // Takrorlanmas modellar ro'yxati
  const uniqueModels = [...new Set(modelsToTry.filter(Boolean))];
  const ai = getAiClient();
  let lastError = null;

  for (let round = 1; round <= 2; round++) {
    for (const model of uniqueModels) {
      try {
        const result = await ai.models.generateContent({
          model,
          contents: text,
          config: { systemInstruction: customPrompt || SYSTEM_PROMPT },
        });

        if (result?.text) {
          return result.text;
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
          console.warn(`[GEMINI] Model topilmadi (${model}: 404 Not Found). Keyingi zaxira modelga o'tilmoqda...`);
        } else if (isBusy) {
          console.warn(`[GEMINI] ${model} vaqtincha band (503/429 High Demand). Zaxira modelga o'tilmoqda...`);
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
