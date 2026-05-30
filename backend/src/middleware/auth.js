// =============================================================================
// JWT Authentication Middleware (legacy + Supabase Auth access tokens)
// =============================================================================

const jwt = require('jsonwebtoken');
const { query } = require('../database/connection');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret';

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/** Verifies Supabase-issued access token (Settings → API → JWT Secret). */
function tryVerifySupabaseAccessToken(token) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret || !token) return null;
  try {
    return jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}

// Authentication middleware
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];

    const supPayload = tryVerifySupabaseAccessToken(token);
    if (supPayload && supPayload.sub) {
      const result = await query(
        'SELECT id, username, email, role FROM users WHERE auth_user_id = $1 AND is_active = true',
        [supPayload.sub]
      );
      if (result.rows.length > 0) {
        const row = result.rows[0];
        req.user = {
          id: row.id,
          username: row.username,
          email: row.email,
          role: row.role
        };
        return next();
      }
    }

    try {
      const decoded = verifyToken(token);
      req.user = decoded;
      return next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    logger.error('authenticate middleware error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

// Role-based authorization middleware
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyToken,
  tryVerifySupabaseAccessToken,
  authenticate,
  authorize
};
