// =============================================================================
// DJ / Broadcaster Routes
// =============================================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query } = require('../database/connection');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');
const { buildButtConfig } = require('../utils/streamUrls');

// GET /api/djs - List all DJ profiles
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT dp.*, u.username, u.email, u.display_name as user_display_name, s.name as station_name
       FROM dj_profiles dp
       JOIN users u ON dp.user_id = u.id
       JOIN stations s ON dp.station_id = s.id
       ORDER BY dp.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Get DJs error:', error);
    res.status(500).json({ error: 'Failed to fetch DJ profiles' });
  }
});

// GET /api/djs/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT dp.*, u.username, s.name as station_name
       FROM dj_profiles dp
       JOIN users u ON dp.user_id = u.id
       JOIN stations s ON dp.station_id = s.id
       WHERE dp.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'DJ profile not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch DJ profile' });
  }
});

// POST /api/djs
router.post('/', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { user_id, station_id, dj_name, bio, source_password, allowed_mountpoints } = req.body;

    if (!user_id || !station_id || !dj_name || !source_password) {
      return res.status(400).json({ error: 'user_id, station_id, dj_name, and source_password are required' });
    }

    const result = await query(
      `INSERT INTO dj_profiles (user_id, station_id, dj_name, bio, source_password, allowed_mountpoints)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [user_id, station_id, dj_name, bio || '', source_password,
       allowed_mountpoints || ['/live']]
    );

    logger.info(`DJ profile created: ${dj_name} by ${req.user.username}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'DJ profile already exists for this user/station' });
    }
    logger.error('Create DJ error:', error);
    res.status(500).json({ error: 'Failed to create DJ profile' });
  }
});

// PUT /api/djs/:id
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { dj_name, bio, source_password, allowed_mountpoints, is_active } = req.body;

    const result = await query(
      `UPDATE dj_profiles SET dj_name = COALESCE($1, dj_name), bio = COALESCE($2, bio),
       source_password = COALESCE($3, source_password), allowed_mountpoints = COALESCE($4, allowed_mountpoints),
       is_active = COALESCE($5, is_active)
       WHERE id = $6 RETURNING *`,
      [dj_name, bio, source_password, allowed_mountpoints, is_active, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'DJ profile not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update DJ profile' });
  }
});

// DELETE /api/djs/:id
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await query('DELETE FROM dj_profiles WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'DJ profile not found' });
    }
    res.json({ message: 'DJ profile deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete DJ profile' });
  }
});

// GET /api/djs/:id/butt-config - Generate BUTT configuration
router.get('/:id/butt-config', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT dp.*, s.mountpoint, s.bitrate, s.format, s.name as station_name
       FROM dj_profiles dp
       JOIN stations s ON dp.station_id = s.id
       WHERE dp.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'DJ profile not found' });
    }

    const dj = result.rows[0];
    const buttConfig = buildButtConfig({
      name: dj.station_name,
      mountpoint: dj.mountpoint,
      source_password: dj.source_password,
      format: dj.format,
      bitrate: dj.bitrate,
      dj_name: dj.dj_name
    });

    res.json(buttConfig);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate BUTT config' });
  }
});

module.exports = router;
