// =============================================================================
// Health Check Routes
// =============================================================================

const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { getRedis, isRedisDisabled } = require('../services/redis');
const { getServerStats } = require('../services/icecast');
const { getPublicBaseUrl } = require('../utils/streamUrls');

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

  // Diagnóstico de URLs públicas (sem segredos) — útil para validar APP_URL no Render
  checks.streamConfig = {
    appUrl: process.env.APP_URL || null,
    publicStreamUrl: process.env.PUBLIC_STREAM_URL || null,
    nodeEnv: process.env.NODE_ENV || null,
    resolvedListenBase: getPublicBaseUrl({ origin: req.get('origin') || req.get('referer') }),
    gitCommit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || null
  };

  res.status(httpStatus).json(checks);
});

module.exports = router;
