import {
  SlashCommandBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';

export const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
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

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('View all project statuses')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop running Claude task')
    .toJSON(),

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

  new SlashCommandBuilder()
    .setName('archive')
    .setDescription('Archive this project thread')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available commands and usage')
    .toJSON(),
];
