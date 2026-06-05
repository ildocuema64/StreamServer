// =============================================================================
// Admin Panel — user & subscription management
// =============================================================================

import { api, toast, confirmDeleteStation, withButtonLoading } from '../app.js';

let plans = [];

export function renderAdmin(container) {
  container.innerHTML = `
    <div class="stats-grid" id="admin-stats">
      <div class="stat-card"><div class="stat-card-label">Utilizadores</div><div class="stat-card-value" id="adm-users">—</div></div>
      <div class="stat-card"><div class="stat-card-label">Assinaturas activas</div><div class="stat-card-value" id="adm-subs">—</div></div>
      <div class="stat-card"><div class="stat-card-label">Estações</div><div class="stat-card-value" id="adm-stations">—</div></div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">👑 Gestão de Utilizadores</span>
        <button class="btn btn-outline btn-sm" id="btn-refresh-admin">Atualizar</button>
      </div>
      <div class="panel-body" style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Utilizador</th>
              <th>Email</th>
              <th>Plano</th>
              <th>Expira</th>
              <th>Estações</th>
              <th>Estado</th>
              <th>Acções</th>
            </tr>
          </thead>
          <tbody id="admin-users-tbody">
            <tr><td colspan="7" style="padding:16px;color:var(--text-muted);">A carregar...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="panel" style="margin-top:16px;">
      <div class="panel-header">
        <span class="panel-title">📻 Gestão de Estações</span>
        <button class="btn btn-outline btn-sm" id="btn-refresh-stations-admin">Atualizar</button>
      </div>
      <div class="panel-body" style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Mount</th>
              <th>Proprietário</th>
              <th>Formato</th>
              <th>DJs</th>
              <th>Estado</th>
              <th>Acções</th>
            </tr>
          </thead>
          <tbody id="admin-stations-tbody">
            <tr><td colspan="7" style="padding:16px;color:var(--text-muted);">A carregar...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('btn-refresh-admin')?.addEventListener('click', (e) => {
    withButtonLoading(e.currentTarget, loadAdmin, 'A atualizar...');
  });
  document.getElementById('btn-refresh-stations-admin')?.addEventListener('click', (e) => {
    withButtonLoading(e.currentTarget, loadAdminStations, 'A atualizar...');
  });
  loadAdmin();
}

async function loadAdmin() {
  try {
    const [overview, users, plansData] = await Promise.all([
      api('/admin/overview'),
      api('/admin/users'),
      api('/subscriptions/plans')
    ]);
    plans = plansData;

    document.getElementById('adm-users').textContent = overview.users?.total ?? 0;
    document.getElementById('adm-subs').textContent = overview.activeSubscriptions ?? 0;
    document.getElementById('adm-stations').textContent = overview.stations ?? 0;

    const tbody = document.getElementById('admin-users-tbody');
    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="padding:16px;color:var(--text-muted);">Sem utilizadores.</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map((u) => {
      const blocked = u.account_status === 'blocked' || !u.is_active;
      const badge = blocked ? 'badge-warning' : (u.sub_status === 'active' ? 'badge-success' : 'badge-warning');
      const label = blocked ? 'bloqueado' : (u.sub_status === 'active' ? 'activo' : 'sem plano');
      const expires = u.sub_expires ? new Date(u.sub_expires).toLocaleDateString('pt-PT') : '—';
      return `
        <tr>
          <td style="font-weight:700;">${escapeHtml(u.username)}</td>
          <td>${escapeHtml(u.email)}</td>
          <td>${escapeHtml(u.plan_name || '—')}</td>
          <td>${expires}</td>
          <td>${u.station_count || 0}</td>
          <td><span class="badge ${badge}">${label}</span></td>
          <td>
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
              ${!blocked ? `<button class="btn btn-outline btn-sm btn-grant" data-id="${u.id}">+ Plano</button>` : ''}
              ${blocked
                ? `<button class="btn btn-outline btn-sm btn-unblock" data-id="${u.id}">Desbloquear</button>`
                : `<button class="btn btn-outline btn-sm btn-block" data-id="${u.id}">Bloquear</button>`}
              <button class="btn btn-outline btn-sm btn-revoke" data-id="${u.id}">Revogar</button>
              <button class="btn btn-outline btn-sm btn-delete" data-id="${u.id}" style="color:var(--danger);">Remover</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-block').forEach((b) => {
      b.addEventListener('click', () => withButtonLoading(b, () => blockUser(b.dataset.id), 'A bloquear...'));
    });
    tbody.querySelectorAll('.btn-unblock').forEach((b) => {
      b.addEventListener('click', () => withButtonLoading(b, () => unblockUser(b.dataset.id), 'A desbloquear...'));
    });
    tbody.querySelectorAll('.btn-grant').forEach((b) => {
      b.addEventListener('click', () => withButtonLoading(b, () => grantPlan(b.dataset.id), 'A conceder...'));
    });
    tbody.querySelectorAll('.btn-revoke').forEach((b) => {
      b.addEventListener('click', () => withButtonLoading(b, () => revokeSub(b.dataset.id), 'A revogar...'));
    });
    tbody.querySelectorAll('.btn-delete').forEach((b) => {
      b.addEventListener('click', () => withButtonLoading(b, () => deleteUser(b.dataset.id), 'A remover...'));
    });

    await loadAdminStations();
  } catch (e) {
    toast(e.message || 'Erro admin', 'error');
  }
}

