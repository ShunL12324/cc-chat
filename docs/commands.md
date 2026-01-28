# Commands

All available Discord slash commands.

## Project Management

| Command | Description |
|---------|-------------|
| `/new <path>` | Create new project thread |
| `/resume <path>` | Continue last conversation in directory |
| `/archive` | Archive current thread |

## Session

| Command | Description |
|---------|-------------|
| `/session info` | View current session info |
| `/session clear` | Clear session, start fresh |
| `/stop` | Stop running Claude task |

## Navigation

| Command | Description |
|---------|-------------|
| `/ls [path]` | Browse directories with interactive buttons |

## Settings

| Command | Description |
|---------|-------------|
| `/model <model>` | Switch model (sonnet/opus/haiku) |

## Info

| Command | Description |
|---------|-------------|
| `/status` | View all active projects |
| `/help` | Show help |

## Usage Examples

### Create a New Project Thread

```
/new my-project
```

This creates a new Discord thread linked to the `my-project` directory under your configured `PROJECT_ROOTS`.

### Switch Models

```
/model opus
```

Switch to Claude Opus for more capable responses.

### Browse Files

```
/ls src
```

Opens an interactive file browser with button navigation.
