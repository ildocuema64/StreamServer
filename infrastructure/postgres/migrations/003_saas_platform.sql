-- Migration 003: Multi-user SaaS platform (subscriptions + tenant isolation)

-- User account extensions
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) DEFAULT 'active'
  CHECK (account_status IN ('active', 'blocked', 'pending'));

-- Station ownership (multi-tenant)
ALTER TABLE stations ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stations_owner ON stations(owner_id);

-- Subscription plans
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    interval_type VARCHAR(20) NOT NULL CHECK (interval_type IN ('monthly', 'quarterly', 'semiannual', 'annual')),
    interval_months INTEGER NOT NULL,
    price_cents INTEGER NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    max_stations INTEGER NOT NULL DEFAULT 1,
    max_listeners INTEGER NOT NULL DEFAULT 500,
    description TEXT,
    features JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    stripe_price_id VARCHAR(255),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'active', 'canceled', 'expired', 'past_due')),
    starts_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    stripe_subscription_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_expires ON user_subscriptions(expires_at) WHERE status = 'active';

-- Admin audit log
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id BIGSERIAL PRIMARY KEY,
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default plans (idempotent)
INSERT INTO subscription_plans (name, slug, interval_type, interval_months, price_cents, currency, max_stations, description, sort_order)
SELECT 'Mensal', 'monthly', 'monthly', 1, 990, 'EUR', 1, '1 estação de rádio, renovação mensal', 1
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE slug = 'monthly');

INSERT INTO subscription_plans (name, slug, interval_type, interval_months, price_cents, currency, max_stations, description, sort_order)
SELECT 'Trimestral', 'quarterly', 'quarterly', 3, 2490, 'EUR', 1, '1 estação, pagamento a cada 3 meses (-16%)', 2
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE slug = 'quarterly');

INSERT INTO subscription_plans (name, slug, interval_type, interval_months, price_cents, currency, max_stations, description, sort_order)
SELECT 'Semestral', 'semiannual', 'semiannual', 6, 4490, 'EUR', 2, 'Até 2 estações, pagamento a cada 6 meses (-24%)', 3
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE slug = 'semiannual');

INSERT INTO subscription_plans (name, slug, interval_type, interval_months, price_cents, currency, max_stations, description, sort_order)
SELECT 'Anual', 'annual', 'annual', 12, 7990, 'EUR', 3, 'Até 3 estações, pagamento anual (-33%)', 4
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE slug = 'annual');

-- Assign legacy stations without owner to admin
UPDATE stations s SET owner_id = u.id
FROM users u
WHERE s.owner_id IS NULL AND u.role = 'admin' AND u.username = 'admin';
