// =============================================================================
// Stats Collector - Periodic Icecast Polling
// =============================================================================

const { getServerStats, getActiveMounts, getTotalListeners } = require('./icecast');
const { broadcast } = require('./websocket');
const { query } = require('../database/connection');
const { cacheSet } = require('./redis');
const logger = require('../utils/logger');

let collectorInterval = null;

function startStatsCollector() {
  if (process.env.ICECAST_DISABLED === 'true' || process.env.SKIP_ICECAST === 'true') {
    logger.info('Stats collector skipped (ICECAST_DISABLED / SKIP_ICECAST)');
    return;
  }

  // Collect stats every 10 seconds
  collectorInterval = setInterval(async () => {
    try {
      const stats = await getServerStats();
      if (!stats) return;

      const mounts = await getActiveMounts();
      const totalListeners = mounts.reduce((sum, m) => sum + m.listeners, 0);

      const statsPayload = {
        server: {
          admin: stats.admin || '',
          host: stats.host || '',
          location: stats.location || '',
          server_id: stats.server_id || '',
          server_start: stats.server_start || ''
        },
        mounts,
        totalListeners,
        peakListeners: mounts.reduce((max, m) => Math.max(max, m.peak_listeners), 0),
        activeMounts: mounts.length
      };

      // Cache stats
      await cacheSet('stream:stats', statsPayload, 15);

      // Broadcast to WebSocket clients
      broadcast('stats', statsPayload);

      // Store in database (every minute, not every 10s)
      const now = new Date();
      if (now.getSeconds() < 10) {
        for (const mount of mounts) {
          try {
            await query(
              `INSERT INTO listener_stats (station_id, mountpoint, listener_count, peak_listeners, bandwidth_kbps)
               SELECT s.id, $1, $2, $3, $4
               FROM stations s WHERE s.mountpoint = $1
               LIMIT 1`,
              [
                '/' + mount.mount,
                mount.listeners,
                mount.peak_listeners,
                (mount.bitrate * mount.listeners) / 8
              ]
            );
          } catch (dbErr) {
            // Station might not exist for this mount, skip
          }
        }
      }
    } catch (error) {
      logger.warn('Stats collection error:', error.message);
    }
  }, 10000);
}

function stopStatsCollector() {
  if (collectorInterval) {
    clearInterval(collectorInterval);
    collectorInterval = null;
  }
}

module.exports = { startStatsCollector, stopStatsCollector };
