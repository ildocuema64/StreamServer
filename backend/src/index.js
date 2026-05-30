// =============================================================================
// StreamServer Backend - Main Entry Point
// =============================================================================

require('./utils/loadEnv').loadEnv();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { WebSocketServer } = require('ws');
const http = require('http');

const logger = require('./utils/logger');
const { initDatabase } = require('./database/connection');
const { initRedis, isRedisDisabled } = require('./services/redis');
const { startStatsCollector } = require('./services/statsCollector');
const { startScheduler } = require('./services/scheduler');

// Routes
const authRoutes = require('./routes/auth');
const stationRoutes = require('./routes/stations');
const djRoutes = require('./routes/djs');
const mediaRoutes = require('./routes/media');
const playlistRoutes = require('./routes/playlists');
const scheduleRoutes = require('./routes/schedule');
const statsRoutes = require('./routes/stats');
const streamRoutes = require('./routes/stream');
const recordingRoutes = require('./routes/recordings');
const publicRoutes = require('./routes/public');
const internalRoutes = require('./routes/internal');
const healthRoutes = require('./routes/health');

// WebSocket handler
const { setupWebSocket } = require('./services/websocket');

const app = express();
const server = http.createServer(app);
const PORT = process.env.APP_PORT || 3000;

// =============================================================================
// Middleware
// =============================================================================

// Security
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));

// CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [process.env.APP_URL, /\.example\.com$/]
    : '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) }
}));

// Rate limiting
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

app.use('/api/', globalLimiter);

// Trust proxy (behind nginx)
app.set('trust proxy', 1);

// =============================================================================
// Routes
// =============================================================================
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/stations', stationRoutes);
app.use('/api/djs', djRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/internal', internalRoutes);

// =============================================================================
// Error Handling
// =============================================================================
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// =============================================================================
// Server Startup
// =============================================================================
async function start() {
  try {
    // Initialize database
    await initDatabase();
    logger.info('✅ Database connected');

    // Initialize Redis
    await initRedis();
    logger.info(isRedisDisabled()
      ? '✅ Redis skipped (REDIS_DISABLED / no-op mode)'
      : '✅ Redis connected');

    // Setup WebSocket
    const wss = new WebSocketServer({ server, path: '/ws' });
    setupWebSocket(wss);
    logger.info('✅ WebSocket server initialized');

    // Start stats collector
    startStatsCollector();
    logger.info(process.env.ICECAST_DISABLED === 'true' || process.env.SKIP_ICECAST === 'true'
      ? '⏭️  Stats collector skipped (no Icecast)'
      : '✅ Stats collector started');

    // Start scheduler
    startScheduler();
    logger.info('✅ Scheduler started');

    // Start HTTP server
    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 StreamServer API running on port ${PORT}`);
      logger.info(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down...');
  server.close(() => {
    process.exit(0);
  });
});

start();
