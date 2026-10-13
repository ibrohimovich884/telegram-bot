import "dotenv/config";
import http from "node:http";
import { Bot } from "grammy";
import { GoogleGenAI } from "@google/genai";

const bot = new Bot(process.env.BOT_TOKEN);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT =
  "Sen Oybekning nomidan javob beryapsan. Qisqa, samimiy va o'zbek tilida yoz. " +
  "Agar bilmasang, Oybek keyinroq javob beradi, deb ayt.";

// business_connection_id -> akkaunt egasining ID si
const ownerCache = new Map();

async function getOwnerId(connectionId) {
  if (ownerCache.has(connectionId)) return ownerCache.get(connectionId);
  const conn = await bot.api.getBusinessConnection(connectionId);
  ownerCache.set(connectionId, conn.user.id);
  return conn.user.id;
}

bot.on("business_message:text", async (ctx) => {
  const connectionId = ctx.msg.business_connection_id;

  try {
    // Egasining o'z xabariga javob bermaymiz
    const ownerId = await getOwnerId(connectionId);
    if (ctx.from.id === ownerId) return;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: ctx.msg.text,
      config: { systemInstruction: SYSTEM_PROMPT },
    });

    await ctx.api.sendMessage(ctx.chat.id, result.text, {
      business_connection_id: connectionId,
    });
  } catch (err) {
    console.error("Xatolik:", err);
  }
});

bot.catch((err) => console.error("Bot xatosi:", err));

// Render Web Service uchun port ochamiz
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Bot ishlayapti");
  })
  .listen(PORT, () => console.log("HTTP server port:", PORT));

bot.start({
  allowed_updates: ["message", "business_connection", "business_message"],
});
console.log("Bot ishga tushdi");
