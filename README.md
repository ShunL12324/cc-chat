# cc-chat

[![Release](https://img.shields.io/github/v/release/ShunL12324/cc-chat)](https://github.com/ShunL12324/cc-chat/releases)
[![Build](https://img.shields.io/github/actions/workflow/status/ShunL12324/cc-chat/release.yml)](https://github.com/ShunL12324/cc-chat/actions)
[![License](https://img.shields.io/github/license/ShunL12324/cc-chat)](LICENSE)

Discord bot that bridges Claude Code CLI to mobile devices. Control your local Claude Code sessions from your phone via Discord.

## Features

- **Project Threads** - Each Discord thread maps to a local project directory
- **Session Management** - Resume conversations with `--continue` or start fresh
- **Model Switching** - Switch between Sonnet, Opus, and Haiku on the fly
- **Directory Browser** - Interactive button-based file browser
- **Auto Updates** - Checks for updates on startup
- **Cross Platform** - Windows, macOS, and Linux binaries

## Requirements

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- Discord Bot token with Message Content Intent enabled
- [Bun](https://bun.sh) runtime (development only)

## Installation

### Download Binary

Download the latest release for your platform from [Releases](https://github.com/ShunL12324/cc-chat/releases):

| Platform | Binary |
|----------|--------|
| Windows | `cc-chat-win.exe` |
| macOS (Apple Silicon) | `cc-chat-mac-arm64` |
| macOS (Intel) | `cc-chat-mac-x64` |
| Linux | `cc-chat-linux` |

### Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create New Application
3. Navigate to Bot settings:
   - Copy the Bot Token
   - Enable **Message Content Intent** under Privileged Gateway Intents
4. Navigate to OAuth2 > URL Generator:
   - Select scopes: `bot`, `applications.commands`
   - Select permissions: `Send Messages`, `Create Public Threads`, `Send Messages in Threads`, `Manage Threads`, `Read Message History`
5. Use generated URL to invite bot to your server

### Configuration

Create a `.env` file in the same directory as the binary:

```env
# Required
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_GUILD_ID=your_guild_id

# Project directories (comma or semicolon separated)
PROJECT_ROOTS=C:\Users\YourName\projects

# Optional
DEFAULT_MODEL=opus
DB_PATH=./data/cc-chat.db
ALLOWED_USER_IDS=
```

### Register Commands

```bash
# From source
bun run register

# Or use the binary with environment variables set
```

### Run

```bash
# Binary
./cc-chat-win.exe

# From source
bun run start
```

## Commands

| Command | Description |
|---------|-------------|
| `/new <path>` | Create new project thread |
| `/resume <path>` | Continue last conversation in directory |
| `/ls [path]` | Browse directories with buttons |
| `/session info` | View current session info |
| `/session clear` | Clear session, start fresh |
| `/model <model>` | Switch model (sonnet/opus/haiku) |
| `/stop` | Stop running Claude task |
| `/status` | View all active projects |
| `/archive` | Archive current thread |
| `/help` | Show help |

## Auto-Start (Windows)

To run on startup without a visible window:

1. Create `start-hidden.vbs`:
```vbs
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "C:\path\to\cc-chat-win.exe", 0, False
```

2. Add to Task Scheduler:
```powershell
schtasks /create /tn "cc-chat" /tr "wscript.exe C:\path\to\start-hidden.vbs" /sc onlogon /rl highest
```

## Development

```bash
# Install dependencies
bun install

# Development mode with watch
bun run dev

# Build binaries for all platforms
bun run build

# Register Discord commands
bun run register
```

## Architecture

```
src/
├── index.ts                 # Entry point
├── config.ts                # Configuration
├── types/                   # TypeScript types
├── core/                    # Core logic
│   ├── claude-runner.ts     # Claude CLI executor
│   ├── message-parser.ts    # Stream JSON parser
│   ├── process-manager.ts   # Process lifecycle
│   ├── auto-updater.ts      # GitHub release updater
│   └── logger.ts            # File logging
├── store/                   # Data persistence
│   └── sqlite-store.ts      # SQLite storage
└── adapters/                # External integrations
    ├── discord-bot.ts       # Discord client
    ├── commands.ts          # Slash commands
    └── output-formatter.ts  # Message formatting
```

## License

MIT
