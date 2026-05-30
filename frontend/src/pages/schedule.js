// =============================================================================
// Schedule Page
// =============================================================================

import { api, toast } from '../app.js';

export function renderSchedule(container) {
  container.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">🗓️ Agenda</span>
        <button class="btn btn-primary btn-sm" id="btn-refresh-schedule">Atualizar</button>
      </div>
      <div class="panel-body">
        <p style="color:var(--text-muted);margin-bottom:12px;">
          Dica: este ecrã mostra os slots atuais (por agora sem editor).
        </p>
        <table class="data-table">
          <thead>
            <tr>
              <th>Dia</th>
              <th>Início</th>
              <th>Fim</th>
              <th>Título</th>
              <th>DJ</th>
              <th>Playlist</th>
              <th>Estação</th>
            </tr>
          </thead>
          <tbody id="schedule-tbody">
            <tr><td colspan="7" style="color:var(--text-muted);padding:16px;">A carregar...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('btn-refresh-schedule')?.addEventListener('click', loadSchedule);
  loadSchedule();
}

async function loadSchedule() {
  const tbody = document.getElementById('schedule-tbody');
  if (!tbody) return;

  try {
    const slots = await api('/schedule');
    if (!slots || slots.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="color:var(--text-muted);padding:16px;">Sem slots.</td></tr>`;
      return;
    }

    tbody.innerHTML = slots.map((s) => `
      <tr>
        <td>${dayName(s.day_of_week)}</td>
        <td>${escapeHtml((s.start_time || '').slice(0, 5))}</td>
        <td>${escapeHtml((s.end_time || '').slice(0, 5))}</td>
        <td style="font-weight:700;">${escapeHtml(s.title || '')}</td>
        <td>${escapeHtml(s.dj_name || '')}</td>
        <td>${escapeHtml(s.playlist_name || '')}</td>
        <td>${escapeHtml(s.station_name || '')}</td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:var(--danger);padding:16px;">Falha: ${escapeHtml(e.message || 'erro')}</td></tr>`;
    toast(e.message || 'Falha ao carregar agenda', 'error');
  }
}

function dayName(d) {
  const n = Number(d);
  const map = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return map[n] ?? '--';
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

