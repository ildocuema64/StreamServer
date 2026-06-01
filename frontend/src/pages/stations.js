// =============================================================================
// Stations Page - Create stations, stream URLs & BUTT credentials
// =============================================================================

import { api, toast, getSubscription } from '../app.js';

export function renderStations(container) {
  container.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">📻 Estações de Rádio</span>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-outline btn-sm" id="btn-refresh-stations">Atualizar</button>
          <button class="btn btn-primary btn-sm" id="btn-new-station" style="display:none;">+ Nova Estação</button>
        </div>
      </div>
      <div class="panel-body">
        <p style="color:var(--text-muted);margin-bottom:16px;font-size:0.9rem;">
          Cada estação gera automaticamente uma <strong>Stream URL</strong> pública para ouvir online
          e credenciais Icecast para transmitir com o <strong>BUTT</strong>.
        </p>
        <table class="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Mount</th>
              <th>Stream URL</th>
              <th>Formato</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="stations-tbody">
            <tr><td colspan="6" style="color:var(--text-muted);padding:16px;">A carregar...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create Station Modal -->
    <div class="modal-overlay" id="station-modal">
      <div class="login-card" style="max-width:480px;">
        <h2 style="margin-bottom:4px;">Nova Estação</h2>
        <p style="color:var(--text-muted);margin-bottom:20px;font-size:0.9rem;">
          Serão geradas credenciais Icecast e URL pública automaticamente.
        </p>
        <form id="station-form">
          <div class="form-group">
            <label for="st-name">Nome da estação *</label>
            <input type="text" id="st-name" placeholder="Rádio Lisboa" required maxlength="100">
          </div>
          <div class="form-group">
            <label for="st-slug">Slug (URL)</label>
            <input type="text" id="st-slug" placeholder="radio-lisboa" pattern="[a-z0-9-]+">
            <small style="color:var(--text-muted);">Opcional — gera mount /slug/live</small>
          </div>
          <div class="form-group">
            <label for="st-genre">Género</label>
            <input type="text" id="st-genre" placeholder="Pop, Rock, Notícias...">
          </div>
          <div class="form-group">
            <label for="st-description">Descrição</label>
            <textarea id="st-description" rows="2" placeholder="Descrição da estação"></textarea>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group">
              <label for="st-format">Formato</label>
              <select id="st-format">
                <option value="mp3">MP3</option>
                <option value="aac">AAC</option>
                <option value="ogg">OGG</option>
              </select>
            </div>
            <div class="form-group">
              <label for="st-bitrate">Bitrate</label>
              <select id="st-bitrate">
                <option value="64">64 kbps</option>
                <option value="128" selected>128 kbps</option>
                <option value="192">192 kbps</option>
                <option value="256">256 kbps</option>
                <option value="320">320 kbps</option>
              </select>
            </div>
          </div>
          <p class="login-error" id="station-form-error"></p>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <button type="submit" class="btn btn-primary" style="flex:1;">Criar Estação</button>
            <button type="button" class="btn btn-outline" id="btn-cancel-station">Cancelar</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Credentials Modal -->
    <div class="modal-overlay" id="creds-modal">
      <div class="login-card" style="max-width:560px;max-height:90vh;overflow-y:auto;">
        <h2 style="margin-bottom:4px;" id="creds-title">Credenciais de Stream</h2>
        <p style="color:var(--text-muted);margin-bottom:16px;font-size:0.9rem;" id="creds-subtitle"></p>

        <div class="cred-section">
          <div class="cred-section-header">
            <span>🎧 URL para Ouvir Online</span>
            <button class="btn btn-outline btn-sm btn-copy" data-copy-target="creds-listen-url">Copiar</button>
          </div>
          <code class="cred-value" id="creds-listen-url"></code>
          <p style="color:var(--text-muted);font-size:0.8rem;margin-top:6px;">
            Partilha esta URL em websites, redes sociais ou apps de rádio.
          </p>
        </div>

        <div class="cred-section">
          <div class="cred-section-header">
            <span>📡 Configuração BUTT (Transmitir)</span>
            <button class="btn btn-outline btn-sm btn-copy" data-copy-target="creds-butt-text">Copiar</button>
          </div>
          <pre class="cred-pre" id="creds-butt-text"></pre>
        </div>

        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" id="btn-download-butt">⬇ Descarregar .butt</button>
          <button class="btn btn-outline btn-sm" id="btn-copy-all-creds">Copiar tudo</button>
          <button class="btn btn-outline btn-sm" id="btn-close-creds" style="margin-left:auto;">Fechar</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-refresh-stations')?.addEventListener('click', loadStations);
  document.getElementById('btn-new-station')?.addEventListener('click', openCreateModal);
  document.getElementById('btn-cancel-station')?.addEventListener('click', closeCreateModal);
  document.getElementById('station-form')?.addEventListener('submit', handleCreateStation);
  document.getElementById('btn-close-creds')?.addEventListener('click', closeCredsModal);

  document.getElementById('creds-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'creds-modal') closeCredsModal();
  });
  document.getElementById('station-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'station-modal') closeCreateModal();
  });

  initPage();
}

async function initPage() {
  try {
    const sub = getSubscription();
    const canCreate = sub?.isAdmin || sub?.hasAccess;
    const btn = document.getElementById('btn-new-station');
    if (btn) btn.style.display = canCreate ? 'inline-flex' : 'none';
  } catch { /* ignore */ }
  loadStations();
}

