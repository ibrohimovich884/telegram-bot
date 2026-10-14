import "dotenv/config";

export const BOT_TOKEN = process.env.BOT_TOKEN;
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const PORT = process.env.PORT || 3000;

export const GEMINI_MODEL = "gemini-3.8-flash";

export const SYSTEM_PROMPT =
  "Sen Oybekning nomidan javob beryapsan. Qisqa, samimiy va o'zbek tilida yoz. " +
  "Agar bilmasang, Oybek keyinroq javob beradi, deb ayt.";

if (!BOT_TOKEN) throw new Error("BOT_TOKEN topilmadi (Environment'ga qo'shing)");
if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY topilmadi (Environment'ga qo'shing)");
