# Documentação do Frontend — StreamServer Dashboard

Painel de gestão de rádio profissional. SPA (Single Page Application) em **JavaScript puro (Vanilla JS) + Vite**, sem framework, servida estaticamente e ligada a um backend via API REST e WebSocket.

---

## 1. Visão geral

| Item | Valor |
|------|-------|
| Nome | `streamserver-dashboard` |
| Versão | 1.0.0 |
| Stack | Vanilla JS (ES Modules) + Vite 5 |
| Dependências | `chart.js` (gráficos), `lucide` (ícones) |
| Idioma da UI | Português (pt) |
| Estilo | CSS próprio com design system (tema escuro) |
| Build output | `dist/` |

O frontend é totalmente client-side: o `index.html` carrega `src/app.js` como módulo, que orquestra autenticação, routing e a renderização das páginas.

---

## 2. Estrutura de pastas

```
frontend/
├── index.html                  # Shell HTML: sidebar, top-bar, modais (login/confirm), toasts
├── vite.config.js              # Dev server + proxy /api e /ws para o backend
├── vercel.json                 # Config de deploy Vercel (rewrites + cache)
├── Dockerfile                  # Build multi-stage → Nginx (SPA fallback)
├── package.json
├── public/
│   └── multicaixa-express.png  # Logo do meio de pagamento
├── scripts/
│   └── sync-vercel-rewrites.mjs# Reescreve vercel.json com a URL real do backend
└── src/
    ├── app.js                  # Núcleo: API client, auth, router, WebSocket, toasts, modais
    ├── loading.js              # Utilitários de loading (preloader, botões, formulários)
    ├── styles.css              # Design system completo (~1042 linhas)
    └── pages/
        ├── dashboard.js        # Estatísticas, "em reprodução", gráfico de ouvintes
        ├── subscription.js     # Planos + pagamento Multicaixa Express
        ├── stations.js         # Gestão de estações + credenciais BUTT
        ├── stream.js           # Controlo de stream (AutoDJ / gravação)
        ├── media.js            # Biblioteca multimédia (pesquisa)
        ├── schedule.js         # Agenda de slots (apenas leitura)
        ├── djs.js              # Lista de DJs & locutores (apenas leitura)
        └── admin.js            # Painel admin (utilizadores + estações)
```

---

## 3. Arquitetura

### 3.1 Núcleo (`src/app.js`)

É o módulo central. Responsabilidades:

- **Sessão**: `loadSession()` carrega utilizador (`/auth/me`) e assinatura (`/subscriptions/me`) em paralelo.
- **API client**: `api()` e `apiUpload()` (ver secção 4).
- **Router**: navegação client-side entre páginas (ver secção 3.2).
- **WebSocket**: ligação em tempo real para estatísticas e metadados (ver secção 5).
- **UI global**: `toast()`, `confirmDialog()`, modal de login, visibilidade de navegação.
- **Tradução**: mapeia mensagens de erro da API (inglês) para português via `translateMessage()`.

Estado em memória:

```16:30:frontend/src/app.js
let currentUser = null;
let subscriptionState = null;

export function getSubscription() { return subscriptionState; }
```

### 3.2 Router

Não há biblioteca de routing — é um objeto `pages` que mapeia nome → `{ title, render }`. A função `navigateTo(page)`:

1. Valida permissões (`adminOnly`).
2. Marca o item ativo na sidebar.
3. Mostra um page-loader e chama `pages[page].render(container)`.

```550:559:frontend/src/app.js
const pages = {
  dashboard: { title: 'Painel', render: renderDashboard },
  subscription: { title: 'Assinatura', render: renderSubscription },
  stations: { title: 'Estações', render: renderStations },
  stream: { title: 'Controlo de Stream', render: renderStreamControl },
  media: { title: 'Biblioteca Multimédia', render: renderMedia },
  schedule: { title: 'Agenda', render: renderSchedule },
  djs: { title: 'DJs & Locutores', render: renderDJs },
  admin: { title: 'Administração', render: renderAdmin, adminOnly: true }
};
```

Cada página exporta uma função `render<Página>(container)` que injeta HTML via `innerHTML` e religa os event listeners. Não há virtual DOM nem reatividade — re-render = re-injeção de HTML.

### 3.3 Fluxo de inicialização

No `DOMContentLoaded`:

1. Mostra preloader global e inicia o modal de confirmação.
2. Liga listeners (login/signup, navegação, menu mobile, logout).
3. Verifica autenticação:
   - Sem token → mostra login.
   - Com refresh token mas sem access token → tenta `refreshSession()`.
   - Com token válido → `loadSession()` e navega para o dashboard.
