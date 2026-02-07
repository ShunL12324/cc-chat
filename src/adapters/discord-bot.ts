/**
 * Discord Bot Adapter
 *
 * Main Discord bot implementation that bridges Discord interactions
 * with Claude Code CLI. Handles slash commands, button interactions,
 * message routing, and session management.
 *
 * Architecture:
 * - Each Discord thread represents a project session
 * - Messages in threads are forwarded to Claude CLI
 * - Claude responses are streamed back to the thread
 */

import {
  Client,
  GatewayIntentBits,
  ChannelType,
  MessageFlags,
  type Message,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type AnyThreadChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { config } from '../config.js';
import { store } from '../store/sqlite-store.js';
import { runClaude } from '../core/claude-runner.js';
import { processManager } from '../core/process-manager.js';
import {
  formatToolHistory,
  formatAssistantMessage,
  formatResult,
  formatError,
  formatSessionInfo,
  formatStatusList,
  formatHelp,
  formatUpdateStatus,
} from './output-formatter.js';
import type { Session, ModelType, ToolUseContent, AssistantMessage, ResultMessage } from '../types/index.js';
import { readdirSync, statSync, existsSync } from 'fs';
import { basename, join, dirname } from 'path';
import { homedir } from 'os';

/**
 * Path ID mapping for Discord button custom IDs.
 *
 * Discord limits button customId to 100 characters. Full file paths
 * often exceed this limit, so we map paths to short numeric IDs.
 * Uses LRU-style cleanup when map grows too large.
 */
const pathMap = new Map<string, string>();
let pathIdCounter = 0;

const PATH_MAP_MAX_SIZE = 1000;
const PATH_MAP_CLEANUP_SIZE = 500;

/**
 * Get or create a short ID for a file path.
 * Reuses existing ID if path was previously mapped.
 */
function getPathId(fullPath: string): string {
  for (const [id, path] of pathMap.entries()) {
    if (path === fullPath) return id;
  }

  const id = (++pathIdCounter).toString(36);
  pathMap.set(id, fullPath);

  // Cleanup old entries when map grows too large
  if (pathMap.size > PATH_MAP_MAX_SIZE) {
    const entriesToDelete = Array.from(pathMap.keys()).slice(0, PATH_MAP_CLEANUP_SIZE);
    for (const key of entriesToDelete) {
      pathMap.delete(key);
    }
  }

  return id;
}

/**
 * Retrieve the original path from a short ID.
 * Returns undefined if ID has been cleaned up or never existed.
 */
function getPathFromId(id: string): string | undefined {
  return pathMap.get(id);
}

/**
 * Check if a path is a filesystem root.
 * Handles both Windows (C:\) and Unix (/) root paths.
 */
function isRootPath(path: string): boolean {
  if (/^[A-Z]:\\?$/i.test(path)) return true;
  if (path === '/') return true;
  const parent = dirname(path);
  return parent === path || parent === '.';
}

/**
 * Main Discord bot class.
 *
 * Responsibilities:
 * - Discord client lifecycle management
 * - Slash command handling
 * - Button interaction handling
 * - Message routing to Claude
 * - Session state management
 */
export class DiscordBot {
  private client: Client;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageTyping,
      ],
    });
  }

  /**
   * Start the Discord bot and register event handlers.
   */
  async start(): Promise<void> {
    this.client.once('clientReady', () => {
      console.log(`Logged in as ${this.client.user?.tag}`);
    });

    this.client.on('interactionCreate', async (interaction) => {
      try {
        if (interaction.isChatInputCommand()) {
          await this.handleCommand(interaction);
        } else if (interaction.isAutocomplete()) {
          await this.handleAutocomplete(interaction);
        } else if (interaction.isButton()) {
          await this.handleButton(interaction);
        }
      } catch (error) {
        console.error('Interaction error:', error);
      }
    });

    this.client.on('messageCreate', async (message) => {
      try {
        await this.handleMessage(message);
      } catch (error) {
        console.error('Message error:', error);
      }
    });

    await this.client.login(config.discord.token);
  }

  /**
   * Stop the bot gracefully, killing any running Claude processes.
   */
  async stop(): Promise<void> {
    await processManager.stopAll();
    this.client.destroy();
  }

  /**
   * Check if a user is authorized to use the bot.
   * Returns true if no user restrictions are configured.
   */
  private isAllowedUser(userId: string): boolean {
    if (config.allowedUsers.length === 0) return true;
    return config.allowedUsers.includes(userId);
  }

  /**
   * Route slash commands to their handlers.
   */
  private async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.isAllowedUser(interaction.user.id)) {
      await interaction.reply({ content: 'You are not authorized.', flags: MessageFlags.Ephemeral });
      return;
    }

    const { commandName } = interaction;

    switch (commandName) {
      case 'new':
        await this.handleNewCommand(interaction, false);
        break;
      case 'resume':
        await this.handleNewCommand(interaction, true);
        break;
      case 'ls':
        await this.handleLsCommand(interaction);
        break;
      case 'session':
        await this.handleSessionCommand(interaction);
        break;
      case 'status':
        await this.handleStatusCommand(interaction);
        break;
      case 'stop':
        await this.handleStopCommand(interaction);
        break;
      case 'model':
        await this.handleModelCommand(interaction);
        break;
      case 'archive':
        await this.handleArchiveCommand(interaction);
        break;
      case 'help':
        await this.handleHelpCommand(interaction);
        break;
      case 'check-update':
        await this.handleCheckUpdateCommand(interaction);
        break;
    }
  }

  /**
   * Create a new project thread for a given path.
   *
   * @param interaction - The slash command interaction
   * @param useContinue - If true, resume the last Claude conversation
   */
  private async handleNewCommand(
    interaction: ChatInputCommandInteraction,
    useContinue: boolean
  ): Promise<void> {
    const path = interaction.options.getString('path', true);

    if (!existsSync(path)) {
      await interaction.reply({ content: `Path does not exist: \`${path}\``, flags: MessageFlags.Ephemeral });
      return;
    }

    if (!statSync(path).isDirectory()) {
      await interaction.reply({ content: `Path is not a directory: \`${path}\``, flags: MessageFlags.Ephemeral });
      return;
    }

    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: 'This command must be used in a text channel.', flags: MessageFlags.Ephemeral });
      return;
    }

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: 'This command must be used in a server.', flags: MessageFlags.Ephemeral });
      return;
    }

    await this.createProjectThread(interaction, channel, path, guildId, useContinue);
  }

  /**
   * Shared logic for creating a project thread from command or button.
   */
  private async createProjectThread(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    channel: { threads: { create: (options: any) => Promise<AnyThreadChannel> }; id: string },
    path: string,
    guildId: string,
    useContinue: boolean
  ): Promise<void> {
    const projectName = basename(path);
    const thread = await channel.threads.create({
      name: projectName,
      autoArchiveDuration: 10080,
      reason: `Claude Code project: ${path}`,
    });

    const session: Session = {
      id: thread.id,
      guildId,
      channelId: channel.id,
      name: projectName,
      projectDir: path,
      useContinue,
      model: config.claude.defaultModel,
      status: 'idle',
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    store.set(session);

    const modeText = useContinue ? ' (continue mode)' : '';

    if (interaction.isButton()) {
      await interaction.update({
        content: `Created project thread: <#${thread.id}>${modeText}\nPath: \`${path}\``,
        components: [],
      });
    } else {
      await interaction.reply({
        content: `Created project thread: <#${thread.id}>${modeText}\nPath: \`${path}\``,
      });
    }

    const introText = useContinue
      ? `**${projectName}** (continue)\nPath: \`${path}\`\n\nSend a message to continue the last conversation.`
      : `**${projectName}**\nPath: \`${path}\`\n\nSend a message to start chatting with Claude.`;
    await thread.send(introText);
  }

  /**
   * Handle /ls command - browse directories with button navigation.
   */
  private async handleLsCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const pathArg = interaction.options.getString('path');
    const currentPath = pathArg || (config.projectRoots[0] || homedir());

    if (!existsSync(currentPath)) {
      await interaction.reply({ content: `Path does not exist: \`${currentPath}\``, flags: MessageFlags.Ephemeral });
      return;
    }

    await this.sendDirectoryBrowser(interaction, currentPath);
  }

  /**
   * Render directory browser with navigation buttons.
   * Shows up to 15 subdirectories with parent/refresh/create actions.
   */
  private async sendDirectoryBrowser(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    path: string
  ): Promise<void> {
    const entries = readdirSync(path, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 20);

    const entryCount = entries.length;
    const content = `\`${path}\`\n${entryCount} ${entryCount === 1 ? 'subdirectory' : 'subdirectories'}`;

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    const pathId = getPathId(path);

    // Navigation row with parent, refresh, and create buttons
    const navRow = new ActionRowBuilder<ButtonBuilder>();

    if (!isRootPath(path)) {
      const parentPath = dirname(path);
      const parentId = getPathId(parentPath);
      navRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`ls:${parentId}`)
          .setLabel('Parent')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`ls:${pathId}`)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`create:${pathId}`)
        .setLabel('New')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`resume:${pathId}`)
        .setLabel('Resume')
        .setStyle(ButtonStyle.Success)
    );

    rows.push(navRow);

    // Directory buttons - up to 3 rows of 5 buttons each
    const maxDirectoryRows = 3;
    const buttonsPerRow = 5;
    const maxDirectories = maxDirectoryRows * buttonsPerRow;

    for (let i = 0; i < entries.length && rows.length < maxDirectoryRows + 1; i += buttonsPerRow) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      const chunk = entries.slice(i, i + buttonsPerRow);
      for (const entry of chunk) {
        const fullPath = join(path, entry.name);
        const entryPathId = getPathId(fullPath);
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`ls:${entryPathId}`)
            .setLabel(entry.name.slice(0, 25))
            .setStyle(ButtonStyle.Secondary)
        );
      }
      rows.push(row);
    }

    // Show count of remaining directories if truncated
    if (entries.length > maxDirectories && rows.length < 5) {
      const remaining = entries.length - maxDirectories;
      const moreRow = new ActionRowBuilder<ButtonBuilder>();
      moreRow.addComponents(
        new ButtonBuilder()
          .setCustomId('more:disabled')
          .setLabel(`+${remaining} more`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );
      rows.push(moreRow);
    }

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content, components: rows });
    } else {
      await interaction.reply({ content, components: rows, flags: MessageFlags.Ephemeral });
    }
  }

  /**
   * Handle /session command - view or clear session info.
   */
  private async handleSessionCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    const session = this.getThreadSession(interaction);

    if (!session) {
      await interaction.reply({ content: 'This command must be used in a project thread.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === 'info') {
      await interaction.reply({ content: formatSessionInfo(session), flags: MessageFlags.Ephemeral });
    } else if (subcommand === 'clear') {
      store.clearSession(session.id);
      await interaction.reply({ content: 'Session cleared. Next message will start a new conversation.' });
    }
  }

  /**
   * Handle /status command - list all project sessions.
   */
  private async handleStatusCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: 'This command must be used in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    const sessions = store.listByGuild(guildId);
    await interaction.reply({ content: formatStatusList(sessions), flags: MessageFlags.Ephemeral });
  }

  /**
   * Handle /stop command - stop running Claude process.
   */
  private async handleStopCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const session = this.getThreadSession(interaction);

    if (!session) {
      await interaction.reply({ content: 'This command must be used in a project thread.', flags: MessageFlags.Ephemeral });
      return;
    }

    const stopped = await processManager.stop(session.id);
    if (stopped) {
      store.update(session.id, { status: 'idle' });
      await interaction.reply({ content: 'Task stopped.' });
    } else {
      await interaction.reply({ content: 'No running task to stop.', flags: MessageFlags.Ephemeral });
    }
  }

  /**
   * Handle /model command - switch Claude model.
   */
  private async handleModelCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const session = this.getThreadSession(interaction);

    if (!session) {
      await interaction.reply({ content: 'This command must be used in a project thread.', flags: MessageFlags.Ephemeral });
      return;
    }

    const model = interaction.options.getString('model', true) as ModelType;
    store.update(session.id, { model });
    await interaction.reply({ content: `Model switched to **${model}**.` });
  }

  /**
   * Handle /archive command - archive the thread.
   */
  private async handleArchiveCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const session = this.getThreadSession(interaction);
    const channel = interaction.channel;

    if (!session || !channel || !channel.isThread()) {
      await interaction.reply({ content: 'This command must be used in a project thread.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({ content: 'Archiving thread...' });
    await channel.setArchived(true);
  }

  /**
   * Handle /help command - show available commands.
   */
  private async handleHelpCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply({ content: formatHelp(), flags: MessageFlags.Ephemeral });
  }

  /**
   * Handle /check-update command - check for and display update status.
   */
  private async handleCheckUpdateCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { checkForUpdates, getUpdateStatus } = await import('../core/auto-updater.js');

    await checkForUpdates();
    const status = getUpdateStatus();
    await interaction.editReply({ content: formatUpdateStatus(status) });
  }

  /**
   * Handle autocomplete for path-based commands.
   */
  private async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const { commandName } = interaction;
    const focused = interaction.options.getFocused(true);

    if (commandName === 'new' || commandName === 'ls' || commandName === 'resume') {
      const suggestions = this.getPathSuggestions(focused.value);
      await interaction.respond(suggestions.slice(0, 25));
    }
  }

  /**
   * Generate path suggestions for autocomplete.
   * Expands ~ to home directory and lists matching subdirectories.
   */
  private getPathSuggestions(input: string): Array<{ name: string; value: string }> {
    const suggestions: Array<{ name: string; value: string }> = [];

    const expandPath = (p: string) => p.startsWith('~') ? p.replace('~', homedir()) : p;

    // Show project roots when no input
    if (!input) {
      for (const root of config.projectRoots) {
        const expanded = expandPath(root);
        if (existsSync(expanded)) {
          suggestions.push({ name: root, value: expanded });
        }
      }
      return suggestions;
    }

    const expanded = expandPath(input);
    const searchPath = existsSync(expanded) && statSync(expanded).isDirectory() ? expanded : dirname(expanded);
    const prefix = existsSync(expanded) && statSync(expanded).isDirectory() ? '' : basename(expanded);

    try {
      if (existsSync(searchPath)) {
        const entries = readdirSync(searchPath, { withFileTypes: true })
          .filter(e => e.isDirectory() && !e.name.startsWith('.'))
          .filter(e => !prefix || e.name.toLowerCase().startsWith(prefix.toLowerCase()));

        for (const entry of entries) {
          const fullPath = join(searchPath, entry.name);
          suggestions.push({ name: fullPath, value: fullPath });
        }
      }
    } catch {
      // Ignore filesystem errors
    }

    return suggestions;
  }

  /**
   * Handle button interactions for directory browser.
   */
  private async handleButton(interaction: ButtonInteraction): Promise<void> {
    if (!this.isAllowedUser(interaction.user.id)) {
      await interaction.reply({ content: 'You are not authorized.', flags: MessageFlags.Ephemeral });
      return;
    }

    const [action, pathId] = interaction.customId.split(':');

    if (action === 'more') {
      return;
    }

    const path = getPathFromId(pathId);
    if (!path) {
      await interaction.reply({ content: 'Path expired. Please use `/ls` again.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (action === 'ls') {
      await interaction.deferUpdate();
      await this.sendDirectoryBrowser(interaction, path);
    } else if (action === 'create' || action === 'resume') {
      const channel = interaction.channel;
      if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.reply({ content: 'Cannot create thread here.', flags: MessageFlags.Ephemeral });
        return;
      }

      const guildId = interaction.guildId;
      if (!guildId) {
        await interaction.reply({ content: 'This action must be used in a server.', flags: MessageFlags.Ephemeral });
        return;
      }

      await this.createProjectThread(interaction, channel, path, guildId, action === 'resume');
    }
  }

  /**
   * Get session for the current thread, if any.
   */
  private getThreadSession(interaction: ChatInputCommandInteraction | ButtonInteraction): Session | null {
    const channel = interaction.channel;
    if (!channel || !channel.isThread()) {
      return null;
    }
    return store.get(channel.id);
  }

  /**
   * Handle incoming messages in project threads.
   * Routes messages to Claude and streams responses back.
   * Uses mutex lock to prevent race conditions when multiple messages arrive.
   */
  private async handleMessage(message: Message): Promise<void> {
    if (message.author.bot) return;

    const channel = message.channel;
    if (!channel.isThread()) {
      return;
    }

    if (!this.isAllowedUser(message.author.id)) {
      return;
    }

    const session = store.get(channel.id);
    if (!session) {
      return;
    }

    // Acquire lock to prevent race conditions
    // This ensures check-then-act is atomic
    await processManager.acquireLock(session.id);

    try {
      // Queue message if Claude is already running
      if (processManager.isRunning(session.id)) {
        const queueLength = processManager.getQueueLength(session.id);
        await message.reply(`Queued (#${queueLength + 1}). Use \`/stop\` to cancel.`);
        await processManager.enqueue(session.id, message.content);
        return;
      }

      await this.executeClaudeTask(session, message.content, channel);

      // Process any queued messages
      let queued: ReturnType<typeof processManager.dequeue>;
      while ((queued = processManager.dequeue(session.id))) {
        // Re-read session from store to get latest claudeSessionId from previous run
        const freshSession = store.get(session.id) || session;
        await this.executeClaudeTask(freshSession, queued.content, channel);
        queued.resolve();
      }
    } finally {
      processManager.releaseLock(session.id);
    }
  }

  /**
   * Execute a Claude task and stream results to the channel.
   *
   * Creates a status message that updates with tool usage,
   * sends assistant text responses as new messages,
   * and shows final result with cost/duration stats.
   */
  private async executeClaudeTask(
    session: Session,
    prompt: string,
    channel: AnyThreadChannel
  ): Promise<void> {
    store.update(session.id, { status: 'running', lastActivity: Date.now() });

    let statusMessage: Awaited<ReturnType<typeof channel.send>> | null = await channel.send('Thinking...');
    let lastStatusText = '';
    let messageCount = 0;

    const toolHistory: ToolUseContent[] = [];
    const maxToolHistory = 5;
    const maxMessages = 10;

    /**
     * Update the status message with new content.
     * Creates a new message if the previous one was deleted.
     */
    const updateStatus = async (text: string) => {
      if (text === lastStatusText) return;
      lastStatusText = text;

      const content = text.length > 1900 ? text.slice(0, 1900) + '...' : text;

      try {
        if (statusMessage) {
          await statusMessage.edit(content);
        } else {
          statusMessage = await channel.send(content);
        }
      } catch {
        try {
          statusMessage = await channel.send(content);
        } catch {
          // Ignore send failures
        }
      }
    };

    /**
     * Send a new message and reset status tracking.
     */
    const sendNewMessage = async (text: string) => {
      messageCount++;
      if (messageCount > maxMessages) return;

      try {
        await channel.send(text);
        statusMessage = null;
        lastStatusText = '';
      } catch {
        // Ignore send failures
      }
    };

    try {
      const result = await runClaude(
        {
          id: session.id,
          cwd: session.projectDir,
          prompt,
          resume: session.claudeSessionId,
          continue: session.useContinue,
          model: session.model,
        },
        {
          onSystemInit: async (msg) => {
            // Switch from --continue to --resume after first message
            store.update(session.id, {
              claudeSessionId: msg.session_id,
              useContinue: false,
            });
          },
          onToolUse: async (toolUse: ToolUseContent) => {
            toolHistory.push(toolUse);
            const recentTools = toolHistory.slice(-maxToolHistory);
            await updateStatus(formatToolHistory(recentTools));
          },
          onAssistant: async (msg: AssistantMessage) => {
            const text = formatAssistantMessage(msg);
            if (text) {
              await sendNewMessage(text);
            }
          },
          onResult: async (msg: ResultMessage) => {
            if (statusMessage) {
              try {
                await statusMessage.edit(formatResult(msg));
              } catch {
                await channel.send(formatResult(msg));
              }
            } else {
              await channel.send(formatResult(msg));
            }
            store.saveMessage({
              threadId: session.id,
              sessionId: msg.session_id,
              messageType: 'result',
              content: JSON.stringify(msg),
              costUsd: msg.total_cost_usd,
              createdAt: Date.now(),
            });
          },
          onError: async (error) => {
            await sendNewMessage(formatError(error.message));
          },
        }
      );

      if (!result.success && result.error) {
        await sendNewMessage(formatError(result.error));
      }
    } finally {
      store.update(session.id, { status: 'idle', lastActivity: Date.now() });
    }
  }
}
