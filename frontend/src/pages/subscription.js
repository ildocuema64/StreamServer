// =============================================================================
// Subscription Plans Page
// =============================================================================

import { api, toast, getSubscription, setSubscription } from '../app.js';

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
        </p>
        <div id="plans-grid" class="plans-grid">
          <p style="color:var(--text-muted);">A carregar planos...</p>
        </div>
      </div>
    </div>
  `;
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

    if (banner && status) {
      if (status.isAdmin) {
        banner.innerHTML = `<div class="sub-banner sub-banner-admin">👑 Acesso administrativo completo</div>`;
      } else if (status.hasAccess) {
        banner.innerHTML = `<div class="sub-banner sub-banner-active">
          ✅ Plano <strong>${escapeHtml(status.planName)}</strong> activo
          ${status.expiresAt ? `— expira ${new Date(status.expiresAt).toLocaleDateString('pt-PT')}` : ''}
          (${status.stationCount}/${status.maxStations} estações)
        </div>`;
      } else {
        banner.innerHTML = `<div class="sub-banner sub-banner-inactive">
          ⚠️ Sem assinatura activa. Escolhe um plano abaixo para desbloquear o sistema.
        </div>`;
      }
    }

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
      btn.addEventListener('click', () => subscribe(btn.dataset.planId));
    });
  } catch (e) {
    grid.innerHTML = `<p style="color:var(--danger);">Erro: ${escapeHtml(e.message)}</p>`;
  }
}

async function subscribe(planId) {
  try {
    const result = await api('/subscriptions/subscribe', {
      method: 'POST',
      body: JSON.stringify({ plan_id: planId })
    });
    toast(result.message || 'Assinatura activada!', 'success');
    const status = await api('/subscriptions/me');
    setSubscription(status);
    loadPlans();
  } catch (e) {
    toast(e.message || 'Erro na assinatura', 'error');
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}
