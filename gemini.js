import { GoogleGenAI } from "@google/genai";
import { GEMINI_API_KEY, GEMINI_MODEL, SYSTEM_PROMPT } from "./config.js";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getAiClient() {
  const key = process.env.GEMINI_API_KEY || GEMINI_API_KEY;
  return new GoogleGenAI(key ? { apiKey: key } : {});
}

// 503/429 bo'lsa fallback model va qayta urinish bilan ishlaydi
export async function askGemini(text) {
  const modelsToTry = [
    GEMINI_MODEL,
    "gemini-3.1-flash-lite",
    "gemini-flash-latest"
  ];
  // Takrorlanmas modellar ro'yxati
  const uniqueModels = [...new Set(modelsToTry.filter(Boolean))];

  const ai = getAiClient();
  let lastError = null;

  for (const model of uniqueModels) {
    for (let attempt = 1; attempt <= 2; attempt++) {
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
        const msg = String(err?.message ?? err);
        const retryable =
          [429, 500, 503].includes(err?.status) ||
          msg.includes("UNAVAILABLE") ||
          msg.includes("RESOURCE_EXHAUSTED") ||
          msg.includes("high demand");

        if (!retryable) {
          throw err;
        }

        console.log(`[GEMINI] ${model} (${attempt}-urinish) vaqtincha band: ${err?.status || '503'}, keyingi variant tekshirilmoqda...`);
        await sleep(attempt * 1000);
      }
    }
  }

  throw lastError || new Error("Gemini AI javob qaytara olmadi");
}
