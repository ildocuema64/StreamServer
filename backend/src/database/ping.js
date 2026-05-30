// =============================================================================
// DB connectivity check – run: npm run db:ping
// =============================================================================

require('../utils/loadEnv').loadEnv();

const { pool } = require('./connection');

function describeTarget() {
  const raw = process.env.DATABASE_URL;
  if (raw) {
    try {
      const normalized = raw.replace(/^postgresql:/i, 'postgres:');
      const u = new URL(normalized);
      const path = u.pathname || '/';
      return `DATABASE_URL → ${u.hostname}:${u.port || '5432'}${path}`;
    } catch {
      return 'DATABASE_URL (inválida ou opaca)';
    }
  }
  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = process.env.POSTGRES_PORT || '5432';
  const db = process.env.POSTGRES_DB || 'streamserver';
  const user = process.env.POSTGRES_USER || 'streamadmin';
  return `${user}@${host}:${port}/${db}`;
}

async function main() {
  console.log(`Trying PostgreSQL: ${describeTarget()}`);
  try {
    const client = await pool.connect();
    try {
      const r = await client.query('SELECT current_database() AS db, current_user AS user');
      console.log('OK:', r.rows[0]);
    } finally {
      client.release();
    }
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      console.error('\nECONNREFUSED – nothing is listening on that host:port.');
      if (process.env.DATABASE_URL) {
        console.error('  • Confirma DATABASE_URL no Supabase (host/porta) e que o projeto está ativo.\n');
      } else {
        console.error('Fix one of these:\n');
        console.error('  • Supabase: define DATABASE_URL em backend/.env (ver .env.example)');
        console.error('  • Docker (project root): docker compose up -d postgres');
        console.error('  • Postgres local (ex.: brew services start postgresql@16)\n');
      }
      console.error('Copy backend/.env.example → backend/.env if you have not yet.\n');
    } else {
      console.error(err.message || err);
    }
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

main();
