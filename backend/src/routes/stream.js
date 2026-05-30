// =============================================================================
// Stream Control Routes
// =============================================================================

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { sendCommand, getStatus } = require('../services/liquidsoap');
const { getActiveMounts, killSource } = require('../services/icecast');
const { broadcast } = require('../services/websocket');
const logger = require('../utils/logger');

// GET /api/stream/status - Current stream status
router.get('/status', authenticate, async (req, res) => {
  try {
    if (process.env.ICECAST_DISABLED === 'true' || process.env.SKIP_ICECAST === 'true') {
      return res.json({
        mounts: [],
        liquidsoap: null,
        disabled: true,
        message: 'Icecast/Liquidsoap disabled (ICECAST_DISABLED)',
        timestamp: new Date().toISOString()
      });
    }
    const mounts = await getActiveMounts();
    const liquidsoapStatus = await getStatus();

    res.json({
      mounts,
      liquidsoap: liquidsoapStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Stream status error:', error);
    res.status(500).json({ error: 'Failed to fetch stream status' });
  }
});

// POST /api/stream/autodj/start - Start AutoDJ
router.post('/autodj/start', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const result = await sendCommand('autodj.start');
    broadcast('stream', { action: 'autodj_started' });
    logger.info('AutoDJ started by user:', req.user.username);
    res.json({ message: 'AutoDJ started', result });
  } catch (error) {
    logger.error('Start AutoDJ error:', error);
    res.status(500).json({ error: 'Failed to start AutoDJ' });
  }
});

// POST /api/stream/autodj/stop - Stop AutoDJ
router.post('/autodj/stop', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const result = await sendCommand('autodj.stop');
    broadcast('stream', { action: 'autodj_stopped' });
    logger.info('AutoDJ stopped by user:', req.user.username);
    res.json({ message: 'AutoDJ stopped', result });
  } catch (error) {
    logger.error('Stop AutoDJ error:', error);
    res.status(500).json({ error: 'Failed to stop AutoDJ' });
  }
});

// POST /api/stream/autodj/skip - Skip current track
router.post('/autodj/skip', authenticate, authorize('admin', 'manager', 'dj'), async (req, res) => {
  try {
    const result = await sendCommand('autodj.skip');
    broadcast('stream', { action: 'track_skipped', by: req.user.username });
    res.json({ message: 'Track skipped', result });
  } catch (error) {
    logger.error('Skip track error:', error);
    res.status(500).json({ error: 'Failed to skip track' });
  }
});

// POST /api/stream/metadata - Update stream metadata
router.post('/metadata', authenticate, authorize('admin', 'manager', 'dj'), async (req, res) => {
  try {
    const { title, artist, mount } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const metadata = `${artist ? artist + ' - ' : ''}${title}`;
    await sendCommand(`metadata.update ${mount || 'live'} "${metadata}"`);

    broadcast('metadata', { title, artist, mount, updatedBy: req.user.username });
    res.json({ message: 'Metadata updated' });
  } catch (error) {
    logger.error('Update metadata error:', error);
    res.status(500).json({ error: 'Failed to update metadata' });
  }
});

// POST /api/stream/recording/start - Start recording
router.post('/recording/start', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const result = await sendCommand('recording.start');
    broadcast('stream', { action: 'recording_started' });
    logger.info('Recording started by user:', req.user.username);
    res.json({ message: 'Recording started', result });
  } catch (error) {
    logger.error('Start recording error:', error);
    res.status(500).json({ error: 'Failed to start recording' });
  }
});

// POST /api/stream/recording/stop - Stop recording
router.post('/recording/stop', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const result = await sendCommand('recording.stop');
    broadcast('stream', { action: 'recording_stopped' });
    logger.info('Recording stopped by user:', req.user.username);
    res.json({ message: 'Recording stopped', result });
  } catch (error) {
    logger.error('Stop recording error:', error);
    res.status(500).json({ error: 'Failed to stop recording' });
  }
});

// POST /api/stream/kick - Kick a source from mount
router.post('/kick', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { mount } = req.body;
    if (!mount) {
      return res.status(400).json({ error: 'Mount is required' });
    }

    await killSource(mount);
    broadcast('stream', { action: 'source_kicked', mount });
    logger.warn('Source kicked from mount:', mount, 'by:', req.user.username);
    res.json({ message: `Source kicked from ${mount}` });
  } catch (error) {
    logger.error('Kick source error:', error);
    res.status(500).json({ error: 'Failed to kick source' });
  }
});

module.exports = router;
