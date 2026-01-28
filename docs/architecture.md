# Architecture

Overview of the cc-chat codebase structure.

## Directory Structure

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

## Core Concepts

### Thread Architecture

- Main channel `#claude` used for creating projects
- Each Thread = one project = one working directory
- Thread name = project name (auto-extracted from path)

### Session Management

- Session ID obtained from Claude's `stream-json` output
- Use `--resume <session_id>` to resume conversations
- SQLite persistence for session storage

### Claude CLI Integration

The bot spawns Claude CLI processes using:

```bash
claude -p --output-format stream-json
```

This provides structured JSON output that can be parsed and formatted for Discord.
