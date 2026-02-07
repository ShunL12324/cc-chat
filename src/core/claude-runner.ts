/**
 * Claude Runner
 *
 * Executes Claude CLI commands and streams output through the message parser.
 * Manages process lifecycle including timeout handling and graceful termination.
 *
 * Features:
 * - Spawns Claude CLI with stream-json output format
 * - Parses streaming JSON messages from stdout
 * - Handles session resumption via --resume or --continue flags
 * - Configurable timeout with automatic process termination
 */

import { spawn } from 'bun';
import { MessageParser, type MessageParserHandlers } from './message-parser.js';
import { processManager } from './process-manager.js';
import type { ResultMessage, SystemInitMessage } from '../types/index.js';
import { config } from '../config.js';

/**
 * Options for running a Claude CLI command.
 */
export interface RunOptions {
  /** Process identifier, typically the Discord thread ID */
  id: string;
  /** Working directory for the Claude process */
  cwd: string;
  /** The prompt to send to Claude */
  prompt: string;
  /** Claude session ID to resume (mutually exclusive with continue) */
  resume?: string;
  /** Use --continue flag to resume last conversation in directory */
  continue?: boolean;
  /** Model to use (sonnet, opus, haiku) */
  model?: string;
  /** Timeout in milliseconds before killing the process */
  timeout?: number;
}

/**
 * Result returned after Claude execution completes.
 */
export interface RunResult {
  /** Whether the task completed successfully */
  success: boolean;
  /** The Claude session ID for resuming later */
  sessionId?: string;
  /** Error message if failed */
  error?: string;
  /** Total cost in USD */
  costUsd?: number;
  /** Duration in milliseconds */
  durationMs?: number;
}

/**
 * Run a Claude CLI command with the given options.
 *
 * Spawns a Claude process, streams output through handlers, and returns
 * the result when complete. Handles timeouts and process cleanup.
 *
 * @param options - Configuration for the Claude run
 * @param handlers - Callbacks for various message types
 * @returns Promise resolving to the run result
 */
export async function runClaude(
  options: RunOptions,
  handlers: MessageParserHandlers
): Promise<RunResult> {
  const {
    id,
    cwd,
    prompt,
    resume,
    continue: continueConversation,
    model,
    timeout = config.claude.timeout
  } = options;

  // Build CLI arguments
  const args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--dangerously-skip-permissions',
  ];

  // Add session resumption flags (mutually exclusive)
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

  // Wrap handlers to capture session ID and result
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
      cmd: [config.claude.path, ...args],
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'inherit',
    });

    processManager.start(id, proc);

    // Set up timeout to kill long-running processes
    const timeoutId = setTimeout(() => {
      processManager.stop(id);
    }, timeout);

    // Stream and parse stdout
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

    // Flush any remaining buffered data
    await parser.flush();

    clearTimeout(timeoutId);

    // Wait for process to exit
    const exitCode = await proc.exited;
    processManager.remove(id);

    // Handle non-zero exit without a result message
    if (exitCode !== 0 && !result) {
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
      costUsd: result?.total_cost_usd,
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
