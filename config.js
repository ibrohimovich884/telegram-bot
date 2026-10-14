import dotenv from "dotenv";
dotenv.config({ override: true });

export const BOT_TOKEN = process.env.BOT_TOKEN;
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Dashboard va API xavfsizligi uchun maxfiy administrator paroli
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

// Render xizmatining tashqi manzili (faqat o'z serverini ping qilish uchun)
export const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || "https://telegram-bot-imap.onrender.com";

// AI Studio muhiti tekshiruvi: 409 Conflict xatosining oldini olish uchun
// AI Studio'da sukut bo'yicha polling o'chiq (false) bo'ladi, Render'da esa faol (true).
const isAiStudio = Boolean(
  process.env.APPLET_ID ||
  process.env.APP_URL ||
  process.env.GOOGLE_RUNTIME ||
  process.env.CONTROL_PLANE_PORT
);

export const ENABLE_POLLING = process.env.ENABLE_POLLING !== undefined
  ? process.env.ENABLE_POLLING === "true"
  : !isAiStudio;

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

import { SYSTEM_PROMPT as DEFAULT_PROMPT } from "./prompt.js";

export const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || DEFAULT_PROMPT;

if (!BOT_TOKEN) console.warn("[OGOHLANTIRISH] BOT_TOKEN topilmadi (.env yoki Environment'ga qo'shing)");
if (!GEMINI_API_KEY) console.warn("[OGOHLANTIRISH] GEMINI_API_KEY topilmadi (.env yoki Environment'ga qo'shing)");
if (!ADMIN_PASSWORD) {
  console.warn("[XAVFSIZLIK] ADMIN_PASSWORD o'rnatilmagan! Dashboard va barcha /api/* so'rovlari 503 himoyasida bo'ladi. /health ochiq.");
}
