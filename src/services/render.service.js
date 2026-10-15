import { RENDER_EXTERNAL_URL } from "../config/index.js";

/**
 * SSRF himoyalangan Render serverini tekshirish xizmati:
 * Faqat o'z Render manzilini tekshiradi, ixtiyoriy tashqi URL qabul qilinmaydi.
 * 
 * @returns {Promise<object>}
 */
export async function pingRender() {
  const url = (RENDER_EXTERNAL_URL || "https://telegram-bot-imap.onrender.com").replace(/\/+$/, "");
  const t0 = Date.now();
  let rootRes = null;
  let rootText = "";
  let rootDuration = 0;
  let isAlive = false;
  let errorMessage = null;

  try {
    const res = await fetch(`${url}/health`, {
      headers: { "User-Agent": "TelegramBotDashboard/1.0" },
      signal: AbortSignal.timeout(25000),
    });
    rootDuration = Date.now() - t0;
    rootText = await res.text();
    isAlive = res.ok;
    rootRes = {
      status: res.status,
      statusText: res.statusText,
    };
  } catch (err) {
    rootDuration = Date.now() - t0;
    errorMessage = err?.message || "Render serveriga ulanishda xatolik";
  }

  return {
    url,
    isAlive,
    status: rootRes?.status || 0,
    statusText: rootRes?.statusText || (isAlive ? "OK" : "Offline / Timeout"),
    durationMs: rootDuration,
    responseText: (rootText || "").trim().slice(0, 300),
    errorMessage,
    checkedAt: new Date().toISOString(),
  };
}

export default {
  pingRender,
};
