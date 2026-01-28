/**
 * Claude CLI Message Types
 *
 * Type definitions for parsing the stream-json output format from Claude CLI.
 * When running Claude with `--output-format stream-json`, it emits newline-delimited
 * JSON messages that describe the conversation flow.
 *
 * Message flow:
 * 1. system (init) - Session initialization with available tools
 * 2. assistant - Claude's responses with text and/or tool usage
 * 3. user - Tool results returned to Claude
 * 4. result - Final completion status with cost and duration
 */

/**
 * Union type of all possible Claude CLI message types.
 */
export type ClaudeMessage =
  | SystemInitMessage
  | AssistantMessage
  | UserMessage
  | ToolUseMessage
  | ToolResultMessage
  | ResultMessage;

/**
 * System initialization message sent at the start of a session.
 * Contains the session ID needed for resuming conversations.
 */
export interface SystemInitMessage {
  /** Message type identifier */
  type: 'system';
  /** System message subtype */
  subtype: 'init';
  /** Unique session identifier for resuming later */
  session_id: string;
  /** List of available tool names */
  tools: string[];
  /** Connected MCP servers and their status */
  mcp_servers: McpServer[];
  /** Model being used for this session */
  model?: string;
  /** Current working directory */
  cwd?: string;
}

/**
 * MCP (Model Context Protocol) server connection information.
 */
export interface McpServer {
  /** Server identifier name */
  name: string;
  /** Connection status (e.g., 'connected', 'disconnected') */
  status: string;
}

/**
 * Assistant message containing Claude's response.
 * May include text content and/or tool usage requests.
 */
export interface AssistantMessage {
  /** Message type identifier */
  type: 'assistant';
  /** Content block containing the response */
  message: ContentBlock;
  /** Session identifier */
  session_id: string;
}

/**
 * User message containing tool results or user input.
 */
export interface UserMessage {
  /** Message type identifier */
  type: 'user';
  /** Content block containing the message */
  message: ContentBlock;
  /** Session identifier */
  session_id: string;
}

/**
 * Content block wrapper for message content.
 * Used by both assistant and user messages.
 */
export interface ContentBlock {
  /** Block type (always 'message') */
  type: 'message';
  /** Unique message identifier */
  id: string;
  /** Message role */
  role: 'assistant' | 'user';
  /** Model that generated this message (for assistant messages) */
  model?: string;
  /** Array of content items (text, tool_use, tool_result) */
  content: Content[];
  /** Reason the model stopped generating */
  stop_reason?: string | null;
  /** Stop sequence that triggered completion */
  stop_sequence?: string | null;
  /** Token usage statistics */
  usage?: Usage;
}

/**
 * Union type of all content item types.
 */
export type Content = TextContent | ToolUseContent | ToolResultContent;

/**
 * Text content from Claude's response.
 */
export interface TextContent {
  /** Content type identifier */
  type: 'text';
  /** The text content */
  text: string;
}

/**
 * Tool use request from Claude.
 * Indicates Claude wants to execute a tool with the given input.
 */
export interface ToolUseContent {
  /** Content type identifier */
  type: 'tool_use';
  /** Unique tool use identifier for matching with results */
  id: string;
  /** Name of the tool to execute */
  name: string;
  /** Tool input parameters as key-value pairs */
  input: Record<string, unknown>;
}

/**
 * Result from a tool execution.
 * Returned to Claude after a tool_use is processed.
 */
export interface ToolResultContent {
  /** Content type identifier */
  type: 'tool_result';
  /** ID of the tool_use this result corresponds to */
  tool_use_id: string;
  /** Tool execution output */
  content: string;
  /** Whether the tool execution resulted in an error */
  is_error?: boolean;
}

/**
 * Token usage statistics for billing and monitoring.
 */
export interface Usage {
  /** Number of input tokens consumed */
  input_tokens: number;
  /** Number of output tokens generated */
  output_tokens: number;
  /** Tokens used to create new cache entries */
  cache_creation_input_tokens?: number;
  /** Tokens read from cache */
  cache_read_input_tokens?: number;
  /** Service tier used for this request */
  service_tier?: string;
}

/**
 * Tool use notification message (alternative format).
 * Emitted when Claude invokes a tool.
 */
export interface ToolUseMessage {
  /** Message type identifier */
  type: 'tool_use';
  /** Name of the tool being used */
  tool_name: string;
  /** Input parameters passed to the tool */
  tool_input: Record<string, unknown>;
  /** Session identifier */
  session_id: string;
}

/**
 * Tool result notification message (alternative format).
 * Emitted after a tool completes execution.
 */
export interface ToolResultMessage {
  /** Message type identifier */
  type: 'tool_result';
  /** Name of the tool that was executed */
  tool_name: string;
  /** Result returned by the tool */
  tool_result: string;
  /** Whether the tool execution failed */
  is_error: boolean;
  /** Session identifier */
  session_id: string;
}

/**
 * Final result message indicating task completion.
 * Contains cost, duration, and status information.
 */
export interface ResultMessage {
  /** Message type identifier */
  type: 'result';
  /** Completion status subtype */
  subtype: 'success' | 'error' | 'error_max_turns' | 'interrupted';
  /** Session identifier */
  session_id: string;
  /** Text result or error message */
  result?: string;
  /** Whether the result is an error */
  is_error?: boolean;
  /** Cost in USD for this request */
  cost_usd?: number;
  /** Total duration in milliseconds */
  duration_ms?: number;
  /** Time spent on API calls in milliseconds */
  duration_api_ms?: number;
  /** Number of conversation turns */
  num_turns?: number;
  /** Cumulative session cost in USD */
  total_cost_usd?: number;
}

/**
 * Parsed tool information for display purposes.
 * Used by the output formatter for Discord display.
 */
export interface ToolInfo {
  /** Tool name */
  name: string;
  /** Display icon (emoji) */
  icon: string;
  /** Human-readable description */
  description: string;
  /** Tool input parameters */
  input: Record<string, unknown>;
}
