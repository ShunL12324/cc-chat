/**
 * Configuration Schemas
 *
 * Zod schemas for the application configuration loaded from config.yaml.
 * Provides runtime validation and type inference.
 */

import { z } from 'zod/v4';
import { ModelTypeSchema } from './session.js';

export const DiscordConfigSchema = z.object({
  token: z.string(),
  clientId: z.string(),
  guildId: z.string().optional(),
});

export const ClaudeConfigSchema = z.object({
  path: z.string(),
  defaultModel: ModelTypeSchema,
  timeout: z.number().positive(),
});

export const ProjectsConfigSchema = z.object({
  roots: z.array(z.string()),
});

export const StorageConfigSchema = z.object({
  dbPath: z.string(),
});

export const AccessConfigSchema = z.object({
  allowedUsers: z.array(z.string()),
});

export const LoggingConfigSchema = z.object({
  debug: z.boolean(),
});

export const AppConfigSchema = z.object({
  discord: DiscordConfigSchema,
  claude: ClaudeConfigSchema,
  projects: ProjectsConfigSchema,
  storage: StorageConfigSchema,
  access: AccessConfigSchema,
  logging: LoggingConfigSchema,
});

/** Raw configuration as loaded from YAML (before defaults applied). */
export const RawConfigSchema = z.object({
  discord: DiscordConfigSchema.partial().optional(),
  claude: ClaudeConfigSchema.partial().optional(),
  projects: ProjectsConfigSchema.partial().optional(),
  storage: StorageConfigSchema.partial().optional(),
  access: AccessConfigSchema.partial().optional(),
  logging: LoggingConfigSchema.partial().optional(),
}).optional();

export type DiscordConfig = z.infer<typeof DiscordConfigSchema>;
export type ClaudeConfig = z.infer<typeof ClaudeConfigSchema>;
export type ProjectsConfig = z.infer<typeof ProjectsConfigSchema>;
export type StorageConfig = z.infer<typeof StorageConfigSchema>;
export type AccessConfig = z.infer<typeof AccessConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
export type RawConfig = z.infer<typeof RawConfigSchema>;
