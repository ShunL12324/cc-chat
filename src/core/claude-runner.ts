import { spawn } from 'bun';
import { MessageParser, type MessageParserHandlers } from './message-parser.js';
import { processManager } from './process-manager.js';
import type { ResultMessage, SystemInitMessage } from '../types/index.js';
import { config } from '../config.js';

export interface RunOptions {
  id: string;           // process identifier (usually thread ID)
  cwd: string;
  prompt: string;
  resume?: string;      // Claude session ID to resume
  continue?: boolean;   // Use --continue to resume last conversation
  model?: string;
  timeout?: number;
}

export interface RunResult {
  success: boolean;
  sessionId?: string;
  error?: string;
  costUsd?: number;
  durationMs?: number;
}

export async function runClaude(
  options: RunOptions,
  handlers: MessageParserHandlers
): Promise<RunResult> {
  const { id, cwd, prompt, resume, continue: continueConversation, model, timeout = config.claude.timeout } = options;

  const args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--dangerously-skip-permissions',
  ];

  if (continueConversation) {
    args.push('--continue');
  } else if (resume) {
    args.push('--resume', resume);
  }

  if (model) {
    args.push('--model', model);
  }

  let sessionId: string | undefined;
  let result: ResultMessage | undefined;

  const wrappedHandlers: MessageParserHandlers = {
    ...handlers,
    onSystemInit: async (msg: SystemInitMessage) => {
      sessionId = msg.session_id;
      if (handlers.onSystemInit) {
        await handlers.onSystemInit(msg);
      }
    },
    onResult: async (msg: ResultMessage) => {
      result = msg;
      if (handlers.onResult) {
        await handlers.onResult(msg);
      }
    },
  };

  const parser = new MessageParser(wrappedHandlers);

  try {
    const proc = spawn({
      cmd: ['claude', ...args],
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'inherit',
    });

    processManager.start(id, proc);

    // Set up timeout
    const timeoutId = setTimeout(() => {
      processManager.stop(id);
    }, timeout);

    // Read stdout
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        await parser.feed(chunk);
      }
    } finally {
      reader.releaseLock();
    }

    await parser.flush();

    clearTimeout(timeoutId);

    // Wait for process to finish
    const exitCode = await proc.exited;
    processManager.remove(id);

    if (exitCode !== 0 && !result) {
      // Read stderr for error info
      const stderrReader = proc.stderr.getReader();
      let stderrText = '';
      try {
        while (true) {
          const { done, value } = await stderrReader.read();
          if (done) break;
          stderrText += decoder.decode(value, { stream: true });
        }
      } finally {
        stderrReader.releaseLock();
      }

      return {
        success: false,
        sessionId,
        error: stderrText || `Process exited with code ${exitCode}`,
      };
    }

    return {
      success: result?.subtype === 'success',
      sessionId,
      costUsd: result?.cost_usd,
      durationMs: result?.duration_ms,
      error: result?.is_error ? result.result : undefined,
    };
  } catch (error) {
    processManager.remove(id);
    return {
      success: false,
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
