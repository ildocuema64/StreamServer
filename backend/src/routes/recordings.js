// =============================================================================
// Recordings Routes
// =============================================================================

const express = require('express');
const router = express.Router();
const { query } = require('../database/connection');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs').promises;

const RECORDINGS_DIR = process.env.RECORDINGS_DIR
  || process.env.RECORDINGS_PATH
  || '/var/media/recordings';

// GET /api/recordings - List recordings
router.get('/', authenticate, async (req, res) => {
  try {
    const { station_id, limit = 50, offset = 0 } = req.query;
    const params = [parseInt(limit), parseInt(offset)];
    let stationFilter = '';

    if (station_id) {
      params.push(station_id);
      stationFilter = `WHERE r.station_id = $${params.length}`;
    }

    const result = await query(
      `SELECT r.*, s.name as station_name
       FROM recordings r
       LEFT JOIN stations s ON r.station_id = s.id
       ${stationFilter}
       ORDER BY r.started_at DESC
       LIMIT $1 OFFSET $2`,
      params
    );

    const countResult = await query(
      `SELECT COUNT(*) as total FROM recordings r ${stationFilter}`,
      station_id ? [station_id] : []
    );

    res.json({
      recordings: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('List recordings error:', error);
    res.status(500).json({ error: 'Failed to fetch recordings' });
  }
});

// GET /api/recordings/:id - Get recording details
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT r.*, s.name as station_name
       FROM recordings r
       LEFT JOIN stations s ON r.station_id = s.id
       WHERE r.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch recording' });
  }
});

// GET /api/recordings/:id/download - Download recording
router.get('/:id/download', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT * FROM recordings WHERE id = $1', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    const recording = result.rows[0];
    const filePath = path.join(RECORDINGS_DIR, recording.file_path);

    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'Recording file not found on disk' });
    }

    const filename = `recording_${recording.id}_${recording.started_at.toISOString().slice(0, 10)}.${recording.format || 'mp3'}`;
    res.download(filePath, filename);
  } catch (error) {
    logger.error('Download recording error:', error);
    res.status(500).json({ error: 'Failed to download recording' });
  }
});

// DELETE /api/recordings/:id - Delete recording
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await query('SELECT * FROM recordings WHERE id = $1', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    const recording = result.rows[0];

    // Delete file from disk
    try {
      const filePath = path.join(RECORDINGS_DIR, recording.file_path);
      await fs.unlink(filePath);
    } catch (err) {
      logger.warn('Recording file already removed:', err.message);
    }

    // Delete from database
    await query('DELETE FROM recordings WHERE id = $1', [req.params.id]);

    res.json({ message: 'Recording deleted' });
  } catch (error) {
    logger.error('Delete recording error:', error);
    res.status(500).json({ error: 'Failed to delete recording' });
  }
});

module.exports = router;
