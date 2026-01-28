/**
 * Command Registration Script
 *
 * Registers Discord slash commands with the Discord API.
 * Run this script whenever command definitions change.
 *
 * Registration modes:
 * - Guild-specific (with discord.guildId): Instant, for development
 * - Global (without discord.guildId): Takes up to 1 hour to propagate
 *
 * Usage:
 *   bun run src/register-commands.ts
 *
 * Required config.yaml settings:
 * - discord.token: Bot authentication token
 * - discord.clientId: Application client ID
 * - discord.guildId: (Optional) Guild ID for dev registration
 */

import { REST, Routes } from 'discord.js';
import { loadConfig, config } from './config.js';
import { commands } from './adapters/commands.js';

/**
 * Register slash commands with Discord API.
 */
async function main() {
  // Load configuration
  loadConfig();

  // Validate required configuration
  if (!config.discord.token) {
    console.error('discord.token is required in config.yaml');
    process.exit(1);
  }

  if (!config.discord.clientId) {
    console.error('discord.clientId is required in config.yaml');
    process.exit(1);
  }

  const rest = new REST().setToken(config.discord.token);

  try {
    console.log(`Registering ${commands.length} commands...`);

    if (config.discord.guildId) {
      // Guild-specific registration (instant, for development)
      await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
        { body: commands }
      );
      console.log(`Commands registered to guild ${config.discord.guildId}`);
    } else {
      // Global registration (takes up to 1 hour to propagate)
      await rest.put(
        Routes.applicationCommands(config.discord.clientId),
        { body: commands }
      );
      console.log('Commands registered globally (may take up to 1 hour to propagate)');
    }

    console.log('Done!');
  } catch (error) {
    console.error('Failed to register commands:', error);
    process.exit(1);
  }
}

main();
