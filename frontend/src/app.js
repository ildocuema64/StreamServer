// =============================================================================
// StreamServer Dashboard - Main Application
// =============================================================================

import { renderDashboard, updateDashboardStats } from './pages/dashboard.js';
import { renderStations } from './pages/stations.js';
import { renderStreamControl } from './pages/stream.js';
import { renderMedia } from './pages/media.js';
import { renderSchedule } from './pages/schedule.js';
import { renderDJs } from './pages/djs.js';
import { renderSubscription } from './pages/subscription.js';
import { renderAdmin } from './pages/admin.js';
import {
  showAppLoader,
  hideAppLoader,
  pageLoaderHTML,
  setButtonLoading,
  setFormLoading
} from './loading.js';

export { setButtonLoading, withButtonLoading } from './loading.js';

let currentUser = null;
let subscriptionState = null;

export function getSubscription() { return subscriptionState; }
export function setSubscription(s) {
  subscriptionState = s;
  updateNavVisibility();
}

async function loadSession() {
  try {
    const [user, sub] = await Promise.all([
      api('/auth/me'),
      api('/subscriptions/me')
    ]);
    currentUser = user;
    subscriptionState = sub;
    updateUserUI(user);
    updateNavVisibility();
    return { user, sub };
  } catch { return null; }
}

function updateUserUI(user) {
  if (!user) return;
  const avatar = document.querySelector('.user-avatar');
  const name = document.querySelector('.user-name');
  const role = document.querySelector('.user-role');
  if (avatar) avatar.textContent = (user.username || 'A')[0].toUpperCase();
  if (name) name.textContent = user.username || 'User';
  if (role) role.textContent = user.role === 'admin' ? 'Administrador' : 'Utilizador';
}

function updateNavVisibility() {
  const isAdmin = currentUser?.role === 'admin';
  document.getElementById('nav-admin')?.style.setProperty('display', isAdmin ? 'flex' : 'none');
  const subBadge = document.getElementById('sub-badge');
  if (subBadge && subscriptionState && !subscriptionState.isAdmin) {
    subBadge.textContent = subscriptionState.hasAccess ? '✓' : '!';
    subBadge.className = subscriptionState.hasAccess ? 'sub-badge active' : 'sub-badge inactive';
    subBadge.style.display = 'inline';
  }
}

// =============================================================================
// API Helper
// =============================================================================
/** Produção: VITE_BACKEND_URL (Render). Dev: proxy Vite em /api */
function resolveBackendOrigin() {
  const raw = import.meta.env.VITE_BACKEND_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const h = u.hostname;
    if (h === 'YOUR_API_DOMAIN' || h === 'localhost' || h === '127.0.0.1') return null;
    return u.origin;
  } catch {
    return null;
  }
}

const BACKEND_ORIGIN = resolveBackendOrigin();
const API_BASE = BACKEND_ORIGIN ? `${BACKEND_ORIGIN}/api` : '/api';

const PUBLIC_AUTH_PATHS = new Set(['/auth/login', '/auth/signup', '/auth/refresh']);

function parseResponseBody(raw) {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  currentUser = null;
  subscriptionState = null;
}

let refreshInFlight = null;

async function refreshSession() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) throw new Error('No refresh token');

  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    })
      .then(async (res) => {
        const raw = await res.text();
        const data = parseResponseBody(raw);
        if (!res.ok) {
          throw new Error(data?.error || 'Refresh token inválido');
        }
        localStorage.setItem('token', data.token);
        if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
        return data;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

export async function api(path, options = {}) {
  const isPublicAuth = PUBLIC_AUTH_PATHS.has(path);
  const token = isPublicAuth ? null : localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // Some proxies / middlewares can return empty bodies (or non-JSON) on errors.
  const raw = await res.text();
  const data = parseResponseBody(raw);

  if (res.status === 401) {
    if (isPublicAuth) {
      const msg =
        data?.error ||
        (path === '/auth/login' ? 'Credenciais inválidas' : 'Pedido não autorizado');
      const err = new Error(msg);
      err.status = 401;
      throw err;
    }

    if (!options._retried && localStorage.getItem('refreshToken')) {
      try {
        await refreshSession();
        return api(path, { ...options, _retried: true });
      } catch {
        /* refresh failed — fall through to logout */
      }
    }

    clearAuth();
    showLogin();
    setAuthMode('login');
    const err = new Error('Sessão expirada. Inicia sessão novamente.');
    err.status = 401;
    err.code = 'SESSION_EXPIRED';
    throw err;
  }

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message || data.details)) ||
      (raw && raw.trim()) ||
      (res.status === 500 && !raw.trim()
        ? 'Servidor indisponível. Confirma que o backend está a correr (npm run dev:backend).'
        : `Request failed (${res.status})`);
    const err = new Error(msg);
    err.status = res.status;
    err.response = data;
    console.error('[API]', path, res.status, data || raw || '(empty body)');
    throw err;
  }

  return data ?? {};
}

// =============================================================================
// Toast Notifications
// =============================================================================
export function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 4000);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}

