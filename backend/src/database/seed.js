// =============================================================================
// Seed Script - StreamServer
// =============================================================================

require('../utils/loadEnv').loadEnv();

const bcrypt = require('bcryptjs');
const { query, pool } = require('./connection');
const logger = require('../utils/logger');

async function ensureDefaultStation() {
  const slug = 'main';
  const existing = await query('SELECT id FROM stations WHERE slug = $1', [slug]);
  if (existing.rows.length > 0) return existing.rows[0].id;

  const created = await query(
    `INSERT INTO stations (name, slug, description, genre, mountpoint, bitrate, format, is_active, max_listeners)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)
     RETURNING id`,
    ['Main Station', slug, 'StreamServer Main Radio Station', 'Various', '/live', 128, 'mp3', 500]
  );
  return created.rows[0].id;
}

async function seedAdmin() {
  // Requested credentials
  const adminEmail = 'ildocuema@gmail.com';
  const adminUsername = 'Ildo7';
  const adminPassword = 'Ildo7..Marques';
  const displayName = 'Ildo Marques';

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const existing = await query(
    'SELECT id FROM users WHERE email = $1 OR username = $2 LIMIT 1',
    [adminEmail, adminUsername]
  );

  if (existing.rows.length > 0) {
    const id = existing.rows[0].id;
    await query(
      `UPDATE users
       SET username = $1,
           email = $2,
           password_hash = $3,
           display_name = $4,
           role = 'admin',
           is_active = true,
           updated_at = NOW()
       WHERE id = $5`,
      [adminUsername, adminEmail, passwordHash, displayName, id]
    );
    return { action: 'updated', id };
  }

  const created = await query(
    `INSERT INTO users (username, email, password_hash, display_name, role, is_active)
     VALUES ($1, $2, $3, $4, 'admin', true)
     RETURNING id`,
    [adminUsername, adminEmail, passwordHash, displayName]
  );
  return { action: 'created', id: created.rows[0].id };
}

async function main() {
  try {
    await ensureDefaultStation();
    const adminRes = await seedAdmin();
    logger.info(`✅ Seed complete: admin ${adminRes.action} (${adminRes.id})`);
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      const host = process.env.POSTGRES_HOST || 'localhost';
      const port = process.env.POSTGRES_PORT || '5432';
      const hint = process.env.DATABASE_URL
        ? ' Confirma DATABASE_URL (Supabase) e rede/firewall.'
        : ` Start Postgres or use Supabase: set DATABASE_URL in backend/.env (see .env.example). Or: docker compose up -d postgres from project root.`;
      logger.error(
        `❌ Seed failed: cannot connect to PostgreSQL at ${host}:${port} (ECONNREFUSED).${hint}` +
          ' Apply schema (infrastructure/postgres/init.sql) in Supabase SQL Editor or local DB before first seed if tables are missing.'
      );
    } else {
      logger.error('❌ Seed failed:', err);
    }
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

main();

