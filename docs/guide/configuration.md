# Configuration

Create a `.env` file in the same directory as the binary.

## Environment Variables

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

## Required Variables

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Application ID |
| `DISCORD_GUILD_ID` | Your Discord server ID |
| `PROJECT_ROOTS` | Directories where your projects live |

## Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEFAULT_MODEL` | `sonnet` | Default Claude model (sonnet/opus/haiku) |
| `DB_PATH` | `./data/cc-chat.db` | SQLite database path |
| `ALLOWED_USER_IDS` | (empty) | Comma-separated user IDs allowed to use the bot. Empty = everyone |

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
