// =============================================================================
// Stream Control Page
// =============================================================================

import { api, toast } from '../app.js';

export function renderStreamControl(container) {
  container.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">⚡ Stream Control</span>
        <button class="btn btn-primary btn-sm" id="btn-stream-refresh">Atualizar</button>
      </div>
      <div class="panel-body">
        <div class="control-grid" style="margin-bottom:16px;">
          <button class="control-btn" id="btn-autodj-start">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="6 3 20 12 6 21 6 3"/></svg>
            <span>AutoDJ Start</span>
          </button>
          <button class="control-btn" id="btn-autodj-stop">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12"/></svg>
            <span>AutoDJ Stop</span>
          </button>
          <button class="control-btn" id="btn-autodj-skip">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
            <span>Skip</span>
          </button>
          <button class="control-btn" id="btn-rec-start">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            <span>Rec Start</span>
          </button>
          <button class="control-btn" id="btn-rec-stop">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="7" width="10" height="10"/></svg>
            <span>Rec Stop</span>
          </button>
        </div>

        <div class="grid-2">
          <div class="panel" style="margin-bottom:0;">
            <div class="panel-header"><span class="panel-title">📡 Mounts</span></div>
            <div class="panel-body" id="stream-mounts">
              <div class="empty-state"><p>—</p></div>
            </div>
          </div>

          <div class="panel" style="margin-bottom:0;">
            <div class="panel-header"><span class="panel-title">🤖 Liquidsoap</span></div>
            <div class="panel-body">
              <pre id="stream-liquidsoap" style="white-space:pre-wrap;color:var(--text-secondary);font-size:12px;margin:0;">—</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  wireButtons();
  loadStatus();
}

function wireButtons() {
  document.getElementById('btn-stream-refresh')?.addEventListener('click', loadStatus);

  document.getElementById('btn-autodj-start')?.addEventListener('click', async () => {
    await action('/stream/autodj/start', 'AutoDJ iniciado');
  });
  document.getElementById('btn-autodj-stop')?.addEventListener('click', async () => {
    await action('/stream/autodj/stop', 'AutoDJ parado');
  });
  document.getElementById('btn-autodj-skip')?.addEventListener('click', async () => {
    await action('/stream/autodj/skip', 'Track skipped');
  });
  document.getElementById('btn-rec-start')?.addEventListener('click', async () => {
    await action('/stream/recording/start', 'Gravação iniciada');
  });
  document.getElementById('btn-rec-stop')?.addEventListener('click', async () => {
    await action('/stream/recording/stop', 'Gravação parada');
  });
}

async function action(path, okMsg) {
  try {
    await api(path, { method: 'POST', body: JSON.stringify({}) });
    toast(okMsg, 'success');
    loadStatus();
  } catch (e) {
    toast(e.message || 'Falha', 'error');
  }
}

async function loadStatus() {
  const mountsEl = document.getElementById('stream-mounts');
  const lsEl = document.getElementById('stream-liquidsoap');
  if (!mountsEl || !lsEl) return;

  try {
    const status = await api('/stream/status');
    const mounts = status?.mounts || [];
    const liquidsoap = status?.liquidsoap ?? {};

    if (!mounts.length) {
      mountsEl.innerHTML = `<div class="empty-state"><p>Nenhum mount ativo.</p></div>`;
    } else {
      mountsEl.innerHTML = mounts.map((m) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
          <div>
            <div style="font-weight:700;">/${escapeHtml(m.mount || m.name || '')}</div>
            <div style="font-size:0.78rem;color:var(--text-muted);">${escapeHtml(m.title || '')}</div>
          </div>
          <div style="text-align:right;">
            <span class="badge badge-success">${escapeHtml(String(m.listeners ?? 0))} ouvintes</span>
            <div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">${escapeHtml(String(m.bitrate || '?'))}kbps</div>
          </div>
        </div>
      `).join('');
    }

    lsEl.textContent = JSON.stringify(liquidsoap, null, 2);
  } catch (e) {
    mountsEl.innerHTML = `<div class="empty-state"><p style="color:var(--danger);">Falha: ${escapeHtml(e.message || 'erro')}</p></div>`;
    lsEl.textContent = '—';
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

