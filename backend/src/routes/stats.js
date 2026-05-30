// =============================================================================
// Statistics Routes
// =============================================================================

const express = require('express');
const router = express.Router();
const { query } = require('../database/connection');
const { authenticate, authorize } = require('../middleware/auth');
const { cacheGet, cacheSet } = require('../services/redis');
const { getServerStats, getActiveMounts } = require('../services/icecast');
const logger = require('../utils/logger');

// GET /api/stats/realtime - Live server stats
router.get('/realtime', authenticate, async (req, res) => {
  try {
    // Check cache first
    const cached = await cacheGet('stream:stats');
    if (cached) return res.json(cached);

    if (process.env.ICECAST_DISABLED === 'true' || process.env.SKIP_ICECAST === 'true') {
      const empty = {
        server: null,
        mounts: [],
        totalListeners: 0,
        peakListeners: 0,
        activeMounts: 0,
        timestamp: new Date().toISOString(),
        icecast: 'disabled'
      };
      return res.json(empty);
    }

    let stats;
    let mounts;
    try {
      stats = await getServerStats();
      mounts = await getActiveMounts();
    } catch (e) {
      logger.warn('Realtime stats: Icecast unavailable, returning empty mounts');
      stats = null;
      mounts = [];
    }

    const payload = {
      server: stats,
      mounts,
      totalListeners: mounts.reduce((sum, m) => sum + (m.listeners || 0), 0),
      peakListeners: mounts.reduce((max, m) => Math.max(max, m.peak_listeners || 0), 0),
      activeMounts: mounts.length,
      timestamp: new Date().toISOString()
    };

    await cacheSet('stream:stats', payload, 10);
    res.json(payload);
  } catch (error) {
    logger.error('Realtime stats error:', error);
    res.status(500).json({ error: 'Failed to fetch realtime stats' });
  }
});

// GET /api/stats/listeners - Historical listener data
router.get('/listeners', authenticate, async (req, res) => {
  try {
    const { station_id, period = '24h' } = req.query;
    let interval;

    switch (period) {
      case '1h':  interval = '1 hour';  break;
      case '6h':  interval = '6 hours'; break;
      case '24h': interval = '24 hours'; break;
      case '7d':  interval = '7 days';  break;
      case '30d': interval = '30 days'; break;
      default:    interval = '24 hours';
    }

    const params = [];
    let stationFilter = '';

    if (station_id) {
      params.push(station_id);
      stationFilter = `AND station_id = $${params.length}`;
    }

    const result = await query(
      `SELECT
         date_trunc('hour', recorded_at) as time_bucket,
         AVG(listener_count) as avg_listeners,
         MAX(peak_listeners) as peak_listeners,
         AVG(bandwidth_kbps) as avg_bandwidth
       FROM listener_stats
       WHERE recorded_at > NOW() - INTERVAL '${interval}'
       ${stationFilter}
       GROUP BY time_bucket
       ORDER BY time_bucket`,
      params
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Listener stats error:', error);
    res.status(500).json({ error: 'Failed to fetch listener stats' });
  }
});

// GET /api/stats/overview - Dashboard overview
router.get('/overview', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const [stations, djs, media, listeners] = await Promise.all([
      query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active) as active FROM stations'),
      query('SELECT COUNT(*) as total FROM dj_profiles'),
      query('SELECT COUNT(*) as total, COALESCE(SUM(file_size), 0) as total_size FROM media_files'),
      query(
        `SELECT COALESCE(AVG(listener_count), 0) as avg_listeners,
                COALESCE(MAX(peak_listeners), 0) as peak_today
         FROM listener_stats
         WHERE recorded_at > NOW() - INTERVAL '24 hours'`
      )
    ]);

    res.json({
      stations: stations.rows[0],
      djs: djs.rows[0],
      media: {
        total: parseInt(media.rows[0].total),
        totalSizeMB: Math.round(parseInt(media.rows[0].total_size) / (1024 * 1024))
      },
      listeners: {
        avgToday: Math.round(parseFloat(listeners.rows[0].avg_listeners)),
        peakToday: parseInt(listeners.rows[0].peak_today)
      }
    });
  } catch (error) {
    logger.error('Overview stats error:', error);
    res.status(500).json({ error: 'Failed to fetch overview stats' });
  }
});

// GET /api/stats/top-tracks - Most played tracks
router.get('/top-tracks', authenticate, async (req, res) => {
  try {
    const { station_id, limit = 20 } = req.query;
    const params = [parseInt(limit)];
    let stationFilter = '';

    if (station_id) {
      params.push(station_id);
      stationFilter = `WHERE mh.station_id = $${params.length}`;
    }

    const result = await query(
      `SELECT mh.title, mh.artist, mh.album, COUNT(*) as play_count,
              MAX(mh.played_at) as last_played
       FROM metadata_history mh
       ${stationFilter}
       GROUP BY mh.title, mh.artist, mh.album
       ORDER BY play_count DESC
       LIMIT $1`,
      params
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Top tracks error:', error);
    res.status(500).json({ error: 'Failed to fetch top tracks' });
  }
});

module.exports = router;
