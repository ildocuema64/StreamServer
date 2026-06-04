/**
 * Atualiza frontend/vercel.json com rewrites para o backend (build na Vercel).
 * Define VITE_BACKEND_URL (ou BACKEND_URL) nas Environment Variables do projeto.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vercelPath = path.join(__dirname, '..', 'vercel.json');

const raw = (process.env.VITE_BACKEND_URL || process.env.BACKEND_URL || '').trim();
if (!raw) {
  console.warn(
    '[vercel] VITE_BACKEND_URL não definido — /api em produção usará o placeholder em vercel.json (login falhará).'
  );
  process.exit(0);
}

let base;
try {
  base = new URL(raw).origin;
} catch {
  console.error('[vercel] VITE_BACKEND_URL inválido:', raw);
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
const apiRewrites = [
  { source: '/api/(.*)', destination: `${base}/api/$1` },
  { source: '/ws', destination: `${base}/ws` },
];
const spaRewrite = cfg.rewrites?.find((r) => r.source?.includes('index.html')) ?? {
  source: '/((?!assets/).*)',
  destination: '/index.html',
};
cfg.rewrites = [...apiRewrites, spaRewrite];

fs.writeFileSync(vercelPath, `${JSON.stringify(cfg, null, 2)}\n`);
console.log('[vercel] Rewrites /api e /ws →', base);
