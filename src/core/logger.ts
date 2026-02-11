/**
 * Logger
 *
 * Structured logging with pino + pino-roll for automatic file rotation.
 *
 * Features:
 * - JSON structured logs to file via pino-roll
 * - Automatic rotation by size (10MB) with retention (7 files)
 * - Pretty console output in development
 * - Overrides console.log/error for unified logging
 */

import pino from 'pino';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

/** Maximum size of a log file before rotation */
const MAX_LOG_SIZE = 1024 * 1024 * 10; // 10MB

/** Maximum number of rotated log files to keep */
const MAX_LOG_FILES = 7;

/** Global logger instance */
let logger: pino.Logger;

/**
 * Initialize the logger.
 *
 * Sets up pino with pino-roll file transport (rotation + retention)
 * and overrides console.log/error to route through pino.
 */
export function initLogger(): void {
  const appDir = dirname(process.execPath);
  const logDir = join(appDir, 'logs');
  const logFile = join(logDir, 'cc-chat.log');

  // Create logs directory if it doesn't exist
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  logger = pino({
    level: 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
  }, pino.transport({
    targets: [
      // File transport with rotation
      {
        target: 'pino-roll',
        options: {
          file: logFile,
          frequency: 'daily',
          limit: { count: MAX_LOG_FILES },
          size: MAX_LOG_SIZE,
          mkdir: true,
        },
        level: 'info',
      },
      // Pretty console output
      {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname',
        },
        level: 'info',
      },
    ],
  }));

  // Override console methods to route through pino
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    logger.info(message);
  };

  console.error = (...args: unknown[]) => {
    const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    logger.error(message);
  };
}

/**
 * Get the pino logger instance for direct structured logging.
 */
export function getLogger(): pino.Logger {
  if (!logger) {
    logger = pino({ level: 'info' });
  }
  return logger;
}

/**
 * Flush pending log writes. Call before process exit.
 */
export function flushLogger(): void {
  if (logger) {
    logger.flush();
  }
}