4. Abre a ligação WebSocket.

---

## 4. Camada de API

### 4.1 Resolução do backend

```70:85:frontend/src/app.js
function resolveBackendOrigin() {
  const raw = import.meta.env.VITE_BACKEND_URL?.trim();
  if (!raw) return null;
  // ... valida e rejeita placeholders/localhost ...
}

const BACKEND_ORIGIN = resolveBackendOrigin();
const API_BASE = BACKEND_ORIGIN ? `${BACKEND_ORIGIN}/api` : '/api';
```

- **Dev**: `API_BASE = '/api'` → proxy do Vite encaminha para o backend.
- **Produção**: usa `VITE_BACKEND_URL` (ex.: serviço Render).

### 4.2 `api(path, options)`

Wrapper sobre `fetch` que:

- Injeta `Authorization: Bearer <token>` (exceto rotas públicas de auth).
- Faz parse seguro de JSON (tolera respostas vazias/não-JSON).
- **Refresh automático**: ao receber `401`, tenta renovar o token (uma vez) e repete o pedido; se falhar, faz logout e mostra o login.
- Traduz mensagens de erro para português e lança `Error` com `status`/`response` anexados.

### 4.3 `apiUpload(path, formData, options)`

Variante para upload multipart (ex.: comprovativo de pagamento). Mesma lógica de refresh/401, mas sem `Content-Type` fixo (deixa o browser definir o boundary).

### 4.4 Gestão de tokens

- `token` e `refreshToken` ficam em `localStorage`.
- `refreshSession()` usa um lock (`refreshInFlight`) para evitar múltiplas renovações concorrentes.
- Rotas públicas: `/auth/login`, `/auth/signup`, `/auth/refresh`.

---

## 5. Tempo real (WebSocket)

`connectWebSocket()` resolve a URL (`VITE_BACKEND_WS`, origem do backend ou host atual) e termina em `/ws`. Reconexão automática a cada 5s no `onclose`.

Mensagens tratadas em `handleWSMessage`:

| `type` | Efeito |
|--------|--------|
| `stats` | Atualiza ouvintes no cabeçalho, indicador LIVE e (se na dashboard) os cards/mounts |
| `metadata` | Atualiza "Em Reprodução" (título/artista) |
| `stream` | Mostra um toast com a ação |

---

## 6. Páginas

### 6.1 Dashboard (`dashboard.js`)
- 4 cards: ouvintes atuais, pico de hoje, nº de estações, mounts ativos.
- Painel de **credenciais de stream (BUTT)** com botão copiar (`/auth/stream-connection`).
- "Em Reprodução" + lista de mounts ativos (atualizados via WebSocket).
- Gráfico de ouvintes (Chart.js, importado dinamicamente) com períodos 1h/6h/24h/7d (`/stats/listeners`).
- Dados iniciais: `/stats/overview` e `/stats/realtime`.

### 6.2 Estações (`stations.js`)
- Tabela de estações (`/stations`).
- Modal "Nova Estação" (nome, slug, género, descrição, formato, bitrate) → `POST /stations`. Botão só aparece se `hasAccess` ou `isAdmin`.
- Modal de **credenciais**: URL pública de escuta + configuração BUTT, com copiar e **download do ficheiro `.butt`** (`/stations/:id/stream-config`).
- Remoção de estação (apenas admin) com diálogo de confirmação.

### 6.3 Controlo de Stream (`stream.js`)
- Botões de ação: iniciar/parar/saltar **AutoDJ** e iniciar/parar **gravação** (`POST /stream/autodj/*`, `/stream/recording/*`).
- Estado dos mounts e do **Liquidsoap** (`/stream/status`).

### 6.4 Assinatura (`subscription.js`)
- Lista de planos (`/subscriptions/plans`) e banner de estado (admin / ativo / pendente / a aguardar pagamento / inativo).
- Subscrição → `POST /subscriptions/subscribe`. Se devolver `AWAITING_PAYMENT_PROOF`, abre o **modal de pagamento Multicaixa Express** (Angola/AOA).
- Modal de pagamento: passos, número Express (de `VITE_PAYMENT_EXPRESS_PHONE`), valor, e upload de comprovativo → `POST /subscriptions/proof` (via `apiUpload`).

### 6.5 Multimédia (`media.js`)
- Tabela com pesquisa (título/artista/ficheiro) → `/media?search=&limit=50`. Apenas leitura. Formata duração e datas em pt.

### 6.6 Agenda (`schedule.js`)
- Tabela de slots (dia, início, fim, título, DJ, playlist, estação) → `/schedule`. Apenas leitura (sem editor por agora).

