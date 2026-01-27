import { existsSync, mkdirSync, statSync, readdirSync, unlinkSync, renameSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';

const MAX_LOG_SIZE_MB = 10;
const MAX_LOG_FILES = 7;

let logDir: string;
let logFile: string;

export function initLogger(): void {
  // Use directory where the executable is located
  const appDir = dirname(process.execPath);
  logDir = join(appDir, 'logs');
  logFile = join(logDir, 'cc-chat.log');

  // Create logs directory
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  // Rotate logs if needed
  rotateLogsIfNeeded();

  // Clean old logs
  cleanOldLogs();

  // Override console.log and console.error
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

function writeLog(level: string, message: string): void {
  if (!logFile) return;

  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `${timestamp} [${level}] ${message}\n`;

  try {
    appendFileSync(logFile, line, 'utf-8');
  } catch {
    // Ignore write errors
  }
}

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
    // Ignore rotation errors
  }
}

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

    // Remove old files beyond limit
    for (const file of files.slice(MAX_LOG_FILES)) {
      unlinkSync(file.path);
    }
  } catch {
    // Ignore cleanup errors
  }
}
