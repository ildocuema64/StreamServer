// =============================================================================
// Authentication Routes
// =============================================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query } = require('../database/connection');
const { generateToken, generateRefreshToken, verifyToken, authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const Joi = require('joi');
const { buildListenUrl, buildDirectListenUrl, buildPlayerUrl, buildButtConfig, getRequestPublicOrigin, getIcecastConnectHostname } = require('../utils/streamUrls');
const { getSubscriptionSummary } = require('../services/subscriptions');

// Validation schemas
const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required()
});

const registerSchema = Joi.object({
  username: Joi.string().min(3).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(128).required(),
  display_name: Joi.string().max(100)
});

// POST /api/auth/signup (public self-registration)
router.post('/signup', async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { username, email, password, display_name } = value;

    const existing = await query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const userResult = await query(
      `INSERT INTO users (username, email, password_hash, display_name, role, account_status)
       VALUES ($1, $2, $3, $4, 'dj', 'active')
       RETURNING id, username, email, display_name, role`,
      [username, email, passwordHash, display_name || username]
    );
    const user = userResult.rows[0];

    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    await query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, refreshToken]
    );

    const subscription = await getSubscriptionSummary(user.id, user.role);

    res.status(201).json({
      token,
      refreshToken,
      user,
      subscription,
      message: 'Conta criada! Escolhe um plano de assinatura para criar a tua estação.'
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Account already exists' });
    }
    logger.error('Signup error:', error);
    res.status(500).json({
      error: 'Signup failed',
      ...(process.env.NODE_ENV !== 'production' && {
        details: error.message,
        code: error.code
      })
    });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { username, password } = value;

    const result = await query(
      'SELECT * FROM users WHERE (username = $1 OR email = $1) AND is_active = true',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    if (user.auth_user_id && !user.password_hash) {
      return res.status(400).json({
        error: 'Conta com login Supabase. Usa o e-mail e palavra‑passe no modo Supabase (ou a app com VITE_USE_SUPABASE_AUTH).'
      });
    }
    if (!user.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token
    await query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, refreshToken]
    );

    logger.info(`User logged in: ${user.username}`);

    const subscription = await getSubscriptionSummary(user.id, user.role);

    res.json({
      token,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
        avatar_url: user.avatar_url
      },
      subscription
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/register (admin only creates users)
router.post('/register', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can create users' });
    }

    const { error, value } = registerSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { username, email, password, display_name } = value;

    // Check uniqueness
    const existing = await query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await query(
      `INSERT INTO users (username, email, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email, display_name, role`,
      [username, email, passwordHash, display_name || username, req.body.role || 'dj']
    );

    logger.info(`User created: ${username} by ${req.user.username}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const decoded = verifyToken(refreshToken);
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Verify token exists in database
    const tokenResult = await query(
      'SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()',
      [refreshToken]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(401).json({ error: 'Refresh token expired or revoked' });
    }

    // Get user
    const userResult = await query(
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const newToken = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Rotate refresh token
    await query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    await query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, newRefreshToken]
    );

    res.json({ token: newToken, refreshToken: newRefreshToken });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    }
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

// GET /api/auth/stream-connection — Icecast source credentials for current user (after Supabase or app signup)
router.get('/stream-connection', authenticate, async (req, res) => {
  try {
    const dj = await query(
      `SELECT dp.source_password, dp.source_username, s.mountpoint, s.bitrate, s.format, s.name as station_name
       FROM dj_profiles dp
       JOIN stations s ON dp.station_id = s.id
       WHERE dp.user_id = $1 AND dp.is_active = true
       LIMIT 1`,
      [req.user.id]
    );

    if (dj.rows.length === 0) {
      return res.json({ streamConnection: null });
    }

    const row = dj.rows[0];
    const urlContext = { origin: getRequestPublicOrigin(req) };
    const mount = row.mountpoint || '/live';

    const stationForButt = {
      name: row.station_name,
      mountpoint: mount,
      source_password: row.source_password,
      format: row.format,
      bitrate: row.bitrate,
      dj_name: row.dj_name
    };

    const icecastHost = getIcecastConnectHostname();
    const icecastPort = parseInt(process.env.ICECAST_PORT, 10) || 8000;

    res.json({
      streamConnection: {
        icecast: {
          host: icecastHost,
          port: icecastPort,
          mountpoint: mount,
          username: row.source_username || 'source',
          password: row.source_password,
          format: row.format || 'mp3',
          bitrate: row.bitrate || 128
        },
        listen_url: buildListenUrl(mount, urlContext),
        listen_url_direct: buildDirectListenUrl(mount),
        player_url: buildPlayerUrl(mount, urlContext),
        butt: buildButtConfig(stationForButt, urlContext),
        station: { name: row.station_name }
      }
    });
  } catch (error) {
    logger.error('stream-connection error:', error);
    res.status(500).json({ error: 'Failed to load stream credentials' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, username, email, display_name, role, avatar_url, last_login, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// PUT /api/auth/password
router.put('/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Valid current and new password required (min 8 chars)' });
    }

    const result = await query('SELECT password_hash, auth_user_id FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows[0].password_hash) {
      return res.status(400).json({ error: 'Password is managed by Supabase Auth. Use recover password in the login screen.' });
    }
    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);

    // Revoke all refresh tokens
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.user.id]);

    res.json({ message: 'Password updated. Please log in again.' });
  } catch (error) {
    res.status(500).json({ error: 'Password update failed' });
  }
});

module.exports = router;
