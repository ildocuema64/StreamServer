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
const API_BASE = '/api';

export async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('token');
    showLogin();
    throw new Error('Session expired');
  }

  // Some proxies / middlewares can return empty bodies (or non-JSON) on errors.
  // Parse defensively so the UI shows a useful message instead of crashing.
  const raw = await res.text();
  let data = null;
  if (raw && raw.trim()) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
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

  // Successful response with no body (e.g. 204)
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
  return !!localStorage.getItem('token');
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
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${protocol}://${location.host}/ws`);

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

  // Update nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  // Update title
  document.getElementById('page-title').textContent = pages[page].title;

  // Render page
  const content = document.getElementById('content-area');
  content.innerHTML = '';
  pages[page].render(content);
}

// =============================================================================
// Init
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('toggle-register')?.addEventListener('click', () => setAuthMode('signup'));
  document.getElementById('toggle-login')?.addEventListener('click', () => setAuthMode('login'));

  // Login form
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';

    try {
      const username = document.getElementById('login-username').value;
      const password = document.getElementById('login-password').value;

      let data;
      if (authMode === 'signup') {
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
      currentUser = data.user;
      if (data.subscription) setSubscription(data.subscription);
      else await loadSession();
      updateUserUI(data.user);

      hideLogin();
      const dest = authMode === 'signup' || !subscriptionState?.hasAccess && currentUser?.role !== 'admin'
        ? 'subscription' : 'dashboard';
      navigateTo(dest);
      toast(authMode === 'signup' ? 'Conta criada! Escolhe um plano.' : 'Sessão iniciada!', 'success');
    } catch (err) {
      errorEl.textContent = err.message || 'Credenciais inválidas';
    }
  });

  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(item.dataset.page);
      // Close mobile sidebar
      document.getElementById('sidebar').classList.remove('open');
    });
  });

  // Mobile menu
  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('token');
    currentUser = null;
    subscriptionState = null;
    showLogin();
    toast('Sessão terminada', 'warning');
  });

  if (!isAuthenticated()) {
    setAuthMode('login');
    showLogin();
  } else {
    loadSession().then(() => navigateTo('dashboard'));
  }

  // Connect WebSocket
  connectWebSocket();
});
