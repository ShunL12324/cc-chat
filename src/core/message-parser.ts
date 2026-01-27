import type { ClaudeMessage, AssistantMessage, ToolUseContent } from '../types/index.js';

export interface MessageParserHandlers {
  onSystemInit?: (msg: Extract<ClaudeMessage, { type: 'system' }>) => void | Promise<void>;
  onAssistant?: (msg: Extract<ClaudeMessage, { type: 'assistant' }>) => void | Promise<void>;
  onUser?: (msg: Extract<ClaudeMessage, { type: 'user' }>) => void | Promise<void>;
  onToolUse?: (toolUse: ToolUseContent) => void | Promise<void>;
  onToolResult?: (msg: Extract<ClaudeMessage, { type: 'user' }>) => void | Promise<void>;
  onResult?: (msg: Extract<ClaudeMessage, { type: 'result' }>) => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
}

export class MessageParser {
  private buffer = '';
  private handlers: MessageParserHandlers;

  constructor(handlers: MessageParserHandlers) {
    this.handlers = handlers;
  }

  async feed(chunk: string): Promise<void> {
    this.buffer += chunk;

    // Process complete lines
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        await this.processLine(line);
      }
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.trim()) {
      await this.processLine(this.buffer);
      this.buffer = '';
    }
  }

  private async processLine(line: string): Promise<void> {
    try {
      const msg = JSON.parse(line) as ClaudeMessage;
      await this.dispatch(msg);
    } catch (error) {
      // Skip non-JSON lines (e.g., progress indicators)
      if (error instanceof SyntaxError) {
        return;
      }
      if (this.handlers.onError) {
        await this.handlers.onError(error as Error);
      }
    }
  }

  private async dispatch(msg: ClaudeMessage): Promise<void> {
    switch (msg.type) {
      case 'system':
        if (msg.subtype === 'init' && this.handlers.onSystemInit) {
          await this.handlers.onSystemInit(msg);
        }
        break;
      case 'assistant':
        const assistantMsg = msg as AssistantMessage;
        const contents = assistantMsg.message.content;

        // Debug log
        const types = contents.map(c => c.type).join(', ');
        console.log(`[parser] assistant message with: ${types}`);

        // Extract tool_use from content array
        if (this.handlers.onToolUse) {
          for (const content of contents) {
            if (content.type === 'tool_use') {
              console.log(`[parser] tool_use: ${(content as ToolUseContent).name}`);
              await this.handlers.onToolUse(content as ToolUseContent);
            }
          }
        }
        // Only call onAssistant if there's text content
        const hasText = contents.some(c => c.type === 'text' && (c as { text: string }).text.trim());
        if (hasText && this.handlers.onAssistant) {
          console.log(`[parser] has text content, calling onAssistant`);
          await this.handlers.onAssistant(msg);
        }
        break;
      case 'user':
        // user messages contain tool results
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
