import http from "node:http";
import { PORT } from "./config.js";
import { getErrors } from "./errors.js";

// Render Web Service uchun port ochamiz
export function startServer() {
  http
    .createServer((req, res) => {
      const path = (req.url || "/").split("?")[0];

      if (path === "/errors") {
        const errors = getErrors();
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ count: errors.length, errors }, null, 2));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bot ishlayapti");
    })
    .listen(PORT, () => console.log(`HTTP server port: ${PORT}`));
}
