import { ENABLE_POLLING } from "./config.js";

export const botState = {
  isPollingEnabled: ENABLE_POLLING,
  pollingStatus: ENABLE_POLLING ? "running" : "paused", // 'running' | 'paused' | 'conflict' | 'stopped' | 'error'
  lastConflictAt: null,
  conflictCount: 0,
  conflictMessage: null,
  botInfo: null,
  webhookInfo: null,
  controller: {
    pause: async () => {},
    resume: async () => {},
    resetWebhook: async () => {},
    getDiagnostics: async () => null,
  },
};

export function setPollingStatus(status, extra = {}) {
  botState.pollingStatus = status;
  if (extra.conflict) {
    botState.lastConflictAt = new Date().toISOString();
    botState.conflictCount += 1;
    botState.conflictMessage = extra.message || "Telegram 409: Boshqa bot nusxasi getUpdates bajarmoqda.";
  }
}

export function registerBotController(ctrl) {
  botState.controller = {
    ...botState.controller,
    ...ctrl,
  };
}
