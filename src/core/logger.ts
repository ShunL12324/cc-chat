/**
 * Logger
 *
 * File-based logging with automatic rotation and cleanup.
 * Overrides console.log and console.error to write to log files.
 *
 * Features:
 * - Writes logs to {app-dir}/logs/cc-chat.log
 * - Rotates logs when they exceed MAX_LOG_SIZE_MB
 * - Keeps only MAX_LOG_FILES rotated files
 * - Timestamps and log levels for each entry
 */

import { existsSync, mkdirSync, statSync, readdirSync, unlinkSync, renameSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';

/** Maximum size of a log file before rotation (in MB) */
const MAX_LOG_SIZE_MB = 10;

/** Maximum number of rotated log files to keep */
const MAX_LOG_FILES = 7;

/** Directory containing log files */
let logDir: string;

/** Path to the current log file */
let logFile: string;

/**
 * Initialize the logger.
 *
 * Sets up log directory, rotates logs if needed, cleans old logs,
 * and overrides console.log/error to write to files.
 */
export function initLogger(): void {
  // Use directory where the executable is located
  const appDir = dirname(process.execPath);
  logDir = join(appDir, 'logs');
  logFile = join(logDir, 'cc-chat.log');

  // Create logs directory if it doesn't exist
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  // Rotate current log if it exceeds size limit
  rotateLogsIfNeeded();

  // Remove old rotated logs beyond retention limit
  cleanOldLogs();

  // Override console methods to also write to file
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    const message = args.map(a => String(a)).join(' ');
    writeLog('INFO', message);
    originalLog.apply(console, args);
  };

  console.error = (...args: unknown[]) => {
    const message = args.map(a => String(a)).join(' ');
    writeLog('ERROR', message);
    originalError.apply(console, args);
  };
}

/**
 * Write a log entry to the current log file.
 */
function writeLog(level: string, message: string): void {
  if (!logFile) return;

  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `${timestamp} [${level}] ${message}\n`;

  try {
    appendFileSync(logFile, line, 'utf-8');
  } catch {
    // Ignore write errors silently
  }
}

/**
 * Rotate the current log file if it exceeds the size limit.
 * Creates a timestamped backup file.
 */
function rotateLogsIfNeeded(): void {
  if (!existsSync(logFile)) return;

  try {
    const stats = statSync(logFile);
    const sizeMB = stats.size / (1024 * 1024);

    if (sizeMB > MAX_LOG_SIZE_MB) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const rotatedFile = join(logDir, `cc-chat-${timestamp}.log`);
      renameSync(logFile, rotatedFile);
    }
  } catch {
    // Ignore rotation errors silently
  }
}

/**
 * Remove old rotated log files beyond the retention limit.
 * Keeps the most recent MAX_LOG_FILES files.
 */
function cleanOldLogs(): void {
  try {
    const files = readdirSync(logDir)
      .filter(f => f.startsWith('cc-chat-') && f.endsWith('.log'))
      .map(f => ({
        name: f,
        path: join(logDir, f),
        mtime: statSync(join(logDir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime);

    // Remove files beyond the retention limit
    for (const file of files.slice(MAX_LOG_FILES)) {
      unlinkSync(file.path);
    }
  } catch {
    // Ignore cleanup errors silently
  }
}
