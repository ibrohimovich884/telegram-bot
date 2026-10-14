// Bot faoliyati va statistikasini xotirada saqlash moduli

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

export function logActivity({ type, title, details, status = "ok", metadata = null }) {
  const entry = {
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    time: new Date().toISOString(),
    type,
    title,
    details: typeof details === "string" ? details : JSON.stringify(details),
    status, // 'ok' | 'warn' | 'error'
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

export function getActivities() {
  return activities;
}

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

export function setBotInfo(info) {
  if (info) {
    stats.botUsername = info.username || null;
    stats.botId = info.id || null;
  }
}

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

export function clearActivities() {
  activities.length = 0;
}
