// =============================================================================
// Subscription & Account Access Middleware
// =============================================================================

const { hasActiveSubscription } = require('../services/subscriptions');

function requireActiveAccount(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.role === 'admin') return next();
  if (req.user.account_status === 'blocked' || req.user.is_active === false) {
    return res.status(403).json({
      error: 'Conta bloqueada.',
      code: 'ACCOUNT_BLOCKED',
      reason: req.user.blocked_reason || null
    });
  }
  next();
}

async function requireSubscription(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.role === 'admin') return next();

  const active = await hasActiveSubscription(req.user.id, req.user.role);
  if (!active) {
    return res.status(402).json({
      error: 'Assinatura activa necessária. Escolhe um plano para continuar.',
      code: 'SUBSCRIPTION_REQUIRED'
    });
  }
  next();
}

module.exports = { requireActiveAccount, requireSubscription };