### 6.7 DJs (`djs.js`)
- Tabela de DJs/locutores (`/djs`): nome, utilizador, estação, mounts permitidos, estado. Apenas leitura.

### 6.8 Admin (`admin.js`) — apenas `role === 'admin'`
- Cards de resumo (`/admin/overview`).
- **Gestão de utilizadores** (`/admin/users`): conceder plano, revogar, bloquear/desbloquear, remover.
- **Gestão de estações** (`/admin/stations`, com fallback para `/stations`): remover.

---

## 7. Endpoints consumidos (resumo)

| Área | Endpoints |
|------|-----------|
| Auth | `/auth/login`, `/auth/signup`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `/auth/stream-connection` |
| Stats | `/stats/overview`, `/stats/realtime`, `/stats/listeners` |
| Estações | `/stations`, `/stations/:id`, `/stations/:id/stream-config` |
| Stream | `/stream/status`, `/stream/autodj/{start,stop,skip}`, `/stream/recording/{start,stop}` |
| Multimédia | `/media` |
| Agenda | `/schedule` |
| DJs | `/djs` |
| Assinaturas | `/subscriptions/{plans,me,subscribe,proof,payment-info}` |
| Admin | `/admin/{overview,users,stations}`, `/admin/users/:id/{block,unblock,subscription}` |

---

## 8. Loading & feedback (`loading.js`)

- `showAppLoader` / `hideAppLoader`: preloader global.
- `pageLoaderHTML`: placeholder durante navegação.
- `setButtonLoading` / `withButtonLoading`: estado de loading em botões (preserva o HTML original).
- `setFormLoading`: desativa/reativa campos de um formulário.

---

## 9. Estilo (`styles.css`)

Design system com variáveis CSS (tema escuro). Tokens principais:

- Fundo: `--bg-primary #0a0e1a`, cards `--bg-card #1a2035`.
- Acento: `--accent #6366f1` (índigo).
- Estado: `--success`, `--warning`, `--danger`, `--info`.
- Layout: sidebar 260px, top-bar 64px, `--radius 12px`.
- Tipografia: **Inter** (Google Fonts).

Componentes estilizados: sidebar/nav, cards de stats, painéis, tabelas, badges, botões (primary/outline/danger/sm/full), modais, toasts, equalizador animado, plan-cards e modal de pagamento.

---

## 10. Configuração (variáveis de ambiente)

Definidas em `frontend/.env` (ver `.env.example`), todas com prefixo `VITE_`:

| Variável | Uso |
|----------|-----|
| `VITE_BACKEND_URL` | Origem do backend (produção). Em dev pode omitir-se (usa proxy). |
| `VITE_BACKEND_WS` | URL do WebSocket (opcional; deriva do backend se ausente). |
| `VITE_PAYMENT_EXPRESS_PHONE` | Número Multicaixa Express mostrado no pagamento. |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Opcional (Supabase no browser). |

> Na Vercel, **não** usar `localhost` nem o placeholder `YOUR_API_DOMAIN` — o build falha (ver `sync-vercel-rewrites.mjs`).

---

## 11. Scripts e execução

```bash
npm install        # instalar dependências
npm run dev        # servidor de desenvolvimento Vite (porta 5173)
npm run build      # sincroniza rewrites Vercel + build de produção → dist/
npm run preview    # pré-visualizar o build
```

**Dev server** (`vite.config.js`): porta 5173, com proxy de `/api` e `/ws` para o backend (default `http://127.0.0.1:3000`). Em caso de backend indisponível, o proxy devolve 503 com mensagem amigável.

---

## 12. Deploy

### Vercel (recomendado)
- `buildCommand`: `node scripts/sync-vercel-rewrites.mjs && npm run build`.
- O script reescreve `vercel.json` com a URL real (`VITE_BACKEND_URL`), criando rewrites para `/api`, `/ws`, `/stream` e o fallback SPA para `/index.html`.
- Assets em `/assets/*` com cache imutável de 1 ano.

### Docker / Nginx
- `Dockerfile` multi-stage: build com Node 20 → serve `dist/` com Nginx, com fallback SPA (`try_files ... /index.html`).

---

## 13. Notas de segurança e i18n

- **Escape de HTML**: cada página tem uma função `escapeHtml()` aplicada a dados dinâmicos inseridos via `innerHTML` (mitiga XSS).
- **Tokens** em `localStorage` (acessíveis a JS — adequado a um painel interno; considerar cookies httpOnly para maior segurança).
- **i18n**: toda a UI em português; mensagens da API traduzidas centralmente em `app.js` (`API_MESSAGES_PT`, `FAILED_TO_PT`, `translateMessage`).
```
