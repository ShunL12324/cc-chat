/**
 * Session Schemas
 *
 * Zod schemas for Discord thread sessions and related data structures.
 * A session represents a binding between a Discord thread and a Claude
 * conversation within a specific project directory.
 */

import { z } from 'zod/v4';

export const ModelTypeSchema = z.enum(['sonnet', 'opus', 'haiku']);

export const SessionStatusSchema = z.enum(['idle', 'running', 'error']);

export const SessionSchema = z.object({
  id: z.string(),
  guildId: z.string(),
  channelId: z.string(),
  name: z.string(),
  projectDir: z.string(),
  claudeSessionId: z.string().optional(),
  useContinue: z.boolean().optional(),
  model: ModelTypeSchema,
  status: SessionStatusSchema,
  createdAt: z.number(),
  lastActivity: z.number(),
});

export const SessionUpdateSchema = z.object({
  claudeSessionId: z.string().optional(),
  useContinue: z.boolean().optional(),
  model: ModelTypeSchema.optional(),
  status: SessionStatusSchema.optional(),
  lastActivity: z.number().optional(),
});

export const MessageRecordSchema = z.object({
  id: z.number().optional(),
  threadId: z.string(),
  sessionId: z.string(),
  messageType: z.string(),
  content: z.string(),
  costUsd: z.number().optional(),
  createdAt: z.number(),
});

export const CostSummarySchema = z.object({
  totalCost: z.number(),
  messageCount: z.number(),
  sessions: z.number(),
});

export type ModelType = z.infer<typeof ModelTypeSchema>;
export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type SessionUpdate = z.infer<typeof SessionUpdateSchema>;
export type MessageRecord = z.infer<typeof MessageRecordSchema>;
export type CostSummary = z.infer<typeof CostSummarySchema>;
