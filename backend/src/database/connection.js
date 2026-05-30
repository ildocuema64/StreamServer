// =============================================================================
// PostgreSQL Database Connection
// =============================================================================

const { Pool } = require('pg');
const logger = require('../utils/logger');

function normalizeHost(host) {
  // "localhost" often resolves to ::1 first; many local Postgres setups only listen on IPv4.
  if (!host || host === 'localhost') return '127.0.0.1';
  return host;
}

function hasDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  return Boolean(url && String(url).trim());
}

function buildLocalPoolConfig() {
  const max = 20;
  const idleTimeoutMillis = 30000;
  const connectionTimeoutMillis = parseInt(process.env.POSTGRES_CONNECT_TIMEOUT_MS, 10) || 10000;
  const host = normalizeHost(process.env.POSTGRES_HOST);

  return {
    host,
    port: parseInt(process.env.POSTGRES_PORT, 10) || 5432,
    database: process.env.POSTGRES_DB || 'streamserver',
    user: process.env.POSTGRES_USER || 'streamadmin',
    password: process.env.POSTGRES_PASSWORD || 'devpassword',
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis
  };
}

function buildPoolConfig() {
  const max = 20;
  const idleTimeoutMillis = 30000;
  const connectionTimeoutMillis = parseInt(process.env.POSTGRES_CONNECT_TIMEOUT_MS, 10) || 10000;

  if (process.env.DATABASE_USE_LOCAL === 'true' || !hasDatabaseUrl()) {
    return buildLocalPoolConfig();
  }

  const disableSsl = process.env.DATABASE_SSL === 'false';
  const ssl = disableSsl ? false : { rejectUnauthorized: false };
  return {
    connectionString: process.env.DATABASE_URL,
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    ssl
  };
}

function describePoolConfig(cfg) {
  if (cfg.connectionString) {
    try {
      const normalized = cfg.connectionString.replace(/^postgresql:/i, 'postgres:');
      const u = new URL(normalized);
      return `${u.hostname}:${u.port || '5432'}${u.pathname || '/postgres'}`;
    } catch {
      return 'DATABASE_URL';
    }
  }
  return `${cfg.host}:${cfg.port}/${cfg.database} (user: ${cfg.user})`;
}

let activeConfig = buildPoolConfig();
let pool = new Pool(activeConfig);

pool.on('error', (err) => {
  logger.error('Unexpected database pool error:', err);
});

function isRecoverableConnectionError(error) {
  return ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH'].includes(error && error.code);
}

async function switchToLocalPool(reason) {
  logger.warn(
    `${reason} — falling back to POSTGRES_* for local development. ` +
      'Fix DATABASE_URL in .env or set DATABASE_USE_LOCAL=true to skip Supabase.'
  );
  await pool.end().catch(() => {});
  activeConfig = buildLocalPoolConfig();
  pool = new Pool(activeConfig);
  pool.on('error', (err) => {
    logger.error('Unexpected database pool error:', err);
  });
}

async function verifyPoolConnection() {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT NOW()');
    logger.info(`Database time: ${result.rows[0].now}`);
  } finally {
    client.release();
  }
}

async function initDatabase() {
  const usingDatabaseUrl = hasDatabaseUrl() && process.env.DATABASE_USE_LOCAL !== 'true';

  if (!usingDatabaseUrl) {
    logger.info(`Postgres target: ${describePoolConfig(activeConfig)}`);
  } else {
    logger.info(`Postgres target (DATABASE_URL): ${describePoolConfig(activeConfig)}`);
  }

  const maxAttempts = parseInt(process.env.POSTGRES_CONNECT_RETRIES, 10) || 10;
  const baseDelayMs = parseInt(process.env.POSTGRES_CONNECT_RETRY_DELAY_MS, 10) || 500;

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await verifyPoolConnection();
      return;
    } catch (error) {
      lastError = error;

      if (
        usingDatabaseUrl &&
        process.env.NODE_ENV !== 'production' &&
        isRecoverableConnectionError(error)
      ) {
        await switchToLocalPool(`DATABASE_URL unreachable (${error.code})`);
        try {
          await verifyPoolConnection();
          logger.info(`Postgres target (fallback): ${describePoolConfig(activeConfig)}`);
          return;
        } catch (fallbackError) {
          lastError = fallbackError;
        }
      }

      const waitMs = Math.min(5000, baseDelayMs * attempt);
      logger.warn(`Database connection attempt ${attempt}/${maxAttempts} failed; retrying in ${waitMs}ms`, {
        code: error && error.code,
        target: describePoolConfig(activeConfig)
      });
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  logger.error('Database initialization failed:', lastError);
  logger.error(
    'Postgres is unreachable. For Supabase on IPv4-only networks use the pooler host ' +
      '(Connect → Session mode), not db.[ref].supabase.co. ' +
      'Or start local Postgres / set DATABASE_USE_LOCAL=true.',
    { target: describePoolConfig(activeConfig) }
  );
  throw lastError;
}

async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) {
    logger.warn(`Slow query (${duration}ms):`, { text: text.substring(0, 100) });
  }
  return result;
}

async function getClient() {
  return pool.connect();
}

module.exports = { pool, query, getClient, initDatabase };
