/**
 * Message Parser
 *
 * Parses streaming JSON output from Claude CLI (--output-format stream-json).
 * Uses EventEmitter pattern for flexible message handling.
 *
 * Events:
 * - 'system_init': System initialization with session ID
 * - 'assistant': Claude's text responses
 * - 'tool_use': Individual tool use from assistant message
 * - 'tool_result': Tool results returned to Claude
 * - 'result': Final result with cost and duration stats
 * - 'error': Parsing or validation errors
 */

import EventEmitter from 'eventemitter3';
import type {
  ClaudeMessage,
  AssistantMessage,
  SystemInitMessage,
  SystemMessage,
  UserMessage,
  ToolUseContent,
  ResultMessage,
} from '../types/index.js';
import { parseClaudeMessage, SystemInitMessageSchema } from '../types/index.js';
import { getLogger } from './logger.js';

/**
 * Event map for type-safe event handling.
 */
export interface MessageParserEvents {
  system_init: [msg: SystemInitMessage];
  assistant: [msg: AssistantMessage];
  tool_use: [toolUse: ToolUseContent];
  tool_result: [msg: UserMessage];
  result: [msg: ResultMessage];
  error: [error: Error];
}

/**
 * Legacy handler interface for backward compatibility.
 */
export interface MessageParserHandlers {
  onSystemInit?: (msg: SystemInitMessage) => void | Promise<void>;
  onAssistant?: (msg: AssistantMessage) => void | Promise<void>;
  onUser?: (msg: UserMessage) => void | Promise<void>;
  onToolUse?: (toolUse: ToolUseContent) => void | Promise<void>;
  onToolResult?: (msg: UserMessage) => void | Promise<void>;
  onResult?: (msg: ResultMessage) => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
}

/**
 * Streaming JSON message parser with EventEmitter support.
 *
 * Accumulates incoming data, splits by newlines, validates each line
 * with zod, and emits typed events.
 */
export class MessageParser extends EventEmitter<MessageParserEvents> {
  /** Buffer for incomplete lines */
  private buffer = '';

  /**
   * Create a parser, optionally wiring up legacy handlers.
   */
  constructor(handlers?: MessageParserHandlers) {
    super();

    if (handlers) {
      this.bindHandlers(handlers);
    }
  }

  /**
   * Wire legacy callback handlers to events.
   */
  private bindHandlers(handlers: MessageParserHandlers): void {
    if (handlers.onSystemInit) {
      this.on('system_init', handlers.onSystemInit);
    }
    if (handlers.onAssistant) {
      this.on('assistant', handlers.onAssistant);
    }
    if (handlers.onToolUse) {
      this.on('tool_use', handlers.onToolUse);
    }
    if (handlers.onToolResult) {
      this.on('tool_result', handlers.onToolResult);
    }
    if (handlers.onResult) {
      this.on('result', handlers.onResult);
    }
    if (handlers.onError) {
      this.on('error', handlers.onError);
    }
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
      const json = JSON.parse(line);
      const log = getLogger();
      log.debug({ type: json?.type, subtype: json?.subtype, msgType: json?.message?.type }, '[parser] Processing line');

      const result = parseClaudeMessage(json);

      if (!result.success) {
        log.warn(
          { issues: result.error.issues, rawType: json?.type, rawSubtype: json?.subtype, rawMsgType: json?.message?.type },
          '[parser] Invalid message shape'
        );
        log.debug({ rawJson: JSON.stringify(json).slice(0, 500) }, '[parser] Raw rejected message');
        return;
      }

      await this.dispatch(result.data);
    } catch (error) {
      // Skip non-JSON lines silently (e.g., progress indicators)
      if (error instanceof SyntaxError) {
        return;
      }
      this.emit('error', error as Error);
    }
  }

  /**
   * Route a parsed message to the appropriate event.
   */
  private async dispatch(msg: ClaudeMessage): Promise<void> {
    switch (msg.type) {
      case 'system': {
        // Only emit for init subtype; other subtypes are informational
        const initResult = SystemInitMessageSchema.safeParse(msg);
        if (initResult.success) {
          this.emit('system_init', initResult.data);
        }
        break;
      }

      case 'assistant': {
        const contents = msg.message.content;

        // Emit tool_use events for each tool use block
        for (const content of contents) {
          if (content.type === 'tool_use') {
            this.emit('tool_use', content);
          }
        }

        // Emit assistant event only if there's non-empty text content
        const hasText = contents.some(
          c => c.type === 'text' && c.text.trim()
        );
        if (hasText) {
          this.emit('assistant', msg);
        }
        break;
      }

      case 'user':
        this.emit('tool_result', msg);
        break;

      case 'result':
        this.emit('result', msg);
        break;
    }
  }
}