async function loadStations() {
  const tbody = document.getElementById('stations-tbody');
  if (!tbody) return;

  try {
    const stations = await api('/stations');
    if (!stations || stations.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="color:var(--text-muted);padding:16px;">
        Sem estações. ${getSubscription()?.hasAccess ? 'Clica em "+ Nova Estação" para criar.' : 'Subscreve um plano em Assinatura.'}
      </td></tr>`;
      return;
    }

    tbody.innerHTML = stations.map((s) => {
      const badge = s.is_active ? 'badge-success' : 'badge-warning';
      const label = s.is_active ? 'ativa' : 'inativa';
      const listenUrl = s.listen_url || '';
      const shortUrl = listenUrl.length > 40 ? listenUrl.slice(0, 40) + '…' : listenUrl;
      return `
        <tr>
          <td style="font-weight:700;">${escapeHtml(s.name)}</td>
          <td><code>${escapeHtml(s.mountpoint || '/live')}</code></td>
          <td>
            <span title="${escapeHtml(listenUrl)}" style="font-size:0.82rem;color:var(--accent);">${escapeHtml(shortUrl)}</span>
          </td>
          <td>${escapeHtml((s.format || 'mp3').toUpperCase())} ${escapeHtml(String(s.bitrate || 128))}k</td>
          <td><span class="badge ${badge}">${label}</span></td>
          <td>
            <button class="btn btn-outline btn-sm btn-show-creds" data-id="${s.id}">Credenciais</button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-show-creds').forEach((btn) => {
      btn.addEventListener('click', () => showCredentials(btn.dataset.id));
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--danger);padding:16px;">Falha: ${escapeHtml(e.message || 'erro')}</td></tr>`;
    toast(e.message || 'Falha ao carregar estações', 'error');
  }
}

function openCreateModal() {
  document.getElementById('station-form')?.reset();
  document.getElementById('station-form-error').textContent = '';
  document.getElementById('station-modal')?.classList.add('active');
}

function closeCreateModal() {
  document.getElementById('station-modal')?.classList.remove('active');
}

function closeCredsModal() {
  document.getElementById('creds-modal')?.classList.remove('active');
}

async function handleCreateStation(e) {
  e.preventDefault();
  const errEl = document.getElementById('station-form-error');
  errEl.textContent = '';

  const name = document.getElementById('st-name').value.trim();
  const slug = document.getElementById('st-slug').value.trim();
  const genre = document.getElementById('st-genre').value.trim();
  const description = document.getElementById('st-description').value.trim();
  const format = document.getElementById('st-format').value;
  const bitrate = parseInt(document.getElementById('st-bitrate').value, 10);

  try {
    const body = { name, genre, description, format, bitrate };
    if (slug) body.slug = slug;

    const station = await api('/stations', { method: 'POST', body: JSON.stringify(body) });
    closeCreateModal();
    toast(`Estação "${station.name}" criada!`, 'success');
    await loadStations();
    showCredentialsFromData(station);
  } catch (err) {
    errEl.textContent = err.message || 'Erro ao criar estação';
  }
}

async function showCredentials(stationId) {
  try {
    const config = await api(`/stations/${stationId}/stream-config`);
    showCredentialsFromData({ ...config.station, ...config, icecast: config.icecast, butt: config.butt, listen_url: config.listen_url });
  } catch (e) {
    toast(e.message || 'Falha ao carregar credenciais', 'error');
  }
}

let currentButtFile = '';

function showCredentialsFromData(data) {
  const ice = data.icecast || data.butt?.server || {};
  const listenUrl = data.listen_url || data.butt?.listen_url || '';
  const mount = ice.mountpoint || data.mountpoint || '/live';
  const host = ice.host || ice.hostname || 'localhost';
  const port = ice.port || 8000;
  const password = ice.password || data.source_password || '';
  const format = (ice.format || data.format || 'mp3').toUpperCase();
  const bitrate = ice.bitrate || data.bitrate || 128;

  const buttText = [
    '=== BUTT — Broadcast Using This Tool ===',
    `Tipo: Icecast`,
    `Servidor: ${host}`,
    `Porta: ${port}`,
    `Mount: ${mount}`,
    `Utilizador: source`,
    `Password: ${password}`,
    `Codec: ${format}`,
    `Bitrate: ${bitrate} kbps`,
    '',
    '=== URL para ouvir online ===',
    listenUrl
  ].join('\n');

  currentButtFile = data.butt?.buttFile || '';

  document.getElementById('creds-title').textContent = data.name || 'Credenciais de Stream';
  document.getElementById('creds-subtitle').textContent =
    `Mount ${mount} — cola estes dados no BUTT para transmitir ao vivo.`;
  document.getElementById('creds-listen-url').textContent = listenUrl;
  document.getElementById('creds-butt-text').textContent = buttText;

  document.getElementById('creds-modal')?.classList.add('active');

  document.querySelectorAll('.btn-copy').forEach((btn) => {
    btn.onclick = () => {
      const target = document.getElementById(btn.dataset.copyTarget);
      copyText(target?.textContent || '', 'Copiado!');
    };
  });

  document.getElementById('btn-copy-all-creds').onclick = () => copyText(buttText, 'Credenciais copiadas!');
  document.getElementById('btn-download-butt').onclick = () => downloadButtFile(data.name || 'station', currentButtFile);
}

function copyText(text, msg = 'Copiado!') {
  navigator.clipboard.writeText(text).then(() => toast(msg, 'success')).catch(() => toast('Falha ao copiar', 'error'));
}

function downloadButtFile(name, content) {
  if (!content) {
    toast('Ficheiro .butt não disponível', 'error');
    return;
  }
  const blob = new Blob([content], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.butt`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Ficheiro .butt descarregado', 'success');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}
