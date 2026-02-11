/**
 * Configuration Module
 *
 * Loads and validates application configuration from config.yaml.
 * Uses zod for runtime validation of configuration values.
 *
 * Configuration priority:
 * 1. Environment variables (for sensitive values like tokens)
 * 2. config.yaml file
 * 3. Default values
 */

import { dirname, join, isAbsolute } from 'path';
import { existsSync, readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { RawConfigSchema, type AppConfig } from './types/config.js';

/**
 * Application directory where the executable is located.
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
    timeout: 15 * 60 * 1000,
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

let loadedConfig: AppConfig | null = null;

function resolvePath(path: string): string {
  if (!path) return path;
  if (isAbsolute(path)) return path;
  return join(appDir, path);
}

/**
 * Load configuration from config.yaml in the app directory.
 * Merges with defaults and applies environment variable overrides.
 * Uses zod to validate the raw YAML structure.
 */
export function loadConfig(): void {
  const configPath = join(appDir, 'config.yaml');
  let rawYaml: unknown = undefined;

  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      rawYaml = parseYaml(content);
    } catch (error) {
      throw new Error(`Failed to parse config.yaml: ${error}`);
    }
  } else {
    console.warn(`Config file not found: ${configPath}`);
    console.warn('Using default configuration. Create config.yaml to customize.');
  }

  // Validate raw config structure with zod
  const parsed = RawConfigSchema.safeParse(rawYaml);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid config.yaml:\n${issues}`);
  }

  const raw = parsed.data;

  // Merge with defaults
  const merged: AppConfig = {
    discord: {
      token: raw?.discord?.token ?? defaults.discord.token,
      clientId: raw?.discord?.clientId ?? defaults.discord.clientId,
      guildId: raw?.discord?.guildId ?? defaults.discord.guildId,
    },
    claude: {
      path: raw?.claude?.path ?? defaults.claude.path,
      defaultModel: raw?.claude?.defaultModel ?? defaults.claude.defaultModel,
      timeout: raw?.claude?.timeout ?? defaults.claude.timeout,
    },
    projects: {
      roots: raw?.projects?.roots ?? defaults.projects.roots,
    },
    storage: {
      dbPath: raw?.storage?.dbPath ?? defaults.storage.dbPath,
    },
    access: {
      allowedUsers: raw?.access?.allowedUsers ?? defaults.access.allowedUsers,
    },
  };

  // Environment variable overrides
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

export const config = {
  get discord() {
    if (!loadedConfig) throw new Error('Config not loaded. Call loadConfig() first.');
    return loadedConfig.discord;
  },
  get claude() {
    if (!loadedConfig) throw new Error('Config not loaded. Call loadConfig() first.');
    return loadedConfig.claude;
  },
  get projectRoots() {
    if (!loadedConfig) throw new Error('Config not loaded. Call loadConfig() first.');
    return loadedConfig.projects.roots;
  },
  get dbPath() {
    if (!loadedConfig) throw new Error('Config not loaded. Call loadConfig() first.');
    return loadedConfig.storage.dbPath;
  },
  get allowedUsers() {
    if (!loadedConfig) throw new Error('Config not loaded. Call loadConfig() first.');
    return loadedConfig.access.allowedUsers;
  },
};

/**
 * Validate required configuration values.
 */
export function validateConfig(): void {
  if (!config.discord.token) {
    throw new Error('discord.token is required in config.yaml or DISCORD_TOKEN env var');
  }
  if (!config.discord.clientId) {
    throw new Error('discord.clientId is required in config.yaml or DISCORD_CLIENT_ID env var');
  }
}
