import { BOT_TOKEN, GEMINI_API_KEY } from "./config.js";

const MAX_ERRORS = 50;
const errors = [];

// Kalitlar logga yoki /errors ga tushib qolmasligi uchun yashiramiz
function sanitize(text) {
  let s = String(text);
  for (const secret of [BOT_TOKEN, GEMINI_API_KEY]) {
    if (secret) s = s.split(secret).join("***");
  }
  return s;
}

export function logError(where, err) {
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

export function getErrors() {
  return errors;
}

process.on("uncaughtException", (err) => logError("uncaughtException", err));
process.on("unhandledRejection", (err) => logError("unhandledRejection", err));
