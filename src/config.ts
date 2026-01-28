import { dirname, join, isAbsolute } from 'path';
import { existsSync, readFileSync } from 'fs';

// Get app directory (where executable is located)
const appDir = dirname(process.execPath);

// Load .env file from app directory into process.env
export function loadEnvFromAppDir(): void {
  const envPath = join(appDir, '.env');
  if (!existsSync(envPath)) return;

  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();

      // Only set if not already defined
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore errors
  }
}

// Resolve path relative to app directory if not absolute
function resolvePath(path: string): string {
  if (!path) return path;
  if (isAbsolute(path)) return path;
  return join(appDir, path);
}

// Config must be accessed after loadEnvFromAppDir() is called
export const config = {
  get discord() {
    return {
      token: process.env.DISCORD_TOKEN || '',
      clientId: process.env.DISCORD_CLIENT_ID || '',
      guildId: process.env.DISCORD_GUILD_ID || '',
    };
  },
  get projectRoots() {
    return (process.env.PROJECT_ROOTS || '')
      .split(/[,;]/)
      .map(p => p.trim())
      .filter(Boolean);
  },
  get dbPath() {
    return resolvePath(process.env.DB_PATH || './data/cc-chat.db');
  },
  get allowedUsers() {
    return process.env.ALLOWED_USER_IDS?.split(',').filter(Boolean) || [];
  },
  get claude() {
    return {
      defaultModel: (process.env.DEFAULT_MODEL || 'opus') as 'sonnet' | 'opus' | 'haiku',
      timeout: 10 * 60 * 1000, // 10 minutes
    };
  },
};

export function validateConfig(): void {
  if (!config.discord.token) {
    throw new Error('DISCORD_TOKEN is required');
  }
  if (!config.discord.clientId) {
    throw new Error('DISCORD_CLIENT_ID is required');
  }
}
