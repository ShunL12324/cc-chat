// Claude CLI stream-json output types

export type ClaudeMessage =
  | SystemInitMessage
  | AssistantMessage
  | UserMessage
  | ToolUseMessage
  | ToolResultMessage
  | ResultMessage;

export interface SystemInitMessage {
  type: 'system';
  subtype: 'init';
  session_id: string;
  tools: string[];
  mcp_servers: McpServer[];
  model?: string;
  cwd?: string;
}

export interface McpServer {
  name: string;
  status: string;
}

export interface AssistantMessage {
  type: 'assistant';
  message: ContentBlock;
  session_id: string;
}

export interface UserMessage {
  type: 'user';
  message: ContentBlock;
  session_id: string;
}

export interface ContentBlock {
  type: 'message';
  id: string;
  role: 'assistant' | 'user';
  model?: string;
  content: Content[];
  stop_reason?: string | null;
  stop_sequence?: string | null;
  usage?: Usage;
}

export type Content = TextContent | ToolUseContent | ToolResultContent;

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  service_tier?: string;
}

export interface ToolUseMessage {
  type: 'tool_use';
  tool_name: string;
  tool_input: Record<string, unknown>;
  session_id: string;
}

export interface ToolResultMessage {
  type: 'tool_result';
  tool_name: string;
  tool_result: string;
  is_error: boolean;
  session_id: string;
}

export interface ResultMessage {
  type: 'result';
  subtype: 'success' | 'error' | 'error_max_turns' | 'interrupted';
  session_id: string;
  result?: string;
  is_error?: boolean;
  cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  total_cost_usd?: number;
}

// Parsed tool display info
export interface ToolInfo {
  name: string;
  icon: string;
  description: string;
  input: Record<string, unknown>;
}
