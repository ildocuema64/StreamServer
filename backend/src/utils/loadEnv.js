// =============================================================================
// Load .env from repo root first, then backend/.env (overrides)
// =============================================================================

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

/** @returns {string} StreamServer repository root (parent of backend/) */
function findRepoRoot() {
  // This file: backend/src/utils/loadEnv.js → up 3 levels = repo root
  return path.resolve(__dirname, '..', '..', '..');
}

function loadEnv() {
  const root = findRepoRoot();
  const rootEnv = path.join(root, '.env');
  const backendEnv = path.join(root, 'backend', '.env');

  if (fs.existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv });
  }
  if (fs.existsSync(backendEnv)) {
    dotenv.config({ path: backendEnv, override: true });
  }
  dotenv.config({ override: true });
}

module.exports = { loadEnv, findRepoRoot };
