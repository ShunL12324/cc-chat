/**
 * SQLite Store
 *
 * Persistent storage layer using SQLite for session and message data.
 * Uses WAL mode for better concurrent read/write performance.
 *
 * Tables:
 * - thread_bindings: Maps Discord threads to project sessions
 * - message_history: Stores message records for cost tracking
 */

import { Database } from 'bun:sqlite';
import type { Session, SessionUpdate, MessageRecord, CostSummary } from '../types/index.js';
import { config } from '../config.js';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

/** Row type for thread_bindings table */
interface ThreadBindingRow {
  thread_id: string;
  channel_id: string;
  guild_id: string;
  name: string;
  project_dir: string;
  session_id: string | null;
  use_continue: number;
  model: string;
  status: string;
  created_at: number;
  last_activity: number;
}

/**
 * Convert a database row to a Session object.
 */
function rowToSession(row: ThreadBindingRow): Session {
  return {
    id: row.thread_id,
    channelId: row.channel_id,
    guildId: row.guild_id,
    name: row.name,
    projectDir: row.project_dir,
    claudeSessionId: row.session_id || undefined,
    useContinue: !!row.use_continue,
    model: row.model as Session['model'],
    status: row.status as Session['status'],
    createdAt: row.created_at,
    lastActivity: row.last_activity,
  };
}

/**
 * SQLite-based session and message store.
 *
 * Provides CRUD operations for project sessions and message history.
 * Automatically creates database directory and tables on initialization.
 */
export class SqliteStore {
  private db: Database;

  constructor(dbPath: string = config.dbPath) {
    // Ensure database directory exists
    mkdirSync(dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);
    // Enable WAL mode for better concurrent access
    this.db.exec('PRAGMA journal_mode = WAL');
    this.initTables();
  }

  /**
   * Initialize database tables and indexes.
   */
  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS thread_bindings (
        thread_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        project_dir TEXT NOT NULL,
        session_id TEXT,
        use_continue INTEGER DEFAULT 0,
        model TEXT DEFAULT 'sonnet',
        status TEXT DEFAULT 'idle',
        created_at INTEGER NOT NULL,
        last_activity INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_thread_guild ON thread_bindings(guild_id);

      CREATE TABLE IF NOT EXISTS message_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        message_type TEXT NOT NULL,
        content TEXT NOT NULL,
        cost_usd REAL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_message_thread ON message_history(thread_id);
      CREATE INDEX IF NOT EXISTS idx_message_session ON message_history(session_id);
    `);

    // Migration: add use_continue column for existing databases
    try {
      this.db.exec(`ALTER TABLE thread_bindings ADD COLUMN use_continue INTEGER DEFAULT 0`);
    } catch {
      // Column already exists, ignore
    }
  }

  /**
   * Get a session by thread ID.
   */
  get(threadId: string): Session | null {
    const row = this.db.query<ThreadBindingRow, [string]>(`
      SELECT * FROM thread_bindings WHERE thread_id = ?
    `).get(threadId);

    return row ? rowToSession(row) : null;
  }

  /**
   * Create or update a session.
   */
  set(session: Session): void {
    this.db.query(`
      INSERT OR REPLACE INTO thread_bindings
      (thread_id, channel_id, guild_id, name, project_dir, session_id, use_continue, model, status, created_at, last_activity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      session.channelId,
      session.guildId,
      session.name,
      session.projectDir,
      session.claudeSessionId || null,
      session.useContinue ? 1 : 0,
      session.model,
      session.status,
      session.createdAt,
      session.lastActivity
    );
  }

  /**
   * Update specific fields of a session.
   * Returns false if session not found.
   */
  update(threadId: string, updates: SessionUpdate): boolean {
    const session = this.get(threadId);
    if (!session) return false;

    this.set({ ...session, ...updates });
    return true;
  }

  /**
   * Delete a session by thread ID.
   * Returns true if a session was deleted.
   */
  delete(threadId: string): boolean {
    const result = this.db.query(`
      DELETE FROM thread_bindings WHERE thread_id = ?
    `).run(threadId);
    return result.changes > 0;
  }

  /**
   * List all sessions for a guild, ordered by last activity.
   */
  listByGuild(guildId: string): Session[] {
    const rows = this.db.query<ThreadBindingRow, [string]>(`
      SELECT * FROM thread_bindings WHERE guild_id = ? ORDER BY last_activity DESC
    `).all(guildId);

    return rows.map(rowToSession);
  }

  /**
   * Save a message record for cost tracking.
   */
  saveMessage(record: MessageRecord): void {
    this.db.query(`
      INSERT INTO message_history (thread_id, session_id, message_type, content, cost_usd, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      record.threadId,
      record.sessionId,
      record.messageType,
      record.content,
      record.costUsd || null,
      record.createdAt
    );
  }

  /**
   * Get cost summary for a thread or all threads.
   */
  getTotalCost(threadId?: string): CostSummary {
    const query = threadId
      ? `SELECT SUM(cost_usd) as total_cost, COUNT(*) as message_count, COUNT(DISTINCT session_id) as sessions
         FROM message_history WHERE thread_id = ?`
      : `SELECT SUM(cost_usd) as total_cost, COUNT(*) as message_count, COUNT(DISTINCT session_id) as sessions
         FROM message_history`;

    const row = threadId
      ? this.db.query<{ total_cost: number | null; message_count: number; sessions: number }, [string]>(query).get(threadId)
      : this.db.query<{ total_cost: number | null; message_count: number; sessions: number }, []>(query).get();

    return {
      totalCost: row?.total_cost || 0,
      messageCount: row?.message_count || 0,
      sessions: row?.sessions || 0,
    };
  }

  /**
   * Clear the Claude session ID for a thread.
   * Next message will start a new conversation.
   */
  clearSession(threadId: string): boolean {
    return this.update(threadId, { claudeSessionId: undefined });
  }

  /**
   * Get recent messages for a thread.
   */
  getMessages(threadId: string, limit: number = 50): Array<{
    sessionId: string;
    messageType: string;
    costUsd: number | null;
    createdAt: number;
  }> {
    const rows = this.db.query<{
      session_id: string;
      message_type: string;
      cost_usd: number | null;
      created_at: number;
    }, [string, number]>(`
      SELECT session_id, message_type, cost_usd, created_at
      FROM message_history
      WHERE thread_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(threadId, limit);

    return rows.map(row => ({
      sessionId: row.session_id,
      messageType: row.message_type,
      costUsd: row.cost_usd,
      createdAt: row.created_at,
    }));
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }
}

/** Global store instance (lazily initialized) */
let _store: SqliteStore | null = null;

export const store = {
  get instance(): SqliteStore {
    if (!_store) {
      _store = new SqliteStore();
    }
    return _store;
  },
  get: (threadId: string) => store.instance.get(threadId),
  set: (session: Session) => store.instance.set(session),
  update: (threadId: string, updates: SessionUpdate) => store.instance.update(threadId, updates),
  delete: (threadId: string) => store.instance.delete(threadId),
  listByGuild: (guildId: string) => store.instance.listByGuild(guildId),
  saveMessage: (record: MessageRecord) => store.instance.saveMessage(record),
  getTotalCost: (threadId?: string) => store.instance.getTotalCost(threadId),
  clearSession: (threadId: string) => store.instance.clearSession(threadId),
  getMessages: (threadId: string, limit?: number) => store.instance.getMessages(threadId, limit),
  close: () => _store?.close(),
};