let confirmResolve = null;

function closeConfirmModal(result) {
  const modal = document.getElementById('confirm-modal');
  modal?.classList.remove('active');
  if (confirmResolve) {
    const resolve = confirmResolve;
    confirmResolve = null;
    resolve(result);
  }
}

export function confirmDialog({
  title = 'Confirmar',
  message = '',
  detail = '',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  danger = false
} = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-modal-title');
    const messageEl = document.getElementById('confirm-modal-message');
    const detailEl = document.getElementById('confirm-modal-detail');
    const okBtn = document.getElementById('confirm-modal-ok');
    const cancelBtn = document.getElementById('confirm-modal-cancel');

    if (!modal || !titleEl || !messageEl || !detailEl || !okBtn || !cancelBtn) {
      resolve(false);
      return;
    }

    confirmResolve = resolve;
    titleEl.textContent = title;
    messageEl.innerHTML = message;
    detailEl.textContent = detail;
    detailEl.style.display = detail ? 'block' : 'none';
    okBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;
    okBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';

    modal.classList.add('active');
    okBtn.focus();
  });
}

export function confirmDeleteStation(name, detail = '') {
  const safeName = escapeHtml(name || 'esta estação');
  return confirmDialog({
    title: 'Remover estação',
    message: `Remover a estação <span class="confirm-highlight">"${safeName}"</span> permanentemente?`,
    detail,
    confirmText: 'Remover',
    cancelText: 'Cancelar',
    danger: true
  });
}

function initConfirmModal() {
  const modal = document.getElementById('confirm-modal');
  const okBtn = document.getElementById('confirm-modal-ok');
  const cancelBtn = document.getElementById('confirm-modal-cancel');

  okBtn?.addEventListener('click', () => closeConfirmModal(true));
  cancelBtn?.addEventListener('click', () => closeConfirmModal(false));
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeConfirmModal(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.classList.contains('active')) {
      closeConfirmModal(false);
    }
  });
}

// =============================================================================
// Auth
// =============================================================================
function showLogin() {
  document.getElementById('login-modal').classList.add('active');
}

function hideLogin() {
  document.getElementById('login-modal').classList.remove('active');
}

function isAuthenticated() {
  return !!localStorage.getItem('token') || !!localStorage.getItem('refreshToken');
}

let authMode = 'login'; // 'login' | 'signup'

function setAuthMode(mode) {
  authMode = mode;
  const isSignup = mode === 'signup';

  const title = document.querySelector('.login-brand p');
  if (title) title.textContent = isSignup ? 'Criar conta' : 'Painel de Gestão';

  document.getElementById('register-display-name-wrap')?.style.setProperty('display', isSignup ? 'block' : 'none');
  document.getElementById('register-email-wrap')?.style.setProperty('display', isSignup ? 'block' : 'none');
  document.getElementById('register-password2-wrap')?.style.setProperty('display', isSignup ? 'block' : 'none');

  const submit = document.getElementById('login-submit');
  if (submit) submit.textContent = isSignup ? 'Criar conta' : 'Entrar';

  document.getElementById('toggle-register')?.style.setProperty('display', isSignup ? 'none' : 'inline-flex');
  document.getElementById('toggle-login')?.style.setProperty('display', isSignup ? 'inline-flex' : 'none');

  // In signup we need email + confirm password to be required
  const email = document.getElementById('register-email');
  const pw2 = document.getElementById('register-password2');
  if (email) email.required = isSignup;
  if (pw2) pw2.required = isSignup;

  // Username/password already have required in markup, keep it.

  // Hide connection panel on mode change
  const panel = document.getElementById('signup-connection-panel');
  if (panel) panel.style.display = 'none';
  const pre = document.getElementById('signup-connection');
  if (pre) pre.textContent = '—';
}

// =============================================================================
// WebSocket
// =============================================================================
let ws = null;

function connectWebSocket() {
  let url;
  const wsEnv = import.meta.env.VITE_BACKEND_WS?.trim();
  if (wsEnv) {
    url = wsEnv.endsWith('/ws') ? wsEnv : `${wsEnv.replace(/\/$/, '')}/ws`;
  } else if (BACKEND_ORIGIN) {
    const u = new URL(BACKEND_ORIGIN);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = '/ws';
    url = u.href;
  } else {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    url = `${protocol}://${location.host}/ws`;
  }
  ws = new WebSocket(url);

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleWSMessage(msg);
    } catch (e) { /* ignore */ }
  };

  ws.onclose = () => { setTimeout(connectWebSocket, 5000); };
  ws.onerror = () => { ws.close(); };
}

