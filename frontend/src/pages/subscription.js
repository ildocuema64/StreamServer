// =============================================================================
// Subscription Plans Page
// =============================================================================

import { api, apiUpload, toast, getSubscription, setSubscription, withButtonLoading } from '../app.js';

let pendingPaymentContext = null;

export function renderSubscription(container) {
  container.innerHTML = `
    <div id="sub-status-banner"></div>
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">💳 Planos de Assinatura</span>
      </div>
      <div class="panel-body">
        <p style="color:var(--text-muted);margin-bottom:20px;">
          Escolhe um plano para criar a tua estação de rádio e transmitir ao vivo com o BUTT.
          Pagamentos em <strong>Kwanza (AOA)</strong> via <strong>Multicaixa Express</strong>.
        </p>
        <div id="plans-grid" class="plans-grid">
          <p style="color:var(--text-muted);">A carregar planos...</p>
        </div>
      </div>
    </div>

    <!-- Multicaixa Express Payment Modal -->
    <div class="modal-overlay" id="payment-modal">
      <div class="login-card payment-card">
        <div class="payment-header">
          <img src="/multicaixa-express.png" alt="Multicaixa Express" class="payment-logo">
          <button type="button" class="payment-close" id="btn-close-payment" aria-label="Fechar">&times;</button>
        </div>

        <div class="payment-plan-info" id="payment-plan-info"></div>

        <div class="payment-country">
          <span class="payment-flag">🇦🇴</span> Pagamento em Angola — Kwanza (AOA)
        </div>

        <ol class="payment-steps" id="payment-steps"></ol>

        <div class="cred-section payment-detail">
          <div class="cred-section-header">
            <span>📱 Número Multicaixa Express</span>
            <button type="button" class="btn btn-outline btn-sm" id="btn-copy-phone">Copiar</button>
          </div>
          <code class="cred-value payment-phone" id="payment-phone"></code>
        </div>

        <div class="cred-section payment-detail" id="payment-amount-section">
          <div class="cred-section-header">
            <span>💰 Valor a transferir</span>
            <button type="button" class="btn btn-outline btn-sm" id="btn-copy-amount">Copiar</button>
          </div>
          <code class="cred-value payment-amount" id="payment-amount"></code>
        </div>

        <p class="payment-note" id="payment-note"></p>

        <form id="proof-form">
          <div class="form-group">
            <label for="proof-reference">Referência da transferência (opcional)</label>
            <input type="text" id="proof-reference" placeholder="Ex: TRF-123456" maxlength="100">
          </div>
          <div class="form-group">
            <label for="proof-file">Comprovativo de pagamento *</label>
            <input type="file" id="proof-file" accept=".jpg,.jpeg,.png,.webp,.pdf" required>
            <small style="color:var(--text-muted);">JPG, PNG ou PDF — máx. 10 MB</small>
          </div>
          <p class="login-error" id="proof-form-error"></p>
          <div class="payment-actions">
            <button type="submit" class="btn btn-primary" id="btn-submit-proof">Enviar comprovativo</button>
            <button type="button" class="btn btn-outline" id="btn-payment-later">Fechar</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('btn-close-payment')?.addEventListener('click', closePaymentModal);
  document.getElementById('btn-payment-later')?.addEventListener('click', closePaymentModal);
  document.getElementById('payment-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'payment-modal') closePaymentModal();
  });
  document.getElementById('proof-form')?.addEventListener('submit', handleProofSubmit);
  document.getElementById('btn-copy-phone')?.addEventListener('click', () => {
    const phone = document.getElementById('payment-phone')?.dataset.copyValue
      || document.getElementById('payment-phone')?.textContent;
    copyText(phone, 'Número copiado!');
  });
  document.getElementById('btn-copy-amount')?.addEventListener('click', () => {
    copyText(document.getElementById('payment-amount')?.textContent, 'Valor copiado!');
  });

  loadPlans();
}

async function loadPlans() {
  const grid = document.getElementById('plans-grid');
  const banner = document.getElementById('sub-status-banner');
  if (!grid) return;

  try {
    const [plans, status] = await Promise.all([
      api('/subscriptions/plans'),
      api('/subscriptions/me').catch(() => null)
    ]);

    if (status) setSubscription(status);
    renderBanner(banner, status);

    grid.innerHTML = plans.map((p) => `
      <div class="plan-card ${status?.hasAccess && status?.subscription?.plan_id === p.id ? 'plan-active' : ''}">
        <div class="plan-name">${escapeHtml(p.name)}</div>
        <div class="plan-price">${escapeHtml(p.priceFormatted)}</div>
        <div class="plan-interval">${escapeHtml(p.intervalLabel)}</div>
        <p class="plan-desc">${escapeHtml(p.description || '')}</p>
        <ul class="plan-features">
          <li>${p.max_stations} estação(ões)</li>
          <li>Até ${p.max_listeners} ouvintes</li>
          <li>Stream URL + credenciais BUTT</li>
        </ul>
        <button class="btn btn-primary btn-full btn-subscribe" data-plan-id="${p.id}"
          ${status?.hasAccess ? 'disabled' : ''}>
          ${status?.hasAccess ? 'Plano activo' : 'Subscrever'}
        </button>
      </div>
    `).join('');

    grid.querySelectorAll('.btn-subscribe').forEach((btn) => {
      btn.addEventListener('click', () => {
        withButtonLoading(btn, () => subscribe(btn.dataset.planId), 'A processar...');
      });
    });
  } catch (e) {
    grid.innerHTML = `<p style="color:var(--danger);">Erro: ${escapeHtml(e.message)}</p>`;
  }
}

function renderBanner(banner, status) {
  if (!banner || !status) return;

  if (status.isAdmin) {
    banner.innerHTML = `<div class="sub-banner sub-banner-admin">👑 Acesso administrativo completo</div>`;
    return;
  }

  if (status.hasAccess) {
    banner.innerHTML = `<div class="sub-banner sub-banner-active">
      ✅ Plano <strong>${escapeHtml(status.planName)}</strong> activo
      ${status.expiresAt ? `— expira ${new Date(status.expiresAt).toLocaleDateString('pt-PT')}` : ''}
      (${status.stationCount}/${status.maxStations} estações)
    </div>`;
    return;
  }

  if (status.pendingProof) {
    banner.innerHTML = `<div class="sub-banner sub-banner-pending">
      ⏳ Comprovativo em análise — o administrador irá activar a tua assinatura em breve.
    </div>`;
    return;
  }

  if (status.awaitingPayment) {
    banner.innerHTML = `<div class="sub-banner sub-banner-awaiting">
      💳 Pagamento pendente via Multicaixa Express.
      <button type="button" class="btn btn-outline btn-sm" id="btn-continue-payment" style="margin-left:12px;">
        Continuar pagamento
      </button>
    </div>`;
    document.getElementById('btn-continue-payment')?.addEventListener('click', () => {
      reopenPendingPayment(status);
    });
    return;
  }

  banner.innerHTML = `<div class="sub-banner sub-banner-inactive">
    ⚠️ Sem assinatura activa. Escolhe um plano abaixo para desbloquear o sistema.
  </div>`;
}

async function subscribe(planId) {
  try {
    const result = await api('/subscriptions/subscribe', {
      method: 'POST',
      body: JSON.stringify({ plan_id: planId })
    });

    if (result.code === 'AWAITING_PAYMENT_PROOF') {
      openPaymentModal(result);
      const status = await api('/subscriptions/me');
      setSubscription(status);
      loadPlans();
      return;
    }

    toast(result.message || 'Assinatura activada!', 'success');
    const status = await api('/subscriptions/me');
    setSubscription(status);
    loadPlans();
  } catch (e) {
    if (e.status === 409 && e.response?.subscription) {
      toast('Já tens um pedido de assinatura pendente.', 'info');
      reopenPendingPayment(getSubscription());
      return;
    }
    toast(e.message || 'Erro na assinatura', 'error');
  }
}

async function reopenPendingPayment(status) {
  if (pendingPaymentContext) {
    openPaymentModal(pendingPaymentContext);
    return;
  }

  const pending = status?.pendingSubscription;
  if (!pending) {
    toast('Nenhum pagamento pendente encontrado.', 'info');
    return;
  }

  try {
    const [plans, paymentInfo] = await Promise.all([
      api('/subscriptions/plans'),
      api('/subscriptions/payment-info')
    ]);
    const plan = plans.find((p) => p.id === pending.plan_id);
    if (!plan) {
      toast('Plano pendente não encontrado.', 'error');
      return;
    }
    openPaymentModal({
      subscription: pending,
      plan,
      payment: { ...paymentInfo, amountFormatted: plan.priceFormatted }
    });
  } catch (e) {
    toast(e.message || 'Erro ao carregar dados de pagamento', 'error');
  }
}

function openPaymentModal({ subscription, plan, payment }) {
  pendingPaymentContext = { subscription, plan, payment };

  const phone = payment.expressPhone || '921923232';
  document.getElementById('payment-plan-info').innerHTML = `
    <strong>${escapeHtml(plan.name)}</strong>
    <span class="payment-plan-price">${escapeHtml(payment.amountFormatted || plan.priceFormatted)}</span>
  `;

  const stepsEl = document.getElementById('payment-steps');
  const steps = payment.steps || [
    'Abre a app Multicaixa Express no telemóvel.',
    'Selecciona "Transferir" ou "Pagamento".',
    `Destinatário: ${payment.recipientName || 'StreamServer'}`,
    `Número Express: ${phone}`,
    `Valor exacto: ${payment.amountFormatted || plan.priceFormatted}`,
    'Confirma a transferência e guarda o comprovativo.',
    'Envia o comprovativo nesta plataforma.'
  ];
  stepsEl.innerHTML = steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('');

  const phoneEl = document.getElementById('payment-phone');
  phoneEl.textContent = phone;
  phoneEl.dataset.copyValue = phone;
  document.getElementById('payment-amount').textContent = payment.amountFormatted || plan.priceFormatted;
  document.getElementById('payment-note').textContent = payment.note || '';

  const proofForm = document.getElementById('proof-form');
  const proofSection = proofForm;
  if (getSubscription()?.pendingProof) {
    proofSection.style.display = 'none';
  } else {
    proofSection.style.display = 'block';
    document.getElementById('proof-reference').value = '';
    document.getElementById('proof-file').value = '';
    document.getElementById('proof-form-error').textContent = '';
  }

  document.getElementById('payment-modal')?.classList.add('active');
}

function closePaymentModal() {
  document.getElementById('payment-modal')?.classList.remove('active');
}

async function handleProofSubmit(e) {
  e.preventDefault();
  const errEl = document.getElementById('proof-form-error');
  const submitBtn = document.getElementById('btn-submit-proof');
  errEl.textContent = '';

  const fileInput = document.getElementById('proof-file');
  const file = fileInput?.files?.[0];
  if (!file) {
    errEl.textContent = 'Selecciona o comprovativo de pagamento.';
    return;
  }

  const subscriptionId = pendingPaymentContext?.subscription?.id;
  if (!subscriptionId) {
    errEl.textContent = 'Pedido de assinatura não encontrado. Clica em Subscrever novamente.';
    return;
  }

  await withButtonLoading(submitBtn, async () => {
    try {
      const formData = new FormData();
      formData.append('proof', file);
      formData.append('subscription_id', subscriptionId);
      const ref = document.getElementById('proof-reference')?.value?.trim();
      if (ref) formData.append('transfer_reference', ref);

      const result = await apiUpload('/subscriptions/proof', formData);
      toast(result.message || 'Comprovativo enviado!', 'success');
      pendingPaymentContext = null;
      closePaymentModal();

      const status = await api('/subscriptions/me');
      setSubscription(status);
      loadPlans();
    } catch (err) {
      errEl.textContent = err.message || 'Erro ao enviar comprovativo';
    }
  }, 'A enviar...');
}

function copyText(text, msg) {
  if (!text) return;
  navigator.clipboard.writeText(text.trim())
    .then(() => toast(msg, 'success'))
    .catch(() => toast('Falha ao copiar', 'error'));
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}
