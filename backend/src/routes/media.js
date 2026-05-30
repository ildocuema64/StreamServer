// =============================================================================
// Media Upload & Management Routes
// =============================================================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { query } = require('../database/connection');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');

const MEDIA_PATH = process.env.MEDIA_STORAGE_PATH || '/var/media';

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.body.type || 'music';
    const dest = path.join(MEDIA_PATH, type);
    fs.mkdir(dest, { recursive: true }).then(() => cb(null, dest)).catch(cb);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = uuidv4() + ext;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp3', '.ogg', '.flac', '.wav', '.aac', '.m4a', '.opus'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed`));
    }
  }
});

// POST /api/media/upload - Upload media file(s)
router.post('/upload', authenticate, authorize('admin', 'manager', 'dj'), upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const type = req.body.type || 'music';
    const results = [];

    for (const file of req.files) {
      // Try to extract metadata
      let metadata = {};
      try {
        const mm = await import('music-metadata');
        const parsed = await mm.parseFile(file.path);
        metadata = {
          title: parsed.common.title || path.basename(file.originalname, path.extname(file.originalname)),
          artist: parsed.common.artist || 'Unknown',
          album: parsed.common.album || '',
          genre: parsed.common.genre?.[0] || '',
          year: parsed.common.year || null,
          duration: parsed.format.duration || null,
          bitrate: parsed.format.bitrate ? Math.round(parsed.format.bitrate / 1000) : null,
          sample_rate: parsed.format.sampleRate || null,
          channels: parsed.format.numberOfChannels || 2
        };
      } catch (metaErr) {
        logger.warn(`Could not parse metadata for ${file.originalname}:`, metaErr.message);
        metadata = {
          title: path.basename(file.originalname, path.extname(file.originalname)),
          artist: 'Unknown'
        };
      }

      const result = await query(
        `INSERT INTO media_files (filename, original_name, file_path, file_size, duration, format,
         bitrate, sample_rate, channels, title, artist, album, genre, year, type, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING *`,
        [
          file.filename, file.originalname, file.path, file.size,
          metadata.duration, path.extname(file.originalname).substring(1),
          metadata.bitrate, metadata.sample_rate, metadata.channels,
          metadata.title, metadata.artist, metadata.album,
          metadata.genre, metadata.year, type, req.user.id
        ]
      );

      results.push(result.rows[0]);
    }

    logger.info(`${results.length} files uploaded by ${req.user.username}`);
    res.status(201).json({ uploaded: results.length, files: results });
  } catch (error) {
    logger.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// GET /api/media - List media files
router.get('/', authenticate, async (req, res) => {
  try {
    const { type, page = 1, limit = 50, search } = req.query;
    const offset = (page - 1) * limit;
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (type) {
      params.push(type);
      whereClause += ` AND type = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (title ILIKE $${params.length} OR artist ILIKE $${params.length} OR original_name ILIKE $${params.length})`;
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM media_files ${whereClause}`, params
    );

    params.push(limit, offset);
    const result = await query(
      `SELECT * FROM media_files ${whereClause} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
      files: result.rows
    });
  } catch (error) {
    logger.error('Get media error:', error);
    res.status(500).json({ error: 'Failed to fetch media files' });
  }
});

// GET /api/media/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT * FROM media_files WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch media file' });
  }
});

// PUT /api/media/:id - Update metadata
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { title, artist, album, genre, type } = req.body;
    const result = await query(
      `UPDATE media_files SET title = COALESCE($1, title), artist = COALESCE($2, artist),
       album = COALESCE($3, album), genre = COALESCE($4, genre), type = COALESCE($5, type)
       WHERE id = $6 RETURNING *`,
      [title, artist, album, genre, type, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update media file' });
  }
});

// DELETE /api/media/:id
router.delete('/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const result = await query('SELECT * FROM media_files WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }

    // Delete physical file
    try {
      await fs.unlink(result.rows[0].file_path);
    } catch (fsErr) {
      logger.warn('Could not delete physical file:', fsErr.message);
    }

    await query('DELETE FROM media_files WHERE id = $1', [req.params.id]);
    res.json({ message: 'Media file deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete media file' });
  }
});

module.exports = router;
