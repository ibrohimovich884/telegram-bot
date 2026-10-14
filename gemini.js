import { GoogleGenAI } from "@google/genai";
import { GEMINI_API_KEY, GEMINI_MODEL, SYSTEM_PROMPT } from "./config.js";

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 503/429 bo'lsa 3 martagacha qayta urinadi
export async function askGemini(text) {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: text,
        config: { systemInstruction: SYSTEM_PROMPT },
      });
      return result.text;
    } catch (err) {
      const msg = String(err?.message ?? err);
      const retryable =
        [429, 500, 503].includes(err?.status) ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("RESOURCE_EXHAUSTED");
      if (!retryable || attempt === MAX_ATTEMPTS) throw err;
      console.log(`[GEMINI] ${attempt}-urinish bo'lmadi, ${attempt * 3}s dan keyin qayta uriniladi`);
      await sleep(attempt * 3000);
    }
  }
}
