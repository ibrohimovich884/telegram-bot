import dotenv from "dotenv";
dotenv.config({ override: true });

export const BOT_TOKEN = process.env.BOT_TOKEN;
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
export const ENABLE_POLLING = process.env.ENABLE_POLLING !== "false";

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

export const SYSTEM_PROMPT =
  "Sen Oybekning nomidan javob beryapsan. Qisqa, samimiy va o'zbek tilida yoz. " +
  "Agar bilmasang, Oybek keyinroq javob beradi, deb ayt.";

if (!BOT_TOKEN) console.warn("[OGOHLANTIRISH] BOT_TOKEN topilmadi (.env yoki Environment'ga qo'shing)");
if (!GEMINI_API_KEY) console.warn("[OGOHLANTIRISH] GEMINI_API_KEY topilmadi (.env yoki Environment'ga qo'shing)");

