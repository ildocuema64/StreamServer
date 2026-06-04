// =============================================================================
// Public Routes - No Authentication Required
// =============================================================================

const express = require('express');
const router = express.Router();
const { query } = require('../database/connection');
const { cacheGet, cacheSet } = require('../services/redis');
const { getActiveMounts } = require('../services/icecast');
const { enrichStationPublic } = require('../utils/streamUrls');
const logger = require('../utils/logger');

// GET /api/public/stations - List active stations (public)
router.get('/stations', async (req, res) => {
  try {
    const cached = await cacheGet('public:stations');
    if (cached) return res.json(cached);

    const result = await query(
      `SELECT id, name, description, genre, logo_url, mountpoint,
              bitrate, format, is_active, slug
       FROM stations
       WHERE is_active = true
       ORDER BY name`
    );

    const stations = result.rows.map((row) => enrichStationPublic(row));
    await cacheSet('public:stations', stations, 60);
    res.json(stations);
  } catch (error) {
    logger.error('Public stations error:', error);
    res.status(500).json({ error: 'Failed to fetch stations' });
  }
});

// GET /api/public/stations/:id/now-playing
router.get('/stations/:id/now-playing', async (req, res) => {
  try {
    const cached = await cacheGet(`nowplaying:${req.params.id}`);
    if (cached) return res.json(cached);

    const station = await query('SELECT mountpoint FROM stations WHERE id = $1', [req.params.id]);
    if (station.rows.length === 0) {
      return res.status(404).json({ error: 'Station not found' });
    }

    const mounts = await getActiveMounts();
    const mount = mounts.find(m => '/' + m.mount === station.rows[0].mountpoint);

    const nowPlaying = {
      station_id: req.params.id,
      title: mount?.title || 'Unknown',
      artist: mount?.artist || '',
      listeners: mount?.listeners || 0,
      isLive: !!mount,
      timestamp: new Date().toISOString()
    };

    await cacheSet(`nowplaying:${req.params.id}`, nowPlaying, 10);
    res.json(nowPlaying);
  } catch (error) {
    logger.error('Now playing error:', error);
    res.status(500).json({ error: 'Failed to fetch now playing info' });
  }
});

// GET /api/public/stations/:id/schedule
router.get('/stations/:id/schedule', async (req, res) => {
  try {
    const result = await query(
      `SELECT ss.title, ss.description, ss.day_of_week, ss.start_time, ss.end_time,
              ss.is_live, ss.color, dp.dj_name
       FROM schedule_slots ss
       LEFT JOIN dj_profiles dp ON ss.dj_profile_id = dp.id
       WHERE ss.station_id = $1
       ORDER BY ss.day_of_week, ss.start_time`,
      [req.params.id]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Public schedule error:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// GET /api/public/listeners
router.get('/listeners', async (req, res) => {
  try {
    const mounts = await getActiveMounts();
    const totalListeners = mounts.reduce((sum, m) => sum + m.listeners, 0);

    res.json({
      total: totalListeners,
      stations: mounts.map(m => ({
        mount: m.mount,
        listeners: m.listeners
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch listener count' });
  }
});

module.exports = router;
