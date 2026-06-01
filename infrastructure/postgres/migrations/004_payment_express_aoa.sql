-- Migration 004: AOA currency + Multicaixa Express payment proofs

-- Payment proofs (comprovativo de transferência)
CREATE TABLE IF NOT EXISTS payment_proofs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE SET NULL,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id),
    transfer_reference VARCHAR(100),
    file_path TEXT NOT NULL,
    original_filename VARCHAR(500),
    mime_type VARCHAR(100),
    file_size BIGINT,
    amount_kz INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_status ON payment_proofs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_user ON payment_proofs(user_id);

-- Planos em Kwanza (AOA) — valores inteiros em price_cents (unidade: Kz)
UPDATE subscription_plans SET
  currency = 'AOA',
  price_cents = 25000,
  description = '1 estação de rádio, renovação mensal. Pagamento por Express.'
WHERE slug = 'monthly';

UPDATE subscription_plans SET
  currency = 'AOA',
  price_cents = 65000,
  description = '1 estação, pagamento a cada 3 meses. Pagamento por Express.'
WHERE slug = 'quarterly';

UPDATE subscription_plans SET
  currency = 'AOA',
  price_cents = 120000,
  description = 'Até 2 estações, pagamento a cada 6 meses. Pagamento por Express.'
WHERE slug = 'semiannual';

UPDATE subscription_plans SET
  currency = 'AOA',
  price_cents = 220000,
  description = 'Até 3 estações, pagamento anual. Pagamento por Express.'
WHERE slug = 'annual';
