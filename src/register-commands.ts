import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commands } from './adapters/commands.js';

async function main() {
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
