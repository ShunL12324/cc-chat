import { config, validateConfig } from './config.js';
import { DiscordBot } from './adapters/discord-bot.js';
import { store } from './store/sqlite-store.js';
import { processManager } from './core/process-manager.js';

async function main() {
  console.log('cc-chat starting...');

  // Validate configuration
  try {
    validateConfig();
  } catch (error) {
    console.error('Configuration error:', error);
    process.exit(1);
  }

  // Initialize bot
  const bot = new DiscordBot();

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');
    await bot.stop();
    store.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start bot
  try {
    await bot.start();
    console.log('Bot is running!');
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

main();
