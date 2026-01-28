/**
 * Session Types
 *
 * Type definitions for Discord thread sessions and related data structures.
 * A session represents a binding between a Discord thread and a Claude
 * conversation within a specific project directory.
 */

/**
 * Available Claude model types.
 * - sonnet: Fast and capable, good balance of speed and quality
 * - opus: Most capable, best for complex tasks
 * - haiku: Fastest, best for simple tasks
 */
export type ModelType = 'sonnet' | 'opus' | 'haiku';

/**
 * Session status indicating current activity state.
 * - idle: No active Claude process
 * - running: Claude is currently processing a request
 * - error: Last operation resulted in an error
 */
export type SessionStatus = 'idle' | 'running' | 'error';

/**
 * Represents a Discord thread bound to a Claude project session.
 *
 * Each Discord thread can have one associated project directory
 * and maintains its own Claude conversation state.
 */
export interface Session {
  /** Discord thread ID (primary identifier) */
  id: string;

  /** Discord guild (server) ID */
  guildId: string;

  /** Parent channel ID where the thread was created */
  channelId: string;

  /** Human-readable session name (usually project folder name) */
  name: string;

  /** Absolute path to the project working directory */
  projectDir: string;

  /** Claude conversation session ID for resuming (optional) */
  claudeSessionId?: string;

  /** Use --continue flag instead of --resume for session continuation */
  useContinue?: boolean;

  /** Selected Claude model for this session */
  model: ModelType;

  /** Current activity status */
  status: SessionStatus;

  /** Unix timestamp when the session was created */
  createdAt: number;

  /** Unix timestamp of the last activity */
  lastActivity: number;
}

/**
 * Partial session update for modifying specific fields.
 * Used when updating session state without replacing the entire object.
 */
export interface SessionUpdate {
  /** Updated Claude session ID */
  claudeSessionId?: string;

  /** Updated continue flag preference */
  useContinue?: boolean;

  /** Updated model selection */
  model?: ModelType;

  /** Updated status */
  status?: SessionStatus;

  /** Updated last activity timestamp */
  lastActivity?: number;
}

/**
 * Record of a message exchange for cost tracking and history.
 * Stored in the message_history table.
 */
export interface MessageRecord {
  /** Auto-generated database ID */
  id?: number;

  /** Discord thread ID this message belongs to */
  threadId: string;

  /** Claude session ID at the time of the message */
  sessionId: string;

  /** Type of message (e.g., 'user', 'assistant', 'result') */
  messageType: string;

  /** Message content or summary */
  content: string;

  /** API cost in USD for this message (if applicable) */
  costUsd?: number;

  /** Unix timestamp when the message was created */
  createdAt: number;
}

/**
 * Aggregated cost summary for display purposes.
 * Can be scoped to a specific thread or global.
 */
export interface CostSummary {
  /** Total cost in USD across all included messages */
  totalCost: number;

  /** Number of messages included in the summary */
  messageCount: number;

  /** Number of unique Claude sessions */
  sessions: number;
}
