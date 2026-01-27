# cc-chat

Discord Bot that bridges Claude Code to your mobile device.

Chat with Claude Code from your phone by sending messages in Discord.

## Features

- Create project threads linked to local directories
- Chat with Claude Code via Discord messages
- Resume previous conversations with `--continue`
- Switch between models (Sonnet/Opus/Haiku)
- Browse directories with interactive buttons

## Requirements

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- Discord Bot token
- [Bun](https://bun.sh) runtime (for development)

## Quick Start

1. **Download** the latest release for your platform from [Releases](../../releases)

2. **Create Discord Bot**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create New Application → Bot → Copy Token
   - Enable: Message Content Intent
   - OAuth2 → URL Generator → Select `bot` + `applications.commands`
   - Invite bot to your server

3. **Configure**
   ```bash
   # Create .env file
   cp .env.example .env
   # Edit with your values
   ```

4. **Register Commands**
   ```bash
   bun run register
   ```

5. **Run**
   ```bash
   ./cc-chat          # Binary
   # or
   bun run start      # From source
   ```

## Commands

| Command | Description |
|---------|-------------|
| `/new <path>` | Create new project thread |
| `/resume <path>` | Continue last conversation |
| `/ls [path]` | Browse directories |
| `/session info` | View session info |
| `/session clear` | Clear session |
| `/model <model>` | Switch model |
| `/stop` | Stop running task |
| `/status` | View all projects |
| `/archive` | Archive thread |
| `/help` | Show help |

## Development

```bash
# Install
bun install

# Dev mode (watch)
bun run dev

# Build binaries
bun run build
```

## License

MIT
