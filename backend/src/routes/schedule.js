// =============================================================================
// Schedule Routes
// =============================================================================

const express = require('express');
const router = express.Router();
const { query } = require('../database/connection');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');

// GET /api/schedule - Get schedule for a station
router.get('/', authenticate, async (req, res) => {
  try {
    const { station_id, day_of_week } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (station_id) {
      params.push(station_id);
      whereClause += ` AND ss.station_id = $${params.length}`;
    }

    if (day_of_week !== undefined) {
      params.push(day_of_week);
      whereClause += ` AND ss.day_of_week = $${params.length}`;
    }

    const result = await query(
      `SELECT ss.*, dp.dj_name, p.name as playlist_name, s.name as station_name
       FROM schedule_slots ss
       LEFT JOIN dj_profiles dp ON ss.dj_profile_id = dp.id
       LEFT JOIN playlists p ON ss.playlist_id = p.id
       JOIN stations s ON ss.station_id = s.id
       ${whereClause}
       ORDER BY ss.day_of_week, ss.start_time`,
      params
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Get schedule error:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// POST /api/schedule
router.post('/', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { station_id, dj_profile_id, playlist_id, title, description,
            day_of_week, start_time, end_time, is_live, is_recurring, color } = req.body;

    if (!station_id || !title || day_of_week === undefined || !start_time || !end_time) {
      return res.status(400).json({ error: 'station_id, title, day_of_week, start_time, end_time are required' });
    }

    // Check for conflicts
    const conflicts = await query(
      `SELECT id FROM schedule_slots
       WHERE station_id = $1 AND day_of_week = $2
       AND ((start_time <= $3 AND end_time > $3)
            OR (start_time < $4 AND end_time >= $4)
            OR (start_time >= $3 AND end_time <= $4))`,
      [station_id, day_of_week, start_time, end_time]
    );

    if (conflicts.rows.length > 0) {
      return res.status(409).json({ error: 'Time slot conflict with existing schedule' });
    }

    const result = await query(
      `INSERT INTO schedule_slots (station_id, dj_profile_id, playlist_id, title, description,
       day_of_week, start_time, end_time, is_live, is_recurring, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [station_id, dj_profile_id, playlist_id, title, description,
       day_of_week, start_time, end_time, is_live || false, is_recurring !== false, color || '#3B82F6']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Create schedule error:', error);
    res.status(500).json({ error: 'Failed to create schedule slot' });
  }
});

// PUT /api/schedule/:id
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const fields = req.body;
    const result = await query(
      `UPDATE schedule_slots SET
       title = COALESCE($1, title), description = COALESCE($2, description),
       dj_profile_id = $3, playlist_id = $4,
       day_of_week = COALESCE($5, day_of_week), start_time = COALESCE($6, start_time),
       end_time = COALESCE($7, end_time), is_live = COALESCE($8, is_live),
       color = COALESCE($9, color)
       WHERE id = $10 RETURNING *`,
      [fields.title, fields.description, fields.dj_profile_id, fields.playlist_id,
       fields.day_of_week, fields.start_time, fields.end_time, fields.is_live,
       fields.color, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule slot not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update schedule slot' });
  }
});

// DELETE /api/schedule/:id
router.delete('/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    await query('DELETE FROM schedule_slots WHERE id = $1', [req.params.id]);
    res.json({ message: 'Schedule slot deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete schedule slot' });
  }
});

module.exports = router;
