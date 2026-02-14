/**
 * Logger
 *
 * Simple structured logger with three outputs:
 * - stdout: for service managers (launchctl/systemd)
 * - logs/cc-chat.log: all levels
 * - logs/error.log: error level only
 *
 * Format: YYYY-MM-DDTHH:mm:ss.sssZ [cc-chat] [level] message key=value
 */

import { createWriteStream, mkdirSync, existsSync } from 'fs';
import type { WriteStream } from 'fs';
import { join, dirname } from 'path';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_VALUE: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let minLevel: LogLevel = 'info';
let allStream: WriteStream | null = null;
let errStream: WriteStream | null = null;

/** Format structured data as key=value pairs */
function formatExtra(obj: Record<string, unknown>): string {
  const pairs = Object.entries(obj)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ');
  return pairs ? ` ${pairs}` : '';
}

/** Build a log line from level + overloaded args */
function format(level: LogLevel, first: unknown, second?: string): string {
  const ts = new Date().toISOString();
  let msg: string;
  let extra = '';

  if (typeof first === 'string') {
    msg = first;
  } else if (first instanceof Error) {
    msg = second ?? first.message;
    extra = ` ${first.stack ?? first.message}`;
  } else if (typeof first === 'object' && first !== null) {
    msg = second ?? '';
    extra = formatExtra(first as Record<string, unknown>);
  } else {
    msg = String(first);
  }

  return `${ts} [cc-chat] [${level}] ${msg}${extra}\n`;
}

/** Write a formatted line to all applicable outputs */
function write(level: LogLevel, first: unknown, second?: string): void {
  if (LEVEL_VALUE[level] < LEVEL_VALUE[minLevel]) return;
  const line = format(level, first, second);
  process.stdout.write(line);
  allStream?.write(line);
  if (LEVEL_VALUE[level] >= LEVEL_VALUE.error) {
    errStream?.write(line);
  }
}

/** Logger interface compatible with pino's overloaded call signatures */
export interface Logger {
  debug(msg: string): void;
  debug(obj: Record<string, unknown>, msg: string): void;
  info(msg: string): void;
  info(obj: Record<string, unknown>, msg: string): void;
  warn(msg: string): void;
  warn(obj: unknown, msg: string): void;
  error(msg: string): void;
  error(obj: unknown, msg: string): void;
  flush(): void;
}

const logger: Logger = {
  debug: (first: unknown, second?: string) => write('debug', first, second),
  info: (first: unknown, second?: string) => write('info', first, second),
  warn: (first: unknown, second?: string) => write('warn', first, second),
  error: (first: unknown, second?: string) => write('error', first, second),
  flush: () => { /* streams auto-flush on process exit */ },
};

/**
 * Initialize logger with file outputs.
 * @param debug - If true, set minimum level to 'debug'
 */
export function initLogger(debug = false): void {
  minLevel = debug ? 'debug' : 'info';

  const logDir = join(dirname(process.execPath), 'logs');
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

  allStream = createWriteStream(join(logDir, 'cc-chat.log'), { flags: 'a' });
  errStream = createWriteStream(join(logDir, 'error.log'), { flags: 'a' });
}

/** Get the logger instance. Works before initLogger (stdout only). */
export function getLogger(): Logger {
  return logger;
}

/** Close file streams. Call before process exit. */
export function flushLogger(): void {
  allStream?.end();
  errStream?.end();
}
