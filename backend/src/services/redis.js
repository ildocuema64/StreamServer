// =============================================================================
// Redis Service
// =============================================================================

const { createClient } = require('redis');
const logger = require('../utils/logger');

let redisClient;
let redisDisabled = false;

function createNoopRedis() {
  return {
    async ping() {
      return 'PONG';
    },
    async get() {
      return null;
    },
    async setEx() {},
    async del() {},
    async publish() {}
  };
}

async function initRedis() {
  if (process.env.REDIS_DISABLED === 'true' || process.env.SKIP_REDIS === 'true') {
    redisDisabled = true;
    redisClient = createNoopRedis();
    logger.warn('Redis disabled (REDIS_DISABLED/SKIP_REDIS) — cache/pub-sub are no-ops; enable Redis for production');
    return;
  }

  redisClient = createClient({
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379
    },
    password: process.env.REDIS_PASSWORD || 'devredis'
  });

  redisClient.on('error', (err) => {
    logger.error('Redis error:', err);
  });

  redisClient.on('connect', () => {
    logger.debug('Redis connected');
  });

  await redisClient.connect();
}

function getRedis() {
  return redisClient;
}

function isRedisDisabled() {
  return redisDisabled;
}

// Cache helpers
async function cacheGet(key) {
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    logger.warn('Cache get error:', err.message);
    return null;
  }
}

async function cacheSet(key, value, ttlSeconds = 60) {
  try {
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    logger.warn('Cache set error:', err.message);
  }
}

async function cacheDel(key) {
  try {
    await redisClient.del(key);
  } catch (err) {
    logger.warn('Cache delete error:', err.message);
  }
}

// Pub/Sub for real-time events
async function publishEvent(channel, data) {
  try {
    await redisClient.publish(channel, JSON.stringify(data));
  } catch (err) {
    logger.warn('Publish error:', err.message);
  }
}

module.exports = { initRedis, getRedis, isRedisDisabled, cacheGet, cacheSet, cacheDel, publishEvent };
