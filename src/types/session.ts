export type ModelType = 'sonnet' | 'opus' | 'haiku';
export type SessionStatus = 'idle' | 'running' | 'error';

export interface Session {
  id: string;               // thread ID
  guildId: string;
  channelId: string;        // parent channel
  name: string;
  projectDir: string;
  claudeSessionId?: string;
  useContinue?: boolean;    // Use --continue instead of --resume
  model: ModelType;
  status: SessionStatus;
  createdAt: number;
  lastActivity: number;
}

export interface SessionUpdate {
  claudeSessionId?: string;
  useContinue?: boolean;
  model?: ModelType;
  status?: SessionStatus;
  lastActivity?: number;
}

export interface MessageRecord {
  id?: number;
  threadId: string;
  sessionId: string;
  messageType: string;
  content: string;
  costUsd?: number;
  createdAt: number;
}

export interface CostSummary {
  totalCost: number;
  messageCount: number;
  sessions: number;
}
