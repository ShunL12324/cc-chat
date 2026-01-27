import {
  Client,
  GatewayIntentBits,
  ChannelType,
  type Message,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  type ButtonInteraction,
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
  formatResultEmbed,
  formatError,
  formatSessionInfo,
  formatStatusList,
  formatHelp,
} from './output-formatter.js';
import type { Session, ModelType, ToolUseContent, AssistantMessage, ResultMessage } from '../types/index.js';
import { readdirSync, statSync, existsSync } from 'fs';
import { basename, join, dirname } from 'path';
import { homedir } from 'os';

// Path mapping for long paths (Discord button customId limit is 100 chars)
const pathMap = new Map<string, string>();
let pathIdCounter = 0;

function getPathId(fullPath: string): string {
  for (const [id, path] of pathMap.entries()) {
    if (path === fullPath) return id;
  }

  const id = (++pathIdCounter).toString(36);
  pathMap.set(id, fullPath);

  if (pathMap.size > 1000) {
    const entriesToDelete = Array.from(pathMap.keys()).slice(0, 500);
    for (const key of entriesToDelete) {
      pathMap.delete(key);
    }
  }

  return id;
}

function getPathFromId(id: string): string | undefined {
  return pathMap.get(id);
}

function isRootPath(path: string): boolean {
  if (/^[A-Z]:\\?$/i.test(path)) return true;
  if (path === '/') return true;
  const parent = dirname(path);
  if (parent === path || parent === '.') return true;
  return false;
}

