// =============================================================================
// Media Library Page
// =============================================================================

import { api, toast } from '../app.js';

export function renderMedia(container) {
  container.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">🎵 Biblioteca</span>
        <div style="display:flex;gap:10px;align-items:center;">
          <input id="media-search" placeholder="Pesquisar (título/artista/ficheiro)" style="max-width:320px;" />
          <button class="btn btn-outline btn-sm" id="btn-media-search">Pesquisar</button>
          <button class="btn btn-primary btn-sm" id="btn-media-refresh">Atualizar</button>
        </div>
      </div>
      <div class="panel-body">
        <table class="data-table">
          <thead>
            <tr>
              <th>Título</th>
              <th>Artista</th>
              <th>Tipo</th>
              <th>Duração</th>
              <th>Criado</th>
            </tr>
          </thead>
          <tbody id="media-tbody">
            <tr><td colspan="5" style="color:var(--text-muted);padding:16px;">A carregar...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  const run = () => loadMedia({ search: document.getElementById('media-search')?.value });
  document.getElementById('btn-media-refresh')?.addEventListener('click', () => loadMedia({}));
  document.getElementById('btn-media-search')?.addEventListener('click', run);
  document.getElementById('media-search')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') run();
  });

  loadMedia({});
}

async function loadMedia({ search } = {}) {
  const tbody = document.getElementById('media-tbody');
  if (!tbody) return;

  try {
    const qs = new URLSearchParams();
    qs.set('limit', '50');
    if (search && String(search).trim()) qs.set('search', String(search).trim());

    const res = await api(`/media?${qs.toString()}`);
    const files = res?.files || [];

    if (files.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="color:var(--text-muted);padding:16px;">Sem resultados.</td></tr>`;
      return;
    }

    tbody.innerHTML = files.map((f) => `
      <tr>
        <td style="font-weight:700;">${escapeHtml(f.title || f.original_name)}</td>
        <td>${escapeHtml(f.artist || '')}</td>
        <td>${escapeHtml((f.type || 'music'))}</td>
        <td>${formatDuration(f.duration)}</td>
        <td>${formatDate(f.created_at)}</td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--danger);padding:16px;">Falha: ${escapeHtml(e.message || 'erro')}</td></tr>`;
    toast(e.message || 'Falha ao carregar media', 'error');
  }
}

function formatDuration(sec) {
  const s = Number(sec);
  if (!Number.isFinite(s) || s <= 0) return '--';
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

function formatDate(v) {
  if (!v) return '--';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString('pt', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
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
