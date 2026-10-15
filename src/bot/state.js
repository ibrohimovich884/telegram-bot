import { ENABLE_POLLING } from "../config/index.js";

/**
 * Botning umumiy ishchi holati va xotiradagi diagnostika ma'lumotlari
 */
export const botState = {
  isPollingEnabled: ENABLE_POLLING,
  pollingStatus: ENABLE_POLLING ? "running" : "paused", // 'running' | 'paused' | 'conflict' | 'stopped' | 'error'
  lastConflictAt: null,
  conflictCount: 0,
  conflictMessage: null,
  botInfo: null,
  webhookInfo: null,
  controller: {
    pause: async () => ({ success: true, status: "paused" }),
    resume: async () => ({ success: true, status: "running" }),
    resetWebhook: async () => ({ success: true }),
    getDiagnostics: async () => null,
  },
};

/**
 * Polling holatini yangilaydi
 * @param {'running'|'paused'|'conflict'|'stopped'|'error'} status 
 * @param {object} [extra={}]
 */
export function setPollingStatus(status, extra = {}) {
  botState.pollingStatus = status;
  if (extra.conflict) {
    botState.lastConflictAt = new Date().toISOString();
    botState.conflictCount += 1;
    botState.conflictMessage = extra.message || "Telegram 409: Boshqa bot nusxasi getUpdates bajarmoqda.";
  }
}

/**
 * Server yoki boshqa modullardan botni boshqarish kontrollerini ro'yxatdan o'tkazadi
 * @param {object} ctrl
 */
export function registerBotController(ctrl) {
  botState.controller = {
    ...botState.controller,
    ...ctrl,
  };
}

export default {
  botState,
  setPollingStatus,
  registerBotController,
};
