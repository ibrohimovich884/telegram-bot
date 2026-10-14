import "dotenv/config";
import http from "node:http";
import { Bot } from "grammy";
import { GoogleGenAI } from "@google/genai";

const bot = new Bot(process.env.BOT_TOKEN);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT =
  "Sen Oybekning nomidan javob beryapsan. Qisqa, samimiy va o'zbek tilida yoz. " +
    "Agar bilmasang, Oybek keyinroq javob beradi, deb ayt.";

    // ---------- Xatolarni yig'ish ----------
    const MAX_ERRORS = 50;
    const errors = [];

    // Kalitlar logga yoki /errors ga tushib qolmasligi uchun yashiramiz
    function sanitize(text) {
      let s = String(text);
        for (const secret of [process.env.BOT_TOKEN, process.env.GEMINI_API_KEY]) {
            if (secret) s = s.split(secret).join("***");
              }
                return s;
                }

                function logError(where, err) {
                  const entry = {
                      time: new Date().toISOString(),
                          where,
                              message: sanitize(err?.message ?? err),
                                  stack: sanitize(err?.stack ?? ""),
                                    };
                                      errors.unshift(entry);
                                        if (errors.length > MAX_ERRORS) errors.pop();
                                          console.error(`[XATO] ${entry.time} | ${where} | ${entry.message}`);
                                          }

                                          process.on("uncaughtException", (err) => logError("uncaughtException", err));
                                          process.on("unhandledRejection", (err) => logError("unhandledRejection", err));

                                          // ---------- Bot ----------
                                          // business_connection_id -> akkaunt egasining ID si
                                          const ownerCache = new Map();

                                          async function getOwnerId(connectionId) {
                                            if (ownerCache.has(connectionId)) return ownerCache.get(connectionId);
                                              const conn = await bot.api.getBusinessConnection(connectionId);
                                                ownerCache.set(connectionId, conn.user.id);
                                                  return conn.user.id;
                                                  }

                                                  // Kelgan har bir update turini logga yozamiz
                                                  bot.use(async (ctx, next) => {
                                                    const types = Object.keys(ctx.update).filter((k) => k !== "update_id");
                                                      console.log(`[UPDATE] ${new Date().toISOString()} | ${types.join(", ")}`);
                                                        await next();
                                                        });

                                                        bot.on("business_connection", (ctx) => {
                                                          const c = ctx.businessConnection;
                                                            console.log(
                                                                `[ULANISH] user=${c.user.id} faol=${c.is_enabled} javob_berish=${c.can_reply}`
                                                                  );
                                                                  });

                                                                  bot.on("business_message:text", async (ctx) => {
                                                                    const connectionId = ctx.msg.business_connection_id;

                                                                      try {
                                                                          // Egasining o'z xabariga javob bermaymiz
                                                                              const ownerId = await getOwnerId(connectionId);
                                                                                  if (ctx.from.id === ownerId) {
                                                                                        console.log("[SKIP] egasining o'z xabari");
                                                                                              return;
                                                                                                  }

                                                                                                      const result = await ai.models.generateContent({
                                                                                                            model: "gemini-2.5-flash",
                                                                                                                  contents: ctx.msg.text,
                                                                                                                        config: { systemInstruction: SYSTEM_PROMPT },
                                                                                                                            });

                                                                                                                                const reply = result.text;
                                                                                                                                    if (!reply) throw new Error("Gemini bo'sh javob qaytardi");

                                                                                                                                        await ctx.api.sendMessage(ctx.chat.id, reply, {
                                                                                                                                              business_connection_id: connectionId,
                                                                                                                                                  });
                                                                                                                                                      console.log(`[JAVOB] chat=${ctx.chat.id} yuborildi`);
                                                                                                                                                        } catch (err) {
                                                                                                                                                            logError("business_message", err);
                                                                                                                                                              }
                                                                                                                                                              });

                                                                                                                                                              bot.catch((err) => logError("bot.catch", err.error ?? err));

                                                                                                                                                              // ---------- HTTP server (Render uchun) ----------
                                                                                                                                                              const PORT = process.env.PORT || 3000;

                                                                                                                                                              http
                                                                                                                                                                .createServer((req, res) => {
                                                                                                                                                                    const path = (req.url || "/").split("?")[0];

                                                                                                                                                                        if (path === "/errors") {
                                                                                                                                                                              res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                                                                                                                                                                                    res.end(JSON.stringify({ count: errors.length, errors }, null, 2));
                                                                                                                                                                                          return;
                                                                                                                                                                                              }

                                                                                                                                                                                                  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
                                                                                                                                                                                                      res.end("Bot ishlayapti");
                                                                                                                                                                                                        })
                                                                                                                                                                                                          .listen(PORT, () => console.log(`HTTP server port: ${PORT}`));

                                                                                                                                                                                                          // ---------- Ishga tushirish ----------
                                                                                                                                                                                                          bot
                                                                                                                                                                                                            .start({
                                                                                                                                                                                                                allowed_updates: ["message", "business_connection", "business_message"],
                                                                                                                                                                                                                    onStart: (info) => console.log(`Bot ishga tushdi: @${info.username}`),
                                                                                                                                                                                                                      })
                                                                                                                                                                                                                        .catch((err) => logError("bot.start", err));
                                                                                                                                                                                                                        