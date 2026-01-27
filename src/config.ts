const env = process.env;

export const config = {
  discord: {
    token: env.DISCORD_TOKEN || '',
    clientId: env.DISCORD_CLIENT_ID || '',
    guildId: env.DISCORD_GUILD_ID || '',
  },
  // Support both , and ; as separators (Windows uses ; in PATH)
  projectRoots: (env.PROJECT_ROOTS || '')
    .split(/[,;]/)
    .map(p => p.trim())
    .filter(Boolean),
  dbPath: env.DB_PATH || './data/cc-chat.db',
  allowedUsers: env.ALLOWED_USER_IDS?.split(',').filter(Boolean) || [],
  claude: {
    defaultModel: (env.DEFAULT_MODEL || 'opus') as 'sonnet' | 'opus' | 'haiku',
    timeout: 10 * 60 * 1000, // 10 minutes
  },
};

export function validateConfig(): void {
  if (!config.discord.token) {
    throw new Error('DISCORD_TOKEN is required');
  }
  if (!config.discord.clientId) {
    throw new Error('DISCORD_CLIENT_ID is required');
  }
}