async function loadAdminStations() {
  const tbody = document.getElementById('admin-stations-tbody');
  if (!tbody) return;

  try {
    let stations;
    try {
      stations = await api('/admin/stations');
    } catch (e) {
      if (e.status !== 404) throw e;
      stations = await api('/stations');
    }
    if (!stations.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="padding:16px;color:var(--text-muted);">Sem estações.</td></tr>`;
      return;
    }

    tbody.innerHTML = stations.map((s) => {
      const badge = s.is_active ? 'badge-success' : 'badge-warning';
      const label = s.is_active ? 'activa' : 'inactiva';
      return `
        <tr>
          <td style="font-weight:700;">${escapeHtml(s.name)}</td>
          <td><code>${escapeHtml(s.mountpoint || '/live')}</code></td>
          <td>${escapeHtml(s.owner_username || '—')}</td>
          <td>${escapeHtml((s.format || 'mp3').toUpperCase())} ${escapeHtml(String(s.bitrate || 128))}k</td>
          <td>${s.dj_count || 0}</td>
          <td><span class="badge ${badge}">${label}</span></td>
          <td>
            <button class="btn btn-outline btn-sm btn-delete-station" data-id="${s.id}" style="color:var(--danger);">Remover</button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-delete-station').forEach((b) => {
      b.addEventListener('click', () => {
        const name = b.closest('tr')?.querySelector('td')?.textContent?.trim() || 'esta estação';
        withButtonLoading(b, () => deleteStation(b.dataset.id, name), 'A remover...');
      });
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" style="padding:16px;color:var(--danger);">${escapeHtml(e.message || 'Erro')}</td></tr>`;
  }
}

async function blockUser(id) {
  const reason = prompt('Motivo do bloqueio (opcional):') || 'Sem assinatura activa';
  if (reason === null) return;
  try {
    await api(`/admin/users/${id}/block`, { method: 'POST', body: JSON.stringify({ reason }) });
    toast('Utilizador bloqueado', 'warning');
    loadAdmin();
  } catch (e) { toast(e.message, 'error'); }
}

async function unblockUser(id) {
  try {
    await api(`/admin/users/${id}/unblock`, { method: 'POST' });
    toast('Utilizador desbloqueado', 'success');
    loadAdmin();
  } catch (e) { toast(e.message, 'error'); }
}

async function grantPlan(userId) {
  if (!plans.length) return;
  const options = plans.map((p, i) => `${i + 1}. ${p.name} (${p.priceFormatted})`).join('\n');
  const choice = prompt(`Escolhe o plano (número):\n${options}`);
  if (!choice) return;
  const idx = parseInt(choice, 10) - 1;
  if (idx < 0 || idx >= plans.length) return toast('Plano inválido', 'error');
  try {
    await api(`/admin/users/${userId}/subscription`, {
      method: 'POST',
      body: JSON.stringify({ plan_id: plans[idx].id })
    });
    toast('Assinatura concedida!', 'success');
    loadAdmin();
  } catch (e) { toast(e.message, 'error'); }
}

async function revokeSub(id) {
  if (!confirm('Revogar assinatura deste utilizador?')) return;
  try {
    await api(`/admin/users/${id}/subscription`, { method: 'DELETE' });
    toast('Assinatura revogada', 'warning');
    loadAdmin();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteUser(id) {
  if (!confirm('Remover utilizador permanentemente? Esta acção não pode ser desfeita.')) return;
  try {
    await api(`/admin/users/${id}`, { method: 'DELETE' });
    toast('Utilizador removido', 'warning');
    loadAdmin();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteStation(id, name) {
  const ok = await confirmDeleteStation(
    name,
    'Playlists e DJs associados serão apagados.'
  );
  if (!ok) return;
  try {
    await api(`/stations/${id}`, { method: 'DELETE' });
    toast('Estação removida', 'warning');
    loadAdminStations();
    const overview = await api('/admin/overview');
    document.getElementById('adm-stations').textContent = overview.stations ?? 0;
  } catch (e) { toast(e.message, 'error'); }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}
