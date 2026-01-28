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

Use [NSSM](https://nssm.cc/) to run as a Windows service under your user account:

1. Download NSSM and add to PATH

2. Install the service:
```powershell
nssm install cc-chat "C:\path\to\cc-chat-win.exe"
nssm set cc-chat AppDirectory "C:\path\to"
nssm set cc-chat ObjectName ".\YourUsername" "YourPassword"
nssm set cc-chat Start SERVICE_AUTO_START
```

3. Start the service:
```powershell
nssm start cc-chat
```

4. Manage the service:
```powershell
nssm status cc-chat    # Check status
nssm restart cc-chat   # Restart
nssm stop cc-chat      # Stop
nssm remove cc-chat    # Uninstall
```
