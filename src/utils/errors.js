import { BOT_TOKEN, GEMINI_API_KEY, ADMIN_PASSWORD } from "../config/index.js";
import { logActivity } from "../services/activity.service.js";

const MAX_ERRORS = 50;
const errors = [];

// Kalitlar va maxfiy ma'lumotlar logga yoki API javobiga tushib qolmasligi uchun yashiramiz
function sanitize(text) {
  let s = String(text);
  for (const secret of [BOT_TOKEN, GEMINI_API_KEY, ADMIN_PASSWORD]) {
    if (secret && secret.length > 3) {
      s = s.split(secret).join("***");
    }
  }
  return s;
}

/**
 * Xatolikni jurnalga yozadi va xavfsiz formatlaydi
 * @param {string} where - Xatolik yuz bergan joy / modul
 * @param {Error|any} err - Xato obyekti
 */
export function logError(where, err) {
  const entry = {
    time: new Date().toISOString(),
    where,
    message: sanitize(err?.message ?? err),
    stack: sanitize(err?.stack ?? ""),
  };
  errors.unshift(entry);
  if (errors.length > MAX_ERRORS) {
    errors.pop();
  }
  console.error(`[XATO] ${entry.time} | ${where} | ${entry.message}`);

  // Faoliyat jurnaliga ham qo'shamiz
  try {
    logActivity({
      type: "error",
      title: `Xatolik: ${where}`,
      details: entry.message,
      status: "error",
      metadata: { where },
    });
  } catch {
    // xatolik ichida qo'shimcha xato yuz bersa to'xtatmaymiz
  }
}

/**
 * Saqlangan xatoliklar ro'yxatini qaytaradi
 * @returns {Array<object>}
 */
export function getErrors() {
  return errors;
}

/**
 * Xatoliklar ro'yxatini tozalaydi
 * @returns {boolean}
 */
export function clearErrors() {
  errors.length = 0;
  return true;
}

// Global xatoliklarni ushlab qolish
process.on("uncaughtException", (err) => logError("uncaughtException", err));
process.on("unhandledRejection", (err) => logError("unhandledRejection", err));

export default {
  logError,
  getErrors,
  clearErrors,
};
