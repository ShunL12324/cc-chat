# Getting Started

cc-chat is a Discord bot that bridges Claude Code CLI to mobile devices. Control your local Claude Code sessions from your phone via Discord.

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

### Quick Start

1. [Set up your Discord Bot](/guide/discord-setup)
2. [Configure environment variables](/guide/configuration)
3. Run the binary:

```bash
# Windows
./cc-chat-win.exe

# macOS / Linux
./cc-chat-linux
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
