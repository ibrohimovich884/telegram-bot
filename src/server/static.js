import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Root directory is two levels up from src/server
const ROOT_DIR = path.resolve(__dirname, "../../");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const INDEX_HTML_PATH = path.join(PUBLIC_DIR, "index.html");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

/**
 * Statik fayllarni xavfsiz uzatadi
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} pathname
 * @returns {boolean} Agar fayl uzatilgan bo'lsa true, aks holda false
 */
export function handleStaticFiles(req, res, pathname) {
  // 1. Dashboard bosh sahifasi (har doim 200 OK qaytaradi, login popup UI ichida hal etiladi)
  if (pathname === "/" || pathname === "/index.html") {
    if (fs.existsSync(INDEX_HTML_PATH)) {
      const html = fs.readFileSync(INDEX_HTML_PATH, "utf-8");
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      res.end(html);
      return true;
    }
  }

  // 2. Public papkasidagi boshqa resurslar
  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
    return true;
  }

  return false;
}

export default handleStaticFiles;
