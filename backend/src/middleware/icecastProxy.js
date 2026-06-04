// =============================================================================
// Icecast HTTP proxy — /stream/* → ICECAST_HOST:ICECAST_PORT/*
// Used in production so Vercel can expose https://app.vercel.app/stream/...
// =============================================================================

const http = require('http');
const logger = require('../utils/logger');

function icecastTarget() {
  return {
    host: process.env.ICECAST_HOST || '127.0.0.1',
    port: parseInt(process.env.ICECAST_PORT, 10) || 8000
  };
}

function mountIcecastProxy(app) {
  if (process.env.ICECAST_DISABLED === 'true' || process.env.SKIP_ICECAST === 'true') {
    return;
  }

  app.use('/stream', (req, res) => {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Origin, Accept, Icy-MetaData');
      return res.status(204).end();
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { host, port } = icecastTarget();
    const path = req.url || '/';

    const proxyReq = http.request(
      {
        hostname: host,
        port,
        path,
        method: req.method,
        headers: {
          'Icy-MetaData': req.get('Icy-MetaData') || '1'
        }
      },
      (proxyRes) => {
        const headers = {
          ...proxyRes.headers,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'Icy-MetaData, Ice-Audio-Info'
        };
        res.writeHead(proxyRes.statusCode, headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (err) => {
      logger.error('Icecast stream proxy error:', err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Stream server unavailable' });
      }
    });

    proxyReq.end();
  });
}

module.exports = { mountIcecastProxy };
