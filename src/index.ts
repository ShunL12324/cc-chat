/**
 * Application Entry Point
 *
 * Bootstraps the cc-chat Discord bot application.
 *
 * Startup sequence:
 * 1. Load configuration from config.yaml
 * 2. Initialize file logger
 * 3. Apply pending updates (if downloaded in previous run)
 * 4. Check for new updates (non-blocking)
 * 5. Start periodic update checks
 * 6. Validate configuration
 * 7. Initialize and start Discord bot
 * 8. Set up graceful shutdown handlers
 */

import { loadConfig, validateConfig, config } from './config.js';
import { DiscordBot } from './adapters/discord-bot.js';
import { store } from './store/sqlite-store.js';
import { applyPendingUpdate, checkForUpdates, startPeriodicUpdateCheck, stopPeriodicUpdateCheck, rollbackIfCrashed, markStarting, markHealthy } from './core/auto-updater.js';
import { initLogger, flushLogger, getLogger } from './core/logger.js';

/**
 * Main application entry point.
 */
async function main() {
  // Load configuration from config.yaml
  loadConfig();

  // Initialize logger (writes to app directory)
  initLogger(config.debug);

  const log = getLogger();

  // Rollback if previous version crashed after update
  rollbackIfCrashed();

  // Apply pending update if exists
  applyPendingUpdate();

  // Mark as starting (for crash detection on next launch)
  markStarting();

  log.info('cc-chat starting...');

  // Check for updates (non-blocking)
  checkForUpdates().catch(() => {});

  // Start periodic update checks (every hour)
  startPeriodicUpdateCheck();

  // Validate configuration
  try {
    validateConfig();
  } catch (error) {
    log.error(error, 'Configuration error');
    process.exit(1);
  }

  // Initialize bot
  const bot = new DiscordBot();

  /**
   * Graceful shutdown handler.
   * Stops the bot and closes database connections.
   */
  const shutdown = async () => {
    log.info('Shutting down...');
    stopPeriodicUpdateCheck();
    await bot.stop();
    store.close();
    flushLogger();
    process.exit(0);
  };

  // Register signal handlers for graceful shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start bot
  try {
    await bot.start();
    markHealthy();
    log.info('Bot is running!');
  } catch (error) {
    log.error(error, 'Failed to start bot');
    process.exit(1);
  }
}

main();
