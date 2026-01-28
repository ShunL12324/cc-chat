/**
 * Configuration Module
 *
 * Handles application configuration loading and validation.
 * Supports loading environment variables from .env file located
 * in the executable's directory.
 *
 * Configuration sources (in order of precedence):
 * 1. System environment variables
 * 2. .env file in app directory
 *
 * All paths are resolved relative to the executable location,
 * making the application portable as a standalone binary.
 */

import { dirname, join, isAbsolute } from 'path';
import { existsSync, readFileSync } from 'fs';

/**
 * Application directory where the executable is located.
 * Used as the base for relative path resolution.
 */
const appDir = dirname(process.execPath);

/**
 * Load environment variables from .env file in the app directory.
 *
 * Parses key=value pairs, ignoring comments and empty lines.
 * Only sets variables that are not already defined in process.env,
 * allowing system environment to take precedence.
 *
 * Call this function before accessing the config object.
 */
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

      // Only set if not already defined in environment
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore file read errors silently
  }
}

/**
 * Resolve a path relative to the app directory.
 * Returns the path unchanged if it's already absolute.
 *
 * @param path - Path to resolve
 * @returns Absolute path
 */
function resolvePath(path: string): string {
  if (!path) return path;
  if (isAbsolute(path)) return path;
  return join(appDir, path);
}

/**
 * Application configuration object.
 *
 * Uses getters to lazily read from process.env, allowing
 * loadEnvFromAppDir() to be called after module import.
 *
 * @property discord - Discord bot connection settings
 * @property projectRoots - Allowed project root directories
 * @property dbPath - SQLite database file path
 * @property allowedUsers - User IDs allowed to use the bot
 * @property claude - Claude CLI settings
 */
export const config = {
  /**
   * Discord connection configuration.
   */
  get discord() {
    return {
      /** Bot authentication token */
      token: process.env.DISCORD_TOKEN || '',
      /** Discord application client ID */
      clientId: process.env.DISCORD_CLIENT_ID || '',
      /** Guild ID for development (optional) */
      guildId: process.env.DISCORD_GUILD_ID || '',
    };
  },

  /**
   * Allowed project root directories.
   * Users can only create sessions within these directories.
   * Supports comma or semicolon separated list.
   */
  get projectRoots() {
    return (process.env.PROJECT_ROOTS || '')
      .split(/[,;]/)
      .map(p => p.trim())
      .filter(Boolean);
  },

  /**
   * Path to the SQLite database file.
   * Resolved relative to app directory if not absolute.
   */
  get dbPath() {
    return resolvePath(process.env.DB_PATH || './data/cc-chat.db');
  },

  /**
   * List of Discord user IDs allowed to use the bot.
   * Empty array means all users are allowed.
   */
  get allowedUsers() {
    return process.env.ALLOWED_USER_IDS?.split(',').filter(Boolean) || [];
  },

  /**
   * Claude CLI configuration.
   */
  get claude() {
    return {
      /** Path to the Claude CLI executable */
      path: process.env.CLAUDE_PATH || 'claude',
      /** Default model to use for new sessions */
      defaultModel: (process.env.DEFAULT_MODEL || 'opus') as 'sonnet' | 'opus' | 'haiku',
      /** Process timeout in milliseconds (10 minutes) */
      timeout: 10 * 60 * 1000,
    };
  },
};

/**
 * Validate required configuration values.
 * Throws an error if required values are missing.
 *
 * @throws Error if DISCORD_TOKEN or DISCORD_CLIENT_ID is not set
 */
export function validateConfig(): void {
  if (!config.discord.token) {
    throw new Error('DISCORD_TOKEN is required');
  }
  if (!config.discord.clientId) {
    throw new Error('DISCORD_CLIENT_ID is required');
  }
}
