/**
 * Output Formatter
 *
 * Formats Claude CLI output for Discord display. Handles tool usage,
 * assistant messages, results, errors, and various status displays.
 *
 * Discord message limits:
 * - 2000 characters per message
 * - Markdown formatting supported
 * - Code blocks with syntax highlighting
 */

import { EmbedBuilder } from 'discord.js';
import type { ToolUseContent, AssistantMessage, ResultMessage } from '../types/index.js';

/**
 * Icon mapping for tool visualization.
 * Maps tool names to emoji icons for quick visual identification.
 */
const TOOL_ICONS: Record<string, string> = {
  // File operations
  Read: '📖',
  Write: '✏️',
  Edit: '✏️',
  NotebookEdit: '📓',

  // Search operations
  Glob: '🔍',
  Grep: '🔍',

  // Execution
  Bash: '💻',

  // Agent operations
  Task: '🤖',
  TaskOutput: '🤖',
  TaskCreate: '🤖',
  TaskUpdate: '🤖',
  TaskList: '🤖',
  TaskGet: '🤖',
  TaskStop: '🤖',

  // Web operations
  WebFetch: '🌐',
  WebSearch: '🌐',

  // Browser operations (Playwright)
  'mcp__playwright__': '🌐',

  // User interaction
  AskUserQuestion: '❓',
  EnterPlanMode: '📋',
  ExitPlanMode: '📋',

  // MCP tools (generic)
  'mcp__': '🔌',

  // Default
  default: '🔧',
};

/** Maximum length for Discord messages to stay under 2000 char limit */
const MAX_MESSAGE_LENGTH = 1900;

/**
 * Get the icon for a tool by name.
 * Supports prefix matching for MCP tools.
 */
function getToolIcon(toolName: string): string {
  if (TOOL_ICONS[toolName]) {
    return TOOL_ICONS[toolName];
  }

  for (const prefix of Object.keys(TOOL_ICONS)) {
    if (prefix.endsWith('__') && toolName.startsWith(prefix)) {
      return TOOL_ICONS[prefix];
    }
  }

  return TOOL_ICONS.default;
}

/**
 * Format a single tool use for detailed display.
 */
export function formatToolUse(toolUse: ToolUseContent): string {
  const icon = getToolIcon(toolUse.name);
  const input = formatToolInput(toolUse.name, toolUse.input);
  return `${icon} **${toolUse.name}**\n${input}`;
}

/**
 * Format tool history as a compact list.
 * Shows checkmarks for completed tools, arrow for current.
 */
export function formatToolHistory(tools: ToolUseContent[]): string {
  if (tools.length === 0) return '⏳ Thinking...';

  const lines = tools.map((tool, index) => {
    const icon = getToolIcon(tool.name);
    const shortName = tool.name.replace(/^mcp__\w+__/, '');
    const detail = formatToolInputShort(tool.name, tool.input);
    const prefix = index === tools.length - 1 ? '▶' : '✓';
    return `${prefix} ${icon} **${shortName}** ${detail}`;
  });

  return lines.join('\n');
}

/**
 * Format tool input as a short summary for history display.
 */
function formatToolInputShort(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'NotebookEdit': {
      const filePath = String(input.file_path || input.notebook_path || '');
      return `\`${shortenPath(filePath)}\``;
    }
    case 'Bash': {
      const command = String(input.command || '');
      return `\`${truncate(command.split('\n')[0], 40)}\``;
    }
    case 'Glob':
    case 'Grep':
      return `\`${input.pattern}\``;
    case 'Task':
      return String(input.description || '').slice(0, 30);
    case 'WebFetch':
      return `\`${shortenUrl(String(input.url || ''))}\``;
    case 'WebSearch':
      return `"${truncate(String(input.query || ''), 30)}"`;
    default:
      // For MCP tools, show first parameter value
      if (name.startsWith('mcp__')) {
        const keys = Object.keys(input);
        if (keys.length > 0) {
          const value = String(input[keys[0]] || '');
          return truncate(value, 30);
        }
      }
      return '';
  }
}

/**
 * Format tool input for detailed display.
 */
function formatToolInput(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'Read':
    case 'Write':
    case 'Edit':
      return `\`${input.file_path}\``;
    case 'NotebookEdit':
      return `\`${input.notebook_path}\``;
    case 'Bash': {
      const command = String(input.command || '');
      return `\`\`\`bash\n${truncate(command, 200)}\n\`\`\``;
    }
    case 'Glob':
      return `Pattern: \`${input.pattern}\``;
    case 'Grep': {
      const pathInfo = input.path ? ` in \`${input.path}\`` : '';
      return `Search: \`${input.pattern}\`${pathInfo}`;
    }
    case 'Task':
      return `${input.description || 'Running task...'}`;
    case 'WebFetch':
      return `\`${input.url}\``;
    case 'WebSearch':
      return `"${input.query}"`;
    default: {
      const json = JSON.stringify(input, null, 2);
      return `\`\`\`json\n${truncate(json, 300)}\n\`\`\``;
    }
  }
}

/**
 * Extract and format text content from an assistant message.
 */
export function formatAssistantMessage(msg: AssistantMessage): string {
  const textContent = msg.message.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map(c => c.text)
    .join('\n');

  return truncate(textContent, MAX_MESSAGE_LENGTH);
}

/**
 * Format a result message as a short status line.
 */
