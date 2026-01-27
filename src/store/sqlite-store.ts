import { Database } from 'bun:sqlite';
import type { Session, SessionUpdate, MessageRecord, CostSummary } from '../types/index.js';
import { config } from '../config.js';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

export class SqliteStore {
  private db: Database;

  constructor(dbPath: string = config.dbPath) {
    // Ensure directory exists
    mkdirSync(dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS thread_bindings (
        thread_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        project_dir TEXT NOT NULL,
        session_id TEXT,
        model TEXT DEFAULT 'sonnet',
        status TEXT DEFAULT 'idle',
        created_at INTEGER NOT NULL,
        last_activity INTEGER NOT NULL
      );

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
  }

  get(threadId: string): Session | null {
    const row = this.db.query<{
      thread_id: string;
      channel_id: string;
      guild_id: string;
      name: string;
      project_dir: string;
      session_id: string | null;
      model: string;
      status: string;
      created_at: number;
      last_activity: number;
    }, [string]>(`
      SELECT * FROM thread_bindings WHERE thread_id = ?
    `).get(threadId);

    if (!row) return null;

    return {
      id: row.thread_id,
      channelId: row.channel_id,
      guildId: row.guild_id,
      name: row.name,
      projectDir: row.project_dir,
      claudeSessionId: row.session_id || undefined,
      model: row.model as Session['model'],
      status: row.status as Session['status'],
      createdAt: row.created_at,
      lastActivity: row.last_activity,
    };
  }

  set(session: Session): void {
    this.db.query(`
      INSERT OR REPLACE INTO thread_bindings
      (thread_id, channel_id, guild_id, name, project_dir, session_id, model, status, created_at, last_activity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      session.channelId,
      session.guildId,
      session.name,
      session.projectDir,
      session.claudeSessionId || null,
      session.model,
      session.status,
      session.createdAt,
      session.lastActivity
    );
  }

  update(threadId: string, updates: SessionUpdate): boolean {
    const session = this.get(threadId);
    if (!session) return false;

    const updated: Session = {
      ...session,
      ...updates,
    };
    this.set(updated);
    return true;
  }

  delete(threadId: string): boolean {
    const result = this.db.query(`
      DELETE FROM thread_bindings WHERE thread_id = ?
    `).run(threadId);
    return result.changes > 0;
  }

  listByGuild(guildId: string): Session[] {
    const rows = this.db.query<{
      thread_id: string;
      channel_id: string;
      guild_id: string;
      name: string;
      project_dir: string;
      session_id: string | null;
      model: string;
      status: string;
      created_at: number;
      last_activity: number;
    }, [string]>(`
      SELECT * FROM thread_bindings WHERE guild_id = ? ORDER BY last_activity DESC
    `).all(guildId);

    return rows.map(row => ({
      id: row.thread_id,
      channelId: row.channel_id,
      guildId: row.guild_id,
      name: row.name,
      projectDir: row.project_dir,
      claudeSessionId: row.session_id || undefined,
      model: row.model as Session['model'],
      status: row.status as Session['status'],
      createdAt: row.created_at,
      lastActivity: row.last_activity,
    }));
  }

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

  getTotalCost(threadId?: string): CostSummary {
    if (threadId) {
      const row = this.db.query<{
        total_cost: number | null;
        message_count: number;
        sessions: number;
      }, [string]>(`
        SELECT
          SUM(cost_usd) as total_cost,
          COUNT(*) as message_count,
          COUNT(DISTINCT session_id) as sessions
        FROM message_history
        WHERE thread_id = ?
      `).get(threadId);

      return {
        totalCost: row?.total_cost || 0,
        messageCount: row?.message_count || 0,
        sessions: row?.sessions || 0,
      };
    }

    const row = this.db.query<{
      total_cost: number | null;
      message_count: number;
      sessions: number;
    }, []>(`
      SELECT
        SUM(cost_usd) as total_cost,
        COUNT(*) as message_count,
        COUNT(DISTINCT session_id) as sessions
      FROM message_history
    `).get();

    return {
      totalCost: row?.total_cost || 0,
      messageCount: row?.message_count || 0,
      sessions: row?.sessions || 0,
    };
  }

  clearSession(threadId: string): boolean {
    return this.update(threadId, { claudeSessionId: undefined });
  }

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

  close(): void {
    this.db.close();
  }
}

export const store = new SqliteStore();
