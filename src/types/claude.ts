/**
 * Claude CLI Message Schemas
 *
 * Zod schemas for parsing the stream-json output format from Claude CLI.
 * Provides runtime validation to catch format changes early.
 * Uses .passthrough() to tolerate unknown fields from CLI updates.
 *
 * Message flow:
 * 1. system (init) - Session initialization with available tools
 * 2. assistant - Claude's responses with text and/or tool usage
 * 3. user - Tool results returned to Claude
 * 4. result - Final completion status with cost and duration
 */

import { z } from 'zod/v4';

export const McpServerSchema = z.object({
  name: z.string(),
  status: z.string(),
}).passthrough();

export const UsageSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_creation_input_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional(),
  service_tier: z.string().optional(),
}).passthrough();

export const TextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
}).passthrough();

export const ToolUseContentSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()),
}).passthrough();

export const ToolResultContentSchema = z.object({
  type: z.literal('tool_result'),
  tool_use_id: z.string(),
  content: z.string(),
  is_error: z.boolean().optional(),
}).passthrough();

export const ContentSchema = z.discriminatedUnion('type', [
  TextContentSchema,
  ToolUseContentSchema,
  ToolResultContentSchema,
]);

export const ContentBlockSchema = z.object({
  type: z.literal('message'),
  id: z.string(),
  role: z.enum(['assistant', 'user']),
  model: z.string().optional(),
  content: z.array(ContentSchema),
  stop_reason: z.string().nullish(),
  stop_sequence: z.string().nullish(),
  usage: UsageSchema.optional(),
}).passthrough();

export const SystemInitMessageSchema = z.object({
  type: z.literal('system'),
  subtype: z.literal('init'),
  session_id: z.string(),
  tools: z.array(z.string()),
  mcp_servers: z.array(McpServerSchema),
  model: z.string().optional(),
  cwd: z.string().optional(),
}).passthrough();

export const ToolUseResultDataSchema = z.object({
  tool_name: z.string(),
  tool_use_id: z.string(),
  is_error: z.boolean().optional(),
}).passthrough();

export const AssistantMessageSchema = z.object({
  type: z.literal('assistant'),
  message: ContentBlockSchema,
  session_id: z.string(),
}).passthrough();

export const UserMessageSchema = z.object({
  type: z.literal('user'),
  message: ContentBlockSchema,
  session_id: z.string(),
  tool_use_result: ToolUseResultDataSchema.optional(),
}).passthrough();

export const ToolUseMessageSchema = z.object({
  type: z.literal('tool_use'),
  tool_name: z.string(),
  tool_input: z.record(z.string(), z.unknown()),
  session_id: z.string(),
}).passthrough();

export const ToolResultMessageSchema = z.object({
  type: z.literal('tool_result'),
  tool_name: z.string(),
  tool_result: z.string(),
  is_error: z.boolean(),
  session_id: z.string(),
}).passthrough();

/**
 * Result usage — tolerant schema that accepts both snake_case and camelCase.
 * CLI output structure varies between versions.
 */
export const ResultUsageSchema = z.object({
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  cache_creation_input_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional(),
}).passthrough();

/**
 * Per-model usage entry — CLI uses camelCase (inputTokens, outputTokens).
 */
export const ModelUsageEntrySchema = z.object({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  cacheReadInputTokens: z.number().optional(),
  cacheCreationInputTokens: z.number().optional(),
  costUSD: z.number().optional(),
}).passthrough();

export const ResultMessageSchema = z.object({
  type: z.literal('result'),
  subtype: z.enum(['success', 'error', 'error_max_turns', 'interrupted']),
  session_id: z.string(),
  result: z.string().optional(),
  is_error: z.boolean().optional(),
  total_cost_usd: z.number().optional(),
  duration_ms: z.number().optional(),
  duration_api_ms: z.number().optional(),
  num_turns: z.number().optional(),
  usage: ResultUsageSchema.optional(),
  modelUsage: z.record(z.string(), ModelUsageEntrySchema).optional(),
}).passthrough();

/**
 * Discriminated union of all Claude CLI message types.
 * Use parseClaudeMessage() for safe parsing with error details.
 */
export const ClaudeMessageSchema = z.discriminatedUnion('type', [
  SystemInitMessageSchema,
  AssistantMessageSchema,
  UserMessageSchema,
  ToolUseMessageSchema,
  ToolResultMessageSchema,
  ResultMessageSchema,
]);

/**
 * Safely parse a JSON object as a Claude CLI message.
 * Returns { success: true, data } or { success: false, error }.
 */
export function parseClaudeMessage(data: unknown) {
  return ClaudeMessageSchema.safeParse(data);
}

export const ToolInfoSchema = z.object({
  name: z.string(),
  icon: z.string(),
  description: z.string(),
  input: z.record(z.string(), z.unknown()),
});

// Inferred types
export type McpServer = z.infer<typeof McpServerSchema>;
export type Usage = z.infer<typeof UsageSchema>;
export type TextContent = z.infer<typeof TextContentSchema>;
export type ToolUseContent = z.infer<typeof ToolUseContentSchema>;
export type ToolResultContent = z.infer<typeof ToolResultContentSchema>;
export type Content = z.infer<typeof ContentSchema>;
export type ContentBlock = z.infer<typeof ContentBlockSchema>;
export type SystemInitMessage = z.infer<typeof SystemInitMessageSchema>;
export type ToolUseResultData = z.infer<typeof ToolUseResultDataSchema>;
export type AssistantMessage = z.infer<typeof AssistantMessageSchema>;
export type UserMessage = z.infer<typeof UserMessageSchema>;
export type ToolUseMessage = z.infer<typeof ToolUseMessageSchema>;
export type ToolResultMessage = z.infer<typeof ToolResultMessageSchema>;
export type ResultUsage = z.infer<typeof ResultUsageSchema>;
export type ModelUsageEntry = z.infer<typeof ModelUsageEntrySchema>;
export type ResultMessage = z.infer<typeof ResultMessageSchema>;
export type ClaudeMessage = z.infer<typeof ClaudeMessageSchema>;
export type ToolInfo = z.infer<typeof ToolInfoSchema>;
