/**
 * Discord Slash Commands
 *
 * Defines all slash commands available in the Discord bot.
 * These command definitions are registered with Discord via the
 * register-commands.ts script.
 *
 * Commands:
 * - /new <path>: Create a new project thread
 * - /resume <path>: Resume last conversation in a project
 * - /ls [path]: Browse directories with button navigation
 * - /session info|clear: View or clear Claude session
 * - /status: View all project statuses
 * - /stop: Stop running Claude task
 * - /model <model>: Switch Claude model
 * - /archive: Archive the current thread
 * - /help: Show available commands
 * - /check-update: Check for available updates
 */

import {
  SlashCommandBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';

/**
 * Array of slash command definitions in Discord API format.
 * Used by register-commands.ts to register with Discord.
 */
export const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
  // Create a new project thread bound to a directory
  new SlashCommandBuilder()
    .setName('new')
    .setDescription('Create a new project thread')
    .addStringOption(option =>
      option
        .setName('path')
        .setDescription('Project directory path')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .toJSON(),

  // Create project thread with --continue flag to resume last conversation
  new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Create project thread and continue last conversation')
    .addStringOption(option =>
      option
        .setName('path')
        .setDescription('Project directory path')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .toJSON(),

  // Browse directories with interactive button navigation
  new SlashCommandBuilder()
    .setName('ls')
    .setDescription('Browse directories')
    .addStringOption(option =>
      option
        .setName('path')
        .setDescription('Directory path to browse')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .toJSON(),

  // Session management subcommands
  new SlashCommandBuilder()
    .setName('session')
    .setDescription('Manage Claude session')
    .addSubcommand(subcommand =>
      subcommand
        .setName('info')
        .setDescription('View current session info')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('clear')
        .setDescription('Clear current session to start fresh')
    )
    .toJSON(),

  // View status of all project threads in the guild
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('View all project statuses')
    .toJSON(),

  // Stop a running Claude task
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop running Claude task')
    .toJSON(),

  // Switch the Claude model for the current thread
  new SlashCommandBuilder()
    .setName('model')
    .setDescription('Switch Claude model')
    .addStringOption(option =>
      option
        .setName('model')
        .setDescription('Model to use')
        .setRequired(true)
        .addChoices(
          { name: 'Sonnet (default)', value: 'sonnet' },
          { name: 'Opus (most capable)', value: 'opus' },
          { name: 'Haiku (fastest)', value: 'haiku' }
        )
    )
    .toJSON(),

  // Archive the current project thread
  new SlashCommandBuilder()
    .setName('archive')
    .setDescription('Archive this project thread')
    .toJSON(),

  // Show help information
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available commands and usage')
    .toJSON(),

  // Check for and display update status
  new SlashCommandBuilder()
    .setName('check-update')
    .setDescription('Check for updates')
    .toJSON(),
];
