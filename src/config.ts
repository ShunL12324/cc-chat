/**
 * Configuration Module
 *
 * Loads and validates application configuration from config.yaml.
 * The config file is located in the same directory as the executable,
 * making the application portable as a standalone binary.
 *
 * Configuration priority:
 * 1. Environment variables (for sensitive values like tokens)
 * 2. config.yaml file
 * 3. Default values
 */

import { dirname, join, isAbsolute } from 'path';
import { existsSync, readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import type { AppConfig, RawConfig, DiscordConfig, ClaudeConfig, ProjectsConfig, StorageConfig, AccessConfig } from './types/config.js';

/**
 * Application directory where the executable is located.
 * Used as the base for relative path resolution.
 */
export const appDir = dirname(process.execPath);

/**
 * Default configuration values.
 */
const defaults: AppConfig = {
  discord: {
    token: '',
    clientId: '',
    guildId: '',
  },
  claude: {
    path: 'claude',
    defaultModel: 'opus',
    timeout: 15 * 60 * 1000, // 15 minutes
  },
  projects: {
    roots: [],
  },
  storage: {
    dbPath: './data/cc-chat.db',
  },
  access: {
    allowedUsers: [],
  },
};

/**
 * Loaded configuration instance.
 * Initialized by loadConfig().
 */
let loadedConfig: AppConfig | null = null;

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
 * Merge configuration section with defaults.
 */
function mergeDiscord(defaults: DiscordConfig, source: Partial<DiscordConfig> = {}): DiscordConfig {
  return {
    token: source.token ?? defaults.token,
    clientId: source.clientId ?? defaults.clientId,
    guildId: source.guildId ?? defaults.guildId,
  };
}

function mergeClaude(defaults: ClaudeConfig, source: Partial<ClaudeConfig> = {}): ClaudeConfig {
  return {
    path: source.path ?? defaults.path,
    defaultModel: source.defaultModel ?? defaults.defaultModel,
    timeout: source.timeout ?? defaults.timeout,
  };
}

function mergeProjects(defaults: ProjectsConfig, source: Partial<ProjectsConfig> = {}): ProjectsConfig {
  return {
    roots: source.roots ?? defaults.roots,
  };
}

function mergeStorage(defaults: StorageConfig, source: Partial<StorageConfig> = {}): StorageConfig {
  return {
    dbPath: source.dbPath ?? defaults.dbPath,
  };
}

function mergeAccess(defaults: AccessConfig, source: Partial<AccessConfig> = {}): AccessConfig {
  return {
    allowedUsers: source.allowedUsers ?? defaults.allowedUsers,
  };
}

/**
 * Load configuration from config.yaml in the app directory.
 * Merges with defaults and applies environment variable overrides.
 *
 * Call this function at application startup before accessing config.
 *
 * @throws Error if config.yaml cannot be parsed
 */
export function loadConfig(): void {
  const configPath = join(appDir, 'config.yaml');
  let rawConfig: RawConfig = {};

  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      rawConfig = parseYaml(content) || {};
    } catch (error) {
      throw new Error(`Failed to parse config.yaml: ${error}`);
    }
  } else {
    console.warn(`Config file not found: ${configPath}`);
    console.warn('Using default configuration. Create config.yaml to customize.');
  }

  // Merge with defaults
  const merged: AppConfig = {
    discord: mergeDiscord(defaults.discord, rawConfig.discord),
    claude: mergeClaude(defaults.claude, rawConfig.claude),
    projects: mergeProjects(defaults.projects, rawConfig.projects),
    storage: mergeStorage(defaults.storage, rawConfig.storage),
    access: mergeAccess(defaults.access, rawConfig.access),
  };

  // Environment variable overrides for sensitive values
  if (process.env.DISCORD_TOKEN) {
    merged.discord.token = process.env.DISCORD_TOKEN;
  }
  if (process.env.DISCORD_CLIENT_ID) {
    merged.discord.clientId = process.env.DISCORD_CLIENT_ID;
  }
  if (process.env.DISCORD_GUILD_ID) {
    merged.discord.guildId = process.env.DISCORD_GUILD_ID;
  }

  // Resolve relative paths
  merged.storage.dbPath = resolvePath(merged.storage.dbPath);

  loadedConfig = merged;
}

/**
 * Application configuration object.
 * Provides access to loaded configuration values.
 *
 * @throws Error if accessed before loadConfig() is called
 */
export const config = {
  /**
   * Discord bot connection settings.
   */
  get discord() {
    if (!loadedConfig) throw new Error('Config not loaded. Call loadConfig() first.');
    return loadedConfig.discord;
  },

  /**
   * Claude CLI settings.
   */
  get claude() {
    if (!loadedConfig) throw new Error('Config not loaded. Call loadConfig() first.');
    return loadedConfig.claude;
  },

  /**
   * Allowed project root directories.
   */
  get projectRoots() {
    if (!loadedConfig) throw new Error('Config not loaded. Call loadConfig() first.');
    return loadedConfig.projects.roots;
  },

  /**
   * Path to the SQLite database file.
   */
  get dbPath() {
    if (!loadedConfig) throw new Error('Config not loaded. Call loadConfig() first.');
    return loadedConfig.storage.dbPath;
  },

  /**
   * Discord user IDs allowed to use the bot.
   * Empty array means all users are allowed.
   */
  get allowedUsers() {
    if (!loadedConfig) throw new Error('Config not loaded. Call loadConfig() first.');
    return loadedConfig.access.allowedUsers;
  },
};

/**
 * Validate required configuration values.
 * Throws an error if required values are missing.
 *
 * @throws Error if discord.token or discord.clientId is not set
 */
export function validateConfig(): void {
  if (!config.discord.token) {
    throw new Error('discord.token is required in config.yaml or DISCORD_TOKEN env var');
  }
  if (!config.discord.clientId) {
    throw new Error('discord.clientId is required in config.yaml or DISCORD_CLIENT_ID env var');
  }
}