export class DiscordBot {
  private client: Client;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
  }

  async start(): Promise<void> {
    this.client.on('ready', () => {
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

  async stop(): Promise<void> {
    await processManager.stopAll();
    this.client.destroy();
  }

  private isAllowedUser(userId: string): boolean {
    if (config.allowedUsers.length === 0) return true;
    return config.allowedUsers.includes(userId);
  }

  private async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.isAllowedUser(interaction.user.id)) {
      await interaction.reply({ content: '❌ You are not authorized.', ephemeral: true });
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
    }
  }

  private async handleNewCommand(interaction: ChatInputCommandInteraction, useContinue: boolean): Promise<void> {
    const path = interaction.options.getString('path', true);

    if (!existsSync(path)) {
      await interaction.reply({ content: `❌ Path does not exist: \`${path}\``, ephemeral: true });
      return;
    }

    if (!statSync(path).isDirectory()) {
      await interaction.reply({ content: `❌ Path is not a directory: \`${path}\``, ephemeral: true });
      return;
    }

    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: '❌ This command must be used in a text channel.', ephemeral: true });
      return;
    }

    const projectName = basename(path);
    const thread = await channel.threads.create({
      name: projectName,
      autoArchiveDuration: 10080,
      reason: `Claude Code project: ${path}`,
    });

    const session: Session = {
      id: thread.id,
      guildId: interaction.guildId!,
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
    await interaction.reply({
      content: `✅ Created project thread: <#${thread.id}>${modeText}\n📁 \`${path}\``,
    });

    const introText = useContinue
      ? `🔄 **${projectName}** (continue)\n📁 \`${path}\`\n\nSend a message to continue the last conversation.`
      : `🚀 **${projectName}**\n📁 \`${path}\`\n\nSend a message to start chatting with Claude.`;
    await thread.send(introText);
  }

  private async handleLsCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const pathArg = interaction.options.getString('path');
    const currentPath = pathArg || (config.projectRoots[0] || homedir());

    if (!existsSync(currentPath)) {
      await interaction.reply({ content: `❌ Path does not exist: \`${currentPath}\``, ephemeral: true });
      return;
    }

    await this.sendDirectoryBrowser(interaction, currentPath);
  }

  private async sendDirectoryBrowser(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    path: string
  ): Promise<void> {
    const entries = readdirSync(path, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 20);

    const entryCount = entries.length;
    const content = `📂 \`${path}\`\n${entryCount} ${entryCount === 1 ? 'subdirectory' : 'subdirectories'}`;

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    // Navigation row
    const navRow = new ActionRowBuilder<ButtonBuilder>();

    if (!isRootPath(path)) {
      const parentPath = dirname(path);
      const parentId = getPathId(parentPath);
      navRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`ls:${parentId}`)
          .setLabel('⬆️ Parent')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    const refreshId = getPathId(path);
    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`ls:${refreshId}`)
        .setLabel('🔄 Refresh')
        .setStyle(ButtonStyle.Secondary)
    );

    const createId = getPathId(path);
    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`create:${createId}`)
        .setLabel('📌 New')
        .setStyle(ButtonStyle.Primary)
    );

    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`resume:${createId}`)
        .setLabel('🔄 Resume')
        .setStyle(ButtonStyle.Success)
    );

    rows.push(navRow);

    // Directory buttons (up to 3 rows of 5 = 15 directories)
    for (let i = 0; i < entries.length && rows.length < 4; i += 5) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      const chunk = entries.slice(i, i + 5);
      for (const entry of chunk) {
        const fullPath = join(path, entry.name);
        const pathId = getPathId(fullPath);
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`ls:${pathId}`)
            .setLabel(entry.name.slice(0, 25))
            .setStyle(ButtonStyle.Secondary)
        );
      }
      rows.push(row);
    }

    // Show "+N more" in a new row if there are more entries and we have room
    if (entries.length > 15 && rows.length < 5) {
      const remaining = entries.length - 15;
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
      await interaction.reply({ content, components: rows, ephemeral: true });
    }
  }

  private async handleSessionCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    const session = this.getThreadSession(interaction);

    if (!session) {
      await interaction.reply({ content: '❌ This command must be used in a project thread.', ephemeral: true });
      return;
    }

    if (subcommand === 'info') {
      await interaction.reply({ content: formatSessionInfo(session), ephemeral: true });
    } else if (subcommand === 'clear') {
      store.clearSession(session.id);
      await interaction.reply({ content: '✅ Session cleared. Next message will start a new conversation.' });
    }
  }

  private async handleStatusCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const sessions = store.listByGuild(interaction.guildId!);
    await interaction.reply({ content: formatStatusList(sessions), ephemeral: true });
  }

  private async handleStopCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const session = this.getThreadSession(interaction);

    if (!session) {
      await interaction.reply({ content: '❌ This command must be used in a project thread.', ephemeral: true });
      return;
    }

    const stopped = await processManager.stop(session.id);
    if (stopped) {
      store.update(session.id, { status: 'idle' });
      await interaction.reply({ content: '⏹️ Task stopped.' });
    } else {
      await interaction.reply({ content: '❌ No running task to stop.', ephemeral: true });
    }
  }

  private async handleModelCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const session = this.getThreadSession(interaction);

    if (!session) {
      await interaction.reply({ content: '❌ This command must be used in a project thread.', ephemeral: true });
      return;
    }

    const model = interaction.options.getString('model', true) as ModelType;
    store.update(session.id, { model });
    await interaction.reply({ content: `✅ Model switched to **${model}**.` });
  }

  private async handleArchiveCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const session = this.getThreadSession(interaction);
    const channel = interaction.channel;

    if (!session || !channel || !channel.isThread()) {
      await interaction.reply({ content: '❌ This command must be used in a project thread.', ephemeral: true });
      return;
    }

    await interaction.reply({ content: '📦 Archiving thread...' });
    await channel.setArchived(true);
  }

  private async handleHelpCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply({ content: formatHelp(), ephemeral: true });
  }

  private async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const { commandName } = interaction;
    const focused = interaction.options.getFocused(true);

    if (commandName === 'new' || commandName === 'ls' || commandName === 'resume') {
      const suggestions = this.getPathSuggestions(focused.value);
      await interaction.respond(suggestions.slice(0, 25));
    }
  }

  private getPathSuggestions(input: string): Array<{ name: string; value: string }> {
    const suggestions: Array<{ name: string; value: string }> = [];

    // Expand ~ to home directory
    const expandPath = (p: string) => p.startsWith('~') ? p.replace('~', homedir()) : p;

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
      // Ignore errors
    }

    return suggestions;
  }

  private async handleButton(interaction: ButtonInteraction): Promise<void> {
    if (!this.isAllowedUser(interaction.user.id)) {
      await interaction.reply({ content: '❌ You are not authorized.', ephemeral: true });
      return;
    }

    const [action, pathId] = interaction.customId.split(':');

    if (action === 'more') {
      return;
    }

    const path = getPathFromId(pathId);
    if (!path) {
      await interaction.reply({ content: '❌ Path expired. Please use `/ls` again.', ephemeral: true });
      return;
    }

    if (action === 'ls') {
      await interaction.deferUpdate();
      await this.sendDirectoryBrowser(interaction, path);
    } else if (action === 'create') {
      await this.createProjectFromButton(interaction, path, false);
    } else if (action === 'resume') {
      await this.createProjectFromButton(interaction, path, true);
    }
  }

  private async createProjectFromButton(interaction: ButtonInteraction, path: string, useContinue: boolean): Promise<void> {
    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: '❌ Cannot create thread here.', ephemeral: true });
      return;
    }

    const projectName = basename(path);
    const thread = await channel.threads.create({
      name: projectName,
      autoArchiveDuration: 10080,
      reason: `Claude Code project: ${path}`,
    });

    const session: Session = {
      id: thread.id,
      guildId: interaction.guildId!,
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
    await interaction.update({
      content: `✅ Created project thread: <#${thread.id}>${modeText}\n📁 \`${path}\``,
      components: [],
    });

    const introText = useContinue
      ? `🔄 **${projectName}** (continue)\n📁 \`${path}\`\n\nSend a message to continue the last conversation.`
      : `🚀 **${projectName}**\n📁 \`${path}\`\n\nSend a message to start chatting with Claude.`;
    await thread.send(introText);
  }

  private getThreadSession(interaction: ChatInputCommandInteraction | ButtonInteraction): Session | null {
    const channel = interaction.channel;
    if (!channel || !channel.isThread()) {
      return null;
    }
    return store.get(channel.id);
  }

  private async handleMessage(message: Message): Promise<void> {
    if (message.author.bot) return;

    const channel = message.channel;
    if (!channel.isThread()) return;

    if (!this.isAllowedUser(message.author.id)) return;

    const session = store.get(channel.id);
    if (!session) return;

    if (processManager.isRunning(session.id)) {
      await message.reply('⏳ A task is already running. Use `/stop` to cancel it.');
      return;
    }

    store.update(session.id, { status: 'running', lastActivity: Date.now() });

    let statusMessage: Awaited<ReturnType<typeof channel.send>> | null = await channel.send('⏳ Thinking...');
    let lastStatusText = '';
    let messageCount = 0;

    const toolHistory: ToolUseContent[] = [];
    const MAX_TOOL_HISTORY = 5;

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
        // Message might have been deleted, create a new one
        try {
          statusMessage = await channel.send(content);
        } catch {
          // Ignore
        }
      }
    };

    const sendNewMessage = async (text: string) => {
      messageCount++;
      if (messageCount > 10) return;

      try {
        await channel.send(text);
        // After sending text, reset status so next tool calls appear below
        statusMessage = null;
        lastStatusText = '';
      } catch {
        // Ignore
      }
    };

    try {
      const result = await runClaude(
        {
          id: session.id,
          cwd: session.projectDir,
          prompt: message.content,
          resume: session.claudeSessionId,
          continue: session.useContinue,
          model: session.model,
        },
        {
          onSystemInit: async (msg) => {
            // After first message, switch from --continue to --resume
            store.update(session.id, {
              claudeSessionId: msg.session_id,
              useContinue: false,
            });
          },
          onToolUse: async (toolUse: ToolUseContent) => {
            toolHistory.push(toolUse);
            const recentTools = toolHistory.slice(-MAX_TOOL_HISTORY);
            await updateStatus(formatToolHistory(recentTools));
          },
          onAssistant: async (msg: AssistantMessage) => {
            const text = formatAssistantMessage(msg);
            if (text) {
              await sendNewMessage(text);
            }
          },
          onResult: async (msg: ResultMessage) => {
            // Update status message with result, or send new if none
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
              costUsd: msg.cost_usd,
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
