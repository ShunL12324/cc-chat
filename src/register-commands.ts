/**
 * Command Registration Script
 *
 * Registers Discord slash commands with the Discord API.
 * Run this script whenever command definitions change.
 *
 * Registration modes:
 * - Guild-specific (with DISCORD_GUILD_ID): Instant, for development
 * - Global (without DISCORD_GUILD_ID): Takes up to 1 hour to propagate
 *
 * Usage:
 *   bun run src/register-commands.ts
 *
 * Required environment variables:
 * - DISCORD_TOKEN: Bot authentication token
 * - DISCORD_CLIENT_ID: Application client ID
 * - DISCORD_GUILD_ID: (Optional) Guild ID for dev registration
 */

import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commands } from './adapters/commands.js';

/**
 * Register slash commands with Discord API.
 */
async function main() {
  // Validate required configuration
  if (!config.discord.token) {
    console.error('DISCORD_TOKEN is required');
    process.exit(1);
  }

  if (!config.discord.clientId) {
    console.error('DISCORD_CLIENT_ID is required');
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
