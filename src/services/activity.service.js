/**
 * Bot faoliyati va statistikasini xotirada saqlash xizmati (Activity Service)
 */

const MAX_ACTIVITIES = 120;
const activities = [];

export const stats = {
  startedAt: new Date().toISOString(),
  totalUpdates: 0,
  businessMessages: 0,
  geminiReplies: 0,
  errorsCount: 0,
  lastActivityAt: null,
  botUsername: null,
  botId: null,
  businessConnections: new Map(),
};

/**
 * Yangi hodisani jurnalga qayd qiladi
 * @param {object} param0
 * @param {string} param0.type - Hodisa turi (update, message, ai_reply, connection, conflict, error, system)
 * @param {string} param0.title - Qisqa sarlavha
 * @param {string|object} param0.details - Tafsilotlar
 * @param {'ok'|'warn'|'error'} [param0.status='ok'] - Holat darajasi
 * @param {any} [param0.metadata=null] - Qo'shimcha ma'lumotlar
 */
export function logActivity({ type, title, details, status = "ok", metadata = null }) {
  const entry = {
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    time: new Date().toISOString(),
    type,
    title,
    details: typeof details === "string" ? details : JSON.stringify(details),
    status,
    metadata,
  };

  activities.unshift(entry);
  if (activities.length > MAX_ACTIVITIES) {
    activities.pop();
  }

  stats.lastActivityAt = entry.time;
  if (status === "error") {
    stats.errorsCount++;
  }
}

/**
 * Barcha faoliyat hodisalarini oladi
 * @returns {Array<object>}
 */
export function getActivities() {
  return activities;
}

/**
 * Tizim statistikasi va xotira ma'lumotlarini qaytaradi
 * @returns {object}
 */
export function getStats() {
  const uptimeSeconds = Math.floor(process.uptime());
  const mem = process.memoryUsage();

  return {
    ...stats,
    uptimeSeconds,
    memory: {
      rssMb: (mem.rss / 1024 / 1024).toFixed(1),
      heapUsedMb: (mem.heapUsed / 1024 / 1024).toFixed(1),
      heapTotalMb: (mem.heapTotal / 1024 / 1024).toFixed(1),
    },
    businessConnectionsCount: stats.businessConnections.size,
    businessConnectionsList: Array.from(stats.businessConnections.values()),
  };
}

/**
 * Bot haqidagi ma'lumotni yangilaydi
 * @param {{ username?: string, id?: number }} info
 */
export function setBotInfo(info) {
  if (info) {
    stats.botUsername = info.username || null;
    stats.botId = info.id || null;
  }
}

/**
 * Biznes ulanish holatini yangilaydi
 * @param {object} conn
 */
export function registerBusinessConnection(conn) {
  if (conn?.user) {
    stats.businessConnections.set(conn.user.id, {
      userId: conn.user.id,
      firstName: conn.user.first_name || "",
      username: conn.user.username || "",
      isEnabled: Boolean(conn.is_enabled),
      canReply: Boolean(conn.can_reply),
      updatedAt: new Date().toISOString(),
    });
  }
}

/**
 * Faoliyatlar ro'yxatini tozalaydi
 */
export function clearActivities() {
  activities.length = 0;
}

export default {
  stats,
  logActivity,
  getActivities,
  getStats,
  setBotInfo,
  registerBusinessConnection,
  clearActivities,
};
