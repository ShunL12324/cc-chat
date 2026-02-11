# Configuration

Create a `config.yaml` file in the same directory as the binary.

## Example Configuration

```yaml
# Discord Bot Settings
discord:
  token: "your-bot-token-here"
  clientId: "your-client-id-here"
  guildId: "your-guild-id-here"  # Optional, for development

# Claude CLI Settings
claude:
  path: "claude"
  defaultModel: "opus"  # sonnet | opus | haiku
  timeout: 900000       # 15 minutes in ms

# Project Settings
projects:
  roots:
    - "C:/Users/YourName/projects"
    - "D:/workspace"

# Storage Settings
storage:
  dbPath: "./data/cc-chat.db"

# Access Control
access:
  allowedUsers: []  # Empty = all users allowed
```

## Configuration Reference

### discord

| Field | Required | Description |
|-------|----------|-------------|
| `token` | Yes | Bot token from Discord Developer Portal |
| `clientId` | Yes | Application ID |
| `guildId` | No | Guild ID for dev registration (instant). Empty = global (up to 1 hour) |

### claude

| Field | Default | Description |
|-------|---------|-------------|
| `path` | `claude` | Path to Claude CLI executable |
| `defaultModel` | `opus` | Default model: `sonnet`, `opus`, or `haiku` |
| `timeout` | `900000` | Process timeout in milliseconds (15 minutes) |

### projects

| Field | Default | Description |
|-------|---------|-------------|
| `roots` | `[]` | List of allowed project root directories |

### storage

| Field | Default | Description |
|-------|---------|-------------|
| `dbPath` | `./data/cc-chat.db` | SQLite database path (relative to binary) |

### access

| Field | Default | Description |
|-------|---------|-------------|
| `allowedUsers` | `[]` | Discord user IDs allowed to use the bot. Empty = everyone |

## Environment Variable Overrides

For sensitive values, you can use environment variables instead of config.yaml:

| Environment Variable | Overrides |
|---------------------|-----------|
| `DISCORD_TOKEN` | `discord.token` |
| `DISCORD_CLIENT_ID` | `discord.clientId` |
| `DISCORD_GUILD_ID` | `discord.guildId` |

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
