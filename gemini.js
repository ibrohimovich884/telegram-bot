import { GoogleGenAI } from "@google/genai";
import { GEMINI_API_KEY, GEMINI_MODEL, SYSTEM_PROMPT } from "./config.js";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getAiClient() {
  const key = process.env.GEMINI_API_KEY || GEMINI_API_KEY;
  return new GoogleGenAI(key ? { apiKey: key } : {});
}

// 404, 503 yoki 429 bo'lsa zaxira model va qayta urinish bilan ishlaydi
export async function askGemini(text) {
  const modelsToTry = [
    GEMINI_MODEL,
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest"
  ];
  // Takrorlanmas modellar ro'yxati
  const uniqueModels = [...new Set(modelsToTry.filter(Boolean))];

  const ai = getAiClient();
  let lastError = null;

  for (const model of uniqueModels) {
    let modelUnavailable = false;

    for (let attempt = 1; attempt <= 2; attempt++) {
      if (modelUnavailable) break;

      try {
        const result = await ai.models.generateContent({
          model,
          contents: text,
          config: { systemInstruction: SYSTEM_PROMPT },
        });
        if (result?.text) {
          return result.text;
        }
      } catch (err) {
        lastError = err;
        const msg = String(err?.message ?? err).toLowerCase();
        const status = err?.status;

        // Model topilmagan bo'lsa (404 NOT_FOUND, model o'chirilgan yoki mavjud emas):
        // Shu modelni qayta urinmasdan DARHOL keyingi zaxira modelga o'tadi
        const isNotFound =
          status === 404 ||
          msg.includes("404") ||
          msg.includes("not found") ||
          msg.includes("not_found") ||
          msg.includes("is not found for api version") ||
          msg.includes("unsupported model");

        if (isNotFound) {
          console.warn(`[GEMINI] Model ${model} topilmadi (404 Not Found). Keyingi zaxira modelga o'tilmoqda...`);
          modelUnavailable = true;
          break;
        }

        const retryable =
          [429, 500, 503].includes(status) ||
          msg.includes("unavailable") ||
          msg.includes("resource_exhausted") ||
          msg.includes("high demand") ||
          msg.includes("quota") ||
          msg.includes("overloaded");

        if (!retryable) {
          console.warn(`[GEMINI] ${model} xatolik berdi (${err?.message || err}). Keyingi model tekshiriladi...`);
          modelUnavailable = true;
          break;
        }

        console.log(`[GEMINI] ${model} (${attempt}-urinish) vaqtincha band: ${status || '503'}, qayta urinilmoqda...`);
        await sleep(attempt * 1000);
      }
    }
  }

  throw lastError || new Error("Gemini AI javob qaytara olmadi (barcha zaxira modellar tekshirildi)");
}
