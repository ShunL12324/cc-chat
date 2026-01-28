/**
 * Message Parser
 *
 * Parses streaming JSON output from Claude CLI (--output-format stream-json).
 * Buffers incoming chunks and dispatches parsed messages to handlers.
 *
 * Message types handled:
 * - system: Initialization messages with session ID
 * - assistant: Claude's responses with text and tool_use content
 * - user: Tool results returned to Claude
 * - result: Final result with cost and duration stats
 */

import type { ClaudeMessage, AssistantMessage, ToolUseContent } from '../types/index.js';

/**
 * Handler callbacks for different message types.
 */
export interface MessageParserHandlers {
  /** Called when system init message is received (contains session_id) */
  onSystemInit?: (msg: Extract<ClaudeMessage, { type: 'system' }>) => void | Promise<void>;
  /** Called when assistant message with text content is received */
  onAssistant?: (msg: Extract<ClaudeMessage, { type: 'assistant' }>) => void | Promise<void>;
  /** Called when user message is received */
  onUser?: (msg: Extract<ClaudeMessage, { type: 'user' }>) => void | Promise<void>;
  /** Called for each tool_use in an assistant message */
  onToolUse?: (toolUse: ToolUseContent) => void | Promise<void>;
  /** Called when tool result is received */
  onToolResult?: (msg: Extract<ClaudeMessage, { type: 'user' }>) => void | Promise<void>;
  /** Called when final result message is received */
  onResult?: (msg: Extract<ClaudeMessage, { type: 'result' }>) => void | Promise<void>;
  /** Called when a parsing error occurs */
  onError?: (error: Error) => void | Promise<void>;
}

/**
 * Streaming JSON message parser.
 *
 * Accumulates incoming data, splits by newlines, and parses each line
 * as a JSON message. Non-JSON lines (like progress indicators) are ignored.
 */
export class MessageParser {
  /** Buffer for incomplete lines */
  private buffer = '';

  /** Registered message handlers */
  private handlers: MessageParserHandlers;

  constructor(handlers: MessageParserHandlers) {
    this.handlers = handlers;
  }

  /**
   * Feed a chunk of data to the parser.
   * Processes any complete lines immediately.
   */
  async feed(chunk: string): Promise<void> {
    this.buffer += chunk;

    // Split into lines, keeping incomplete line in buffer
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        await this.processLine(line);
      }
    }
  }

  /**
   * Flush any remaining buffered data.
   * Call this after all input has been fed.
   */
  async flush(): Promise<void> {
    if (this.buffer.trim()) {
      await this.processLine(this.buffer);
      this.buffer = '';
    }
  }

  /**
   * Parse and dispatch a single line of JSON.
   */
  private async processLine(line: string): Promise<void> {
    try {
      const msg = JSON.parse(line) as ClaudeMessage;
      await this.dispatch(msg);
    } catch (error) {
      // Skip non-JSON lines silently (e.g., progress indicators)
      if (error instanceof SyntaxError) {
        return;
      }
      if (this.handlers.onError) {
        await this.handlers.onError(error as Error);
      }
    }
  }

  /**
   * Route a parsed message to the appropriate handler.
   */
  private async dispatch(msg: ClaudeMessage): Promise<void> {
    switch (msg.type) {
      case 'system':
        if (msg.subtype === 'init' && this.handlers.onSystemInit) {
          await this.handlers.onSystemInit(msg);
        }
        break;

      case 'assistant': {
        const assistantMsg = msg as AssistantMessage;
        const contents = assistantMsg.message.content;

        // Process tool_use content blocks
        if (this.handlers.onToolUse) {
          for (const content of contents) {
            if (content.type === 'tool_use') {
              await this.handlers.onToolUse(content as ToolUseContent);
            }
          }
        }

        // Call onAssistant only if there's non-empty text content
        const hasText = contents.some(
          c => c.type === 'text' && (c as { text: string }).text.trim()
        );
        if (hasText && this.handlers.onAssistant) {
          await this.handlers.onAssistant(msg);
        }
        break;
      }

      case 'user':
        // User messages contain tool results
        if (this.handlers.onToolResult) {
          await this.handlers.onToolResult(msg);
        }
        break;

      case 'result':
        if (this.handlers.onResult) {
          await this.handlers.onResult(msg);
        }
        break;
    }
  }
}
