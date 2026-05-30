// =============================================================================
// Logger Configuration (Winston)
// =============================================================================

const winston = require('winston');
const path = require('path');

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'streamserver' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length > 1
            ? ` ${JSON.stringify(meta)}` : '';
          return `[${timestamp}] ${level}: ${message}${metaStr}`;
        })
      )
    })
  ]
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({
    filename: '/var/log/streamserver/error.log',
    level: 'error',
    maxsize: 10 * 1024 * 1024,
    maxFiles: 5
  }));
  logger.add(new winston.transports.File({
    filename: '/var/log/streamserver/combined.log',
    maxsize: 10 * 1024 * 1024,
    maxFiles: 10
  }));
}

module.exports = logger;
