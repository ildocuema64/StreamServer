// =============================================================================
// Payment instructions — Multicaixa Express (Angola)
// =============================================================================

function getPaymentInstructions(plan = null) {
  const phone = process.env.PAYMENT_EXPRESS_PHONE || '923000000';
  const name = process.env.PAYMENT_EXPRESS_NAME || 'StreamServer';
  const iban = process.env.PAYMENT_IBAN || '';
  const bank = process.env.PAYMENT_BANK_NAME || '';
  const amountKz = plan?.price_cents ?? null;

  const steps = [
    'Abre a app Multicaixa Express no telemóvel.',
    `Selecciona "Transferir" ou "Pagamento".`,
    `Destinatário: ${name}`,
    `Número Express: ${phone}`,
    amountKz != null ? `Valor exacto: ${formatKwanza(amountKz)}` : 'Valor: conforme o plano escolhido.',
    'Confirma a transferência e guarda o comprovativo.',
    'Envia o comprovativo nesta plataforma (imagem ou PDF).',
    'A activação é feita após verificação pelo administrador (até 24h úteis).'
  ];

  return {
    method: 'express',
    methodLabel: 'Multicaixa Express',
    currency: 'AOA',
    recipientName: name,
    expressPhone: phone,
    bankName: bank || null,
    iban: iban || null,
    amountKz,
    amountFormatted: amountKz != null ? formatKwanza(amountKz) : null,
    steps,
    note: process.env.PAYMENT_NOTE || 'Indica o teu utilizador no assunto da transferência, se possível.'
  };
}

function formatKwanza(amount) {
  const n = Number(amount) || 0;
  return new Intl.NumberFormat('pt-AO', {
    style: 'currency',
    currency: 'AOA',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(n);
}

function formatPlanPrice(plan) {
  if (!plan) return '';
  if (plan.currency === 'AOA') {
    return formatKwanza(plan.price_cents);
  }
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: plan.currency || 'EUR'
  }).format(plan.price_cents / 100);
}

module.exports = { getPaymentInstructions, formatKwanza, formatPlanPrice };