function handleWSMessage(msg) {
  if (msg.type === 'stats') {
    const headerListeners = document.getElementById('header-listeners');
    const liveIndicator = document.getElementById('live-indicator');

    if (headerListeners) {
      headerListeners.textContent = `${msg.data.totalListeners || 0} ouvintes`;
    }
    if (liveIndicator) {
      liveIndicator.classList.toggle('active', (msg.data.activeMounts || 0) > 0);
    }

    if (currentPage === 'dashboard') {
      updateDashboardStats(msg.data);
    }
  }

  if (msg.type === 'metadata') {
    const npTitle = document.getElementById('np-title');
    const npArtist = document.getElementById('np-artist');
    if (npTitle) npTitle.textContent = msg.data.title || 'Unknown';
    if (npArtist) npArtist.textContent = msg.data.artist || '';
  }

  if (msg.type === 'stream') {
    toast(`Stream: ${msg.data.action}`, 'info');
  }
}

// =============================================================================
// Router
// =============================================================================
let currentPage = 'dashboard';

const pages = {
  dashboard: { title: 'Dashboard', render: renderDashboard },
  subscription: { title: 'Assinatura', render: renderSubscription },
  stations: { title: 'Estações', render: renderStations },
  stream: { title: 'Stream Control', render: renderStreamControl },
  media: { title: 'Media Library', render: renderMedia },
  schedule: { title: 'Agenda', render: renderSchedule },
  djs: { title: 'DJs & Locutores', render: renderDJs },
  admin: { title: 'Administração', render: renderAdmin, adminOnly: true }
};

function navigateTo(page) {
  if (!pages[page]) return;
  if (pages[page].adminOnly && currentUser?.role !== 'admin') return;
  currentPage = page;

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  document.getElementById('page-title').textContent = pages[page].title;

  const content = document.getElementById('content-area');
  content.classList.add('is-navigating');
  content.innerHTML = pageLoaderHTML(`A carregar ${pages[page].title}...`);
  pages[page].render(content);
  content.classList.remove('is-navigating');
}

// =============================================================================
// Init
// =============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  showAppLoader('A iniciar...');
  initConfirmModal();

  document.getElementById('toggle-register')?.addEventListener('click', () => setAuthMode('signup'));
  document.getElementById('toggle-login')?.addEventListener('click', () => setAuthMode('login'));

  const loginForm = document.getElementById('login-form');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit');
    errorEl.textContent = '';

    const isSignup = authMode === 'signup';
    setButtonLoading(submitBtn, true, isSignup ? 'A criar conta...' : 'A entrar...');
    setFormLoading(loginForm, true);

    try {
      const username = document.getElementById('login-username').value;
      const password = document.getElementById('login-password').value;

      let data;
      if (isSignup) {
        const displayName = document.getElementById('register-display-name')?.value;
        const email = document.getElementById('register-email')?.value;
        const pw2 = document.getElementById('register-password2')?.value;
        if (password !== pw2) {
          throw new Error('As palavras‑passe não coincidem');
        }

        data = await api('/auth/signup', {
          method: 'POST',
          body: JSON.stringify({
            username,
            email,
            password,
            display_name: displayName || username
          })
        });

        if (data.subscription) setSubscription(data.subscription);
        const panel = document.getElementById('signup-connection-panel');
        if (panel) {
          panel.style.display = 'block';
          document.getElementById('signup-connection').textContent =
            data.message || 'Conta criada! Escolhe um plano de assinatura.';
        }
      } else {
        data = await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password })
        });
      }

      localStorage.setItem('token', data.token);
      if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
      currentUser = data.user;
      if (data.subscription) setSubscription(data.subscription);
      else await loadSession();
      updateUserUI(data.user);

      hideLogin();
      showAppLoader('A preparar o painel...');
      const dest = isSignup || !subscriptionState?.hasAccess && currentUser?.role !== 'admin'
        ? 'subscription' : 'dashboard';
      navigateTo(dest);
      toast(isSignup ? 'Conta criada! Escolhe um plano.' : 'Sessão iniciada!', 'success');
    } catch (err) {
      errorEl.textContent = err.message || 'Credenciais inválidas';
    } finally {
      setButtonLoading(submitBtn, false);
      setFormLoading(loginForm, false);
      hideAppLoader();
    }
  });

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(item.dataset.page);
      document.getElementById('sidebar').classList.remove('open');
    });
  });

  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  document.getElementById('btn-logout').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    setButtonLoading(btn, true, 'A sair...');
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      try {
        await api('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken })
        });
      } catch { /* token may already be invalid */ }
      clearAuth();
      document.getElementById('content-area').innerHTML = '';
      setAuthMode('login');
      showLogin();
      toast('Sessão terminada', 'warning');
    } finally {
      setButtonLoading(btn, false);
    }
  });

  try {
    if (!isAuthenticated()) {
      setAuthMode('login');
      showLogin();
    } else {
      showAppLoader('A restaurar sessão...');
      if (!localStorage.getItem('token') && localStorage.getItem('refreshToken')) {
        try {
          await refreshSession();
        } catch {
          clearAuth();
        }
      }
      if (localStorage.getItem('token')) {
        const session = await loadSession();
        if (session) {
          navigateTo('dashboard');
        } else {
          clearAuth();
          setAuthMode('login');
          showLogin();
        }
      } else {
        setAuthMode('login');
        showLogin();
      }
    }
  } finally {
    hideAppLoader();
  }

  connectWebSocket();
});
