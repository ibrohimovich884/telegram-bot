import dotenv from "dotenv";
dotenv.config({ override: true });

export const BOT_TOKEN = process.env.BOT_TOKEN;
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
export const ENABLE_POLLING = process.env.ENABLE_POLLING !== "false";

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

import { SYSTEM_PROMPT as DEFAULT_PROMPT } from "./prompt.js";

export const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || DEFAULT_PROMPT;

if (!BOT_TOKEN) console.warn("[OGOHLANTIRISH] BOT_TOKEN topilmadi (.env yoki Environment'ga qo'shing)");
if (!GEMINI_API_KEY) console.warn("[OGOHLANTIRISH] GEMINI_API_KEY topilmadi (.env yoki Environment'ga qo'shing)");

