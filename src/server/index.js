import http from "node:http";
import { PORT } from "../config/index.js";
import { sendJson } from "../utils/http.js";
import { logError } from "../utils/errors.js";
import { handleStaticFiles } from "./static.js";
import { handleHealthRoute } from "./routes/health.routes.js";
import { dispatchApiRoutes } from "./routes/index.js";

/**
 * HTTP serverni yaratadi va ishga tushiradi
 * @returns {http.Server}
 */
export function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const pathname = parsedUrl.pathname;

      // 1. OPTIONS so'rovlari
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      // 2. /health -> OCHIQ marshrut (UptimeRobot va monitoring uchun, parol talab qilinmaydi)
      if (pathname === "/health") {
        if (handleHealthRoute(req, res)) return;
      }

      // 3. Statik fayllar va Bosh sahifa (Dashboard HTML)
      // Bu orqali AI Studio warmup va iframe to'xtovsiz yuklanadi, dashboard ichida esa parol so'raladi
      if (handleStaticFiles(req, res, pathname)) {
        return;
      }

      // 4. API so'rovlarini to'g'ridan-to'g'ri yo'naltirish (parol talab qilinmaydi)
      await dispatchApiRoutes(req, res, pathname);
    } catch (err) {
      logError("server.request", err);
      sendJson(res, 500, { error: "Server ichki xatoligi" });
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[HTTP SERVER] Bot interfeysi va API port: ${PORT} da ishga tushdi`);
  });

  return server;
}

export default startServer;