export function formatResult(msg: ResultMessage): string {
  const icon = msg.subtype === 'success' ? '✅' :
               msg.subtype === 'error' ? '❌' :
               msg.subtype === 'interrupted' ? '⏹️' : '⚠️';

  const stats: string[] = [];
  if (msg.duration_ms !== undefined) {
    stats.push(`${(msg.duration_ms / 1000).toFixed(1)}s`);
  }
  if (msg.cost_usd !== undefined) {
    stats.push(`$${msg.cost_usd.toFixed(4)}`);
  }

  return stats.length > 0 ? `${icon} ${stats.join(' · ')}` : icon;
}

/**
 * Format a result message as a rich embed.
 * Includes color coding, stats fields, and error details.
 */
export function formatResultEmbed(msg: ResultMessage): EmbedBuilder {
  const embed = new EmbedBuilder();

  if (msg.subtype === 'success') {
    embed.setColor(0x57F287);
    embed.setTitle('✅ Complete');
  } else if (msg.subtype === 'error') {
    embed.setColor(0xED4245);
    embed.setTitle('❌ Error');
    if (msg.result) {
      embed.setDescription(truncate(msg.result, 400));
    }
  } else if (msg.subtype === 'interrupted') {
    embed.setColor(0xFEE75C);
    embed.setTitle('⏹️ Interrupted');
  } else {
    embed.setColor(0xFEE75C);
    embed.setTitle('⚠️ Stopped (max turns)');
  }

  const fields: { name: string; value: string; inline: boolean }[] = [];

  if (msg.cost_usd !== undefined) {
    fields.push({ name: '💰 Cost', value: `$${msg.cost_usd.toFixed(4)}`, inline: true });
  }

  if (msg.duration_ms !== undefined) {
    const seconds = (msg.duration_ms / 1000).toFixed(1);
    fields.push({ name: '⏱️ Duration', value: `${seconds}s`, inline: true });
  }

  if (msg.num_turns !== undefined) {
    fields.push({ name: '🔄 Turns', value: String(msg.num_turns), inline: true });
  }

  if (fields.length > 0) {
    embed.addFields(fields);
  }

  return embed;
}

/**
 * Format an error message for display.
 */
export function formatError(error: string): string {
  return `❌ **Error**\n\`\`\`\n${truncate(error, 500)}\n\`\`\``;
}

/**
 * Format session info for display.
 */
export function formatSessionInfo(
  session: { claudeSessionId?: string; model: string; status: string; projectDir: string }
): string {
  const lines = [
    `📁 **Project:** \`${session.projectDir}\``,
    `🤖 **Model:** ${session.model}`,
    `📊 **Status:** ${session.status}`,
  ];

  if (session.claudeSessionId) {
    lines.push(`🔗 **Session:** \`${session.claudeSessionId.slice(0, 8)}...\``);
  } else {
    lines.push(`🔗 **Session:** None (new conversation)`);
  }

  return lines.join('\n');
}

/**
 * Format a list of sessions for status display.
 */
export function formatStatusList(
  sessions: Array<{ id: string; name: string; status: string; model: string; lastActivity: number }>
): string {
  if (sessions.length === 0) {
    return 'No active projects. Use `/new` to create one.';
  }

  const lines = sessions.map(s => {
    const statusIcon = s.status === 'running' ? '🟢' : s.status === 'error' ? '🔴' : '⚪';
    const ago = formatTimeAgo(s.lastActivity);
    return `${statusIcon} **${s.name}** (<#${s.id}>) - ${s.model} - ${ago}`;
  });

  return lines.join('\n');
}

/**
 * Format help text with available commands.
 */
export function formatHelp(): string {
  return `**Claude Code Discord Bot**

📁 **Project**
\`/new <path>\` - New project thread
\`/resume <path>\` - Continue last conversation
\`/ls [path]\` - Browse directories
\`/archive\` - Archive thread

🤖 **Claude**
\`/session info\` - Session info
\`/session clear\` - Clear session
\`/model <model>\` - Switch model
\`/stop\` - Stop task

📊 **Status**
\`/status\` - All projects
\`/check-update\` - Check for updates`;
}

/**
 * Format update status for display.
 */
export function formatUpdateStatus(status: {
  currentVersion: string;
  pendingVersion: string | null;
  hasPendingUpdate: boolean;
}): string {
  const lines: string[] = ['**Update Status**', ''];

  lines.push(`📦 Current version: \`${status.currentVersion}\``);

  if (status.hasPendingUpdate && status.pendingVersion) {
    lines.push(`✅ Update \`${status.pendingVersion}\` downloaded`);
    lines.push('');
    lines.push('*Restart the service to apply the update*');
  } else {
    lines.push('✅ You are on the latest version');
  }

  return lines.join('\n');
}

/**
 * Truncate text to a maximum length with ellipsis.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Shorten a file path to show only the last 2 components.
 */
function shortenPath(path: string): string {
  const parts = path.split(/[/\\]/);
  if (parts.length <= 3) return path;
  return `.../${parts.slice(-2).join('/')}`;
}

/**
 * Shorten a URL to hostname and truncated path.
 */
function shortenUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const pathPart = parsed.pathname.length > 20
      ? parsed.pathname.slice(0, 17) + '...'
      : parsed.pathname;
    return parsed.hostname + pathPart;
  } catch {
    return truncate(url, 40);
  }
}

/**
 * Format a timestamp as relative time (e.g., "5m ago").
 */
function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}
