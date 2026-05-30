// =============================================================================
// Station Management Routes
// =============================================================================

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { query } = require('../database/connection');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');
const Joi = require('joi');
const {
  enrichStation,
  defaultMountForSlug
} = require('../utils/streamUrls');

const stationSchema = Joi.object({
  name: Joi.string().max(100).required(),
  slug: Joi.string().max(100).pattern(/^[a-z0-9-]+$/),
  description: Joi.string().allow(''),
  genre: Joi.string().max(100),
  mountpoint: Joi.string().max(100),
  bitrate: Joi.number().integer().min(32).max(320).default(128),
  format: Joi.string().valid('mp3', 'aac', 'ogg').default('mp3'),
  is_active: Joi.boolean().default(true),
  max_listeners: Joi.number().integer().min(1).max(10000).default(500)
});

async function createDefaultPlaylists(stationId) {
  const defaults = [
    { name: 'Music', description: 'Main music rotation', type: 'music' },
    { name: 'Jingles', description: 'Station jingles and IDs', type: 'jingles' },
    { name: 'Advertisements', description: 'Commercial breaks', type: 'ads' }
  ];

  for (const pl of defaults) {
    const exists = await query(
      'SELECT 1 FROM playlists WHERE station_id = $1 AND name = $2',
      [stationId, pl.name]
    );
    if (exists.rows.length === 0) {
      await query(
        'INSERT INTO playlists (station_id, name, description, type) VALUES ($1, $2, $3, $4)',
        [stationId, pl.name, pl.description, pl.type]
      );
    }
  }
}

function generateSourcePassword() {
  return crypto.randomBytes(16).toString('base64url');
}

// GET /api/stations - List all stations
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT s.*, 
        (SELECT COUNT(*) FROM dj_profiles dp WHERE dp.station_id = s.id AND dp.is_active = true) as dj_count,
        (SELECT COUNT(*) FROM playlists p WHERE p.station_id = s.id) as playlist_count
       FROM stations s ORDER BY s.created_at DESC`
    );
    res.json(result.rows.map((s) => enrichStation(s)));
  } catch (error) {
    logger.error('Get stations error:', error);
    res.status(500).json({ error: 'Failed to fetch stations' });
  }
});

// GET /api/stations/:id/stream-config - BUTT credentials & public listen URLs
router.get('/:id/stream-config', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT * FROM stations WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Station not found' });
    }

    const station = enrichStation(result.rows[0]);
    res.json({
      station: {
        id: station.id,
        name: station.name,
        slug: station.slug,
        mountpoint: station.mountpoint,
        format: station.format,
        bitrate: station.bitrate
      },
      listen_url: station.listen_url,
      listen_url_direct: station.listen_url_direct,
      player_url: station.player_url,
      icecast: station.icecast,
      butt: station.butt
    });
  } catch (error) {
    logger.error('Stream config error:', error);
    res.status(500).json({ error: 'Failed to fetch stream configuration' });
  }
});

// POST /api/stations/:id/regenerate-password
router.post('/:id/regenerate-password', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const newPassword = generateSourcePassword();
    const result = await query(
      'UPDATE stations SET source_password = $1 WHERE id = $2 RETURNING *',
      [newPassword, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Station not found' });
    }

    logger.info(`Station password regenerated: ${result.rows[0].name} by ${req.user.username}`);
    res.json(enrichStation(result.rows[0]));
  } catch (error) {
    res.status(500).json({ error: 'Failed to regenerate password' });
  }
});

// GET /api/stations/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT * FROM stations WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Station not found' });
    }
    res.json(enrichStation(result.rows[0]));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch station' });
  }
});

// POST /api/stations
router.post('/', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { error, value } = stationSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const slug = value.slug || value.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const mountpoint = value.mountpoint || defaultMountForSlug(slug);
    const sourcePassword = generateSourcePassword();

    const result = await query(
      `INSERT INTO stations (name, slug, description, genre, mountpoint, bitrate, format, is_active, max_listeners, source_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [value.name, slug, value.description, value.genre, mountpoint,
       value.bitrate, value.format, value.is_active, value.max_listeners, sourcePassword]
    );

    const station = result.rows[0];
    await createDefaultPlaylists(station.id);

    // Link creator as DJ if they don't have a profile for this station
    const existingDj = await query(
      'SELECT id FROM dj_profiles WHERE user_id = $1 AND station_id = $2',
      [req.user.id, station.id]
    );

    if (existingDj.rows.length === 0) {
      await query(
        `INSERT INTO dj_profiles (user_id, station_id, dj_name, bio, source_password, allowed_mountpoints, is_active)
         VALUES ($1, $2, $3, '', $4, $5, true)`,
        [req.user.id, station.id, req.user.display_name || req.user.username, sourcePassword, [mountpoint]]
      );
    }

    logger.info(`Station created: ${value.name} (${mountpoint}) by ${req.user.username}`);
    res.status(201).json(enrichStation(station));
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Station slug already exists' });
    }
    logger.error('Create station error:', error);
    res.status(500).json({ error: 'Failed to create station' });
  }
});

// PUT /api/stations/:id
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { error, value } = stationSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const result = await query(
      `UPDATE stations SET name=$1, description=$2, genre=$3, mountpoint=$4,
       bitrate=$5, format=$6, is_active=$7, max_listeners=$8
       WHERE id = $9 RETURNING *`,
      [value.name, value.description, value.genre, value.mountpoint,
       value.bitrate, value.format, value.is_active, value.max_listeners, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Station not found' });
    }

    res.json(enrichStation(result.rows[0]));
  } catch (error) {
    res.status(500).json({ error: 'Failed to update station' });
  }
});

// DELETE /api/stations/:id
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await query('DELETE FROM stations WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Station not found' });
    }
    res.json({ message: 'Station deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete station' });
  }
});

module.exports = router;
