/**
 * Configuration Types
 *
 * Type definitions for the application configuration loaded from config.yaml.
 * Provides strong typing for all configuration sections.
 */

import type { ModelType } from './session.js';

/**
 * Discord bot connection settings.
 */
export interface DiscordConfig {
  /** Bot authentication token (required) */
  token: string;
  /** Discord application client ID (required) */
  clientId: string;
  /** Guild ID for development slash command registration (optional) */
  guildId?: string;
}

/**
 * Claude CLI execution settings.
 */
export interface ClaudeConfig {
  /** Path to the Claude CLI executable */
  path: string;
  /** Default model for new sessions */
  defaultModel: ModelType;
  /** Process timeout in milliseconds */
  timeout: number;
}

/**
 * Project directory settings.
 */
export interface ProjectsConfig {
  /** List of allowed project root directories */
  roots: string[];
}

/**
 * Data storage settings.
 */
export interface StorageConfig {
  /** Path to the SQLite database file */
  dbPath: string;
}

/**
 * Access control settings.
 */
export interface AccessConfig {
  /** Discord user IDs allowed to use the bot (empty = all users allowed) */
  allowedUsers: string[];
}

/**
 * Complete application configuration.
 */
export interface AppConfig {
  /** Discord bot settings */
  discord: DiscordConfig;
  /** Claude CLI settings */
  claude: ClaudeConfig;
  /** Project directory settings */
  projects: ProjectsConfig;
  /** Storage settings */
  storage: StorageConfig;
  /** Access control settings */
  access: AccessConfig;
}

/**
 * Raw configuration as loaded from YAML (before defaults applied).
 * All fields are optional to allow partial configuration.
 */
export interface RawConfig {
  discord?: Partial<DiscordConfig>;
  claude?: Partial<ClaudeConfig>;
  projects?: Partial<ProjectsConfig>;
  storage?: Partial<StorageConfig>;
  access?: Partial<AccessConfig>;
}
