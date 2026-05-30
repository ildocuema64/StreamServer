// =============================================================================
// DJs Page
// =============================================================================

import { api, toast } from '../app.js';

export function renderDJs(container) {
  container.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">🎙️ DJs & Locutores</span>
        <button class="btn btn-primary btn-sm" id="btn-refresh-djs">Atualizar</button>
      </div>
      <div class="panel-body">
        <table class="data-table">
          <thead>
            <tr>
              <th>DJ</th>
              <th>Utilizador</th>
              <th>Estação</th>
              <th>Mounts</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody id="djs-tbody">
            <tr><td colspan="5" style="color:var(--text-muted);padding:16px;">A carregar...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('btn-refresh-djs')?.addEventListener('click', loadDjs);
  loadDjs();
}

async function loadDjs() {
  const tbody = document.getElementById('djs-tbody');
  if (!tbody) return;

  try {
    const rows = await api('/djs');
    if (!rows || rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="color:var(--text-muted);padding:16px;">Sem DJs.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map((r) => {
      const badge = r.is_active ? 'badge-success' : 'badge-warning';
      const label = r.is_active ? 'ativo' : 'inativo';
      const mounts = Array.isArray(r.allowed_mountpoints) ? r.allowed_mountpoints.join(', ') : '';
      return `
        <tr>
          <td style="font-weight:700;">${escapeHtml(r.dj_name)}</td>
          <td>${escapeHtml(r.username || '')}</td>
          <td>${escapeHtml(r.station_name || '')}</td>
          <td>${escapeHtml(mounts)}</td>
          <td><span class="badge ${badge}">${label}</span></td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--danger);padding:16px;">Falha: ${escapeHtml(e.message || 'erro')}</td></tr>`;
    toast(e.message || 'Falha ao carregar DJs', 'error');
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[m]));
}

