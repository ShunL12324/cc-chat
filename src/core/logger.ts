/**
 * Logger
 *
 * Structured logging with pino. Writes to file with manual rotation.
 * Compatible with Bun single-file compilation (no dynamic transports).
 *
 * Features:
 * - JSON structured logs to file via pino.destination
 * - Manual rotation by size (10MB) with retention (7 files)
 * - Console output preserved alongside file logging
 * - Overrides console.log/error for unified logging
 */

import pino from 'pino';
import { existsSync, mkdirSync, statSync, renameSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';

/** Maximum size of a log file before rotation (10MB) */
const MAX_LOG_SIZE = 1024 * 1024 * 10;

/** Maximum number of rotated log files to keep */
const MAX_LOG_FILES = 7;

/** Global logger instance */
let logger: pino.Logger;

/** Log file path */
let logFilePath: string;

/**
 * Rotate log file if it exceeds MAX_LOG_SIZE.
 * Renames current log to .1, shifts existing .N to .N+1, removes oldest.
 */
function rotateIfNeeded(): void {
  if (!logFilePath || !existsSync(logFilePath)) return;

  try {
    const stat = statSync(logFilePath);
    if (stat.size < MAX_LOG_SIZE) return;

    const logDir = dirname(logFilePath);
    const baseName = logFilePath.split(/[/\\]/).pop()!;

    // Remove oldest
    const oldest = join(logDir, `${baseName}.${MAX_LOG_FILES}`);
    if (existsSync(oldest)) {
      unlinkSync(oldest);
    }

    // Shift existing rotated files
    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const from = join(logDir, `${baseName}.${i}`);
      const to = join(logDir, `${baseName}.${i + 1}`);
      if (existsSync(from)) {
        renameSync(from, to);
      }
    }

    // Rotate current
    renameSync(logFilePath, join(logDir, `${baseName}.1`));
  } catch {
    // Ignore rotation errors
  }
}

/**
 * Initialize the logger.
 *
 * Uses pino.destination for direct file writing (no worker_threads transport).
 * This is compatible with Bun single-file compilation.
 */
export function initLogger(): void {
  const appDir = dirname(process.execPath);
  const logDir = join(appDir, 'logs');
  logFilePath = join(logDir, 'cc-chat.log');

  // Create logs directory if it doesn't exist
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  // Rotate before opening
  rotateIfNeeded();

  const dest = pino.destination({
    dest: logFilePath,
    sync: false,
    mkdir: true,
  });

  logger = pino({
    level: 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
  }, dest);

  // Set up periodic rotation check (every 5 minutes)
  setInterval(() => {
    rotateIfNeeded();
  }, 5 * 60 * 1000);

  // Override console methods to route through pino + keep console output
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    logger.info(message);
    originalLog.apply(console, args);
  };

  console.error = (...args: unknown[]) => {
    const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    logger.error(message);
    originalError.apply(console, args);
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
