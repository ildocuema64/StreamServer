// =============================================================================
// Playlist Routes
// =============================================================================

const express = require('express');
const router = express.Router();
const { query } = require('../database/connection');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');

// GET /api/playlists
router.get('/', authenticate, async (req, res) => {
  try {
    const { station_id, type } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (station_id) {
      params.push(station_id);
      whereClause += ` AND p.station_id = $${params.length}`;
    }
    if (type) {
      params.push(type);
      whereClause += ` AND p.type = $${params.length}`;
    }

    const result = await query(
      `SELECT p.*,
        s.name as station_name,
        (SELECT COUNT(*) FROM playlist_items pi WHERE pi.playlist_id = p.id) as item_count,
        (SELECT COALESCE(SUM(mf.duration), 0) FROM playlist_items pi
         JOIN media_files mf ON pi.media_file_id = mf.id WHERE pi.playlist_id = p.id) as total_duration
       FROM playlists p
       JOIN stations s ON p.station_id = s.id
       ${whereClause}
       ORDER BY p.created_at DESC`,
      params
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Get playlists error:', error);
    res.status(500).json({ error: 'Failed to fetch playlists' });
  }
});

// GET /api/playlists/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT * FROM playlists WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Get items
    const items = await query(
      `SELECT pi.*, mf.title, mf.artist, mf.album, mf.duration, mf.file_path, mf.filename
       FROM playlist_items pi
       JOIN media_files mf ON pi.media_file_id = mf.id
       WHERE pi.playlist_id = $1
       ORDER BY pi.position`,
      [req.params.id]
    );

    res.json({ ...result.rows[0], items: items.rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});

// POST /api/playlists
router.post('/', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { station_id, name, description, type, play_order } = req.body;

    if (!station_id || !name) {
      return res.status(400).json({ error: 'station_id and name are required' });
    }

    const result = await query(
      `INSERT INTO playlists (station_id, name, description, type, play_order, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [station_id, name, description || '', type || 'music', play_order || 'shuffle', req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Create playlist error:', error);
    res.status(500).json({ error: 'Failed to create playlist' });
  }
});

// POST /api/playlists/:id/items - Add items to playlist
router.post('/:id/items', authenticate, authorize('admin', 'manager', 'dj'), async (req, res) => {
  try {
    const { media_file_ids } = req.body;
    if (!Array.isArray(media_file_ids) || media_file_ids.length === 0) {
      return res.status(400).json({ error: 'media_file_ids array required' });
    }

    // Get max position
    const posResult = await query(
      'SELECT COALESCE(MAX(position), 0) as max_pos FROM playlist_items WHERE playlist_id = $1',
      [req.params.id]
    );
    let position = posResult.rows[0].max_pos;

    const added = [];
    for (const mediaId of media_file_ids) {
      position++;
      const result = await query(
        `INSERT INTO playlist_items (playlist_id, media_file_id, position)
         VALUES ($1, $2, $3) RETURNING *`,
        [req.params.id, mediaId, position]
      );
      added.push(result.rows[0]);
    }

    res.status(201).json({ added: added.length, items: added });
  } catch (error) {
    logger.error('Add playlist items error:', error);
    res.status(500).json({ error: 'Failed to add items to playlist' });
  }
});

// DELETE /api/playlists/:id/items/:itemId
router.delete('/:id/items/:itemId', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    await query('DELETE FROM playlist_items WHERE id = $1 AND playlist_id = $2',
      [req.params.itemId, req.params.id]);
    res.json({ message: 'Item removed from playlist' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove item' });
  }
});

// PUT /api/playlists/:id
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { name, description, type, play_order, is_active } = req.body;
    const result = await query(
      `UPDATE playlists SET name = COALESCE($1, name), description = COALESCE($2, description),
       type = COALESCE($3, type), play_order = COALESCE($4, play_order), is_active = COALESCE($5, is_active)
       WHERE id = $6 RETURNING *`,
      [name, description, type, play_order, is_active, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update playlist' });
  }
});

// DELETE /api/playlists/:id
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    await query('DELETE FROM playlists WHERE id = $1', [req.params.id]);
    res.json({ message: 'Playlist deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete playlist' });
  }
});

module.exports = router;
