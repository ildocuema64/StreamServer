// =============================================================================
// Health Check Routes
// =============================================================================

const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { getRedis, isRedisDisabled } = require('../services/redis');
const { getServerStats } = require('../services/icecast');

router.get('/', async (req, res) => {
  const checks = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {}
  };

  // Check database
  try {
    await pool.query('SELECT 1');
    checks.services.database = 'ok';
  } catch {
    checks.services.database = 'error';
    checks.status = 'degraded';
  }

  // Check Redis
  if (isRedisDisabled()) {
    checks.services.redis = 'skipped';
  } else {
    try {
      const redis = getRedis();
      await redis.ping();
      checks.services.redis = 'ok';
    } catch {
      checks.services.redis = 'error';
      checks.status = 'degraded';
    }
  }

  // Check Icecast
  if (process.env.ICECAST_DISABLED === 'true' || process.env.SKIP_ICECAST === 'true') {
    checks.services.icecast = 'skipped';
  } else {
    try {
      const stats = await getServerStats();
      checks.services.icecast = stats ? 'ok' : 'error';
      if (!stats) checks.status = 'degraded';
    } catch {
      checks.services.icecast = 'error';
      checks.status = 'degraded';
    }
  }

  const httpStatus = checks.status === 'ok' ? 200 : 503;
  res.status(httpStatus).json(checks);
});

module.exports = router;
