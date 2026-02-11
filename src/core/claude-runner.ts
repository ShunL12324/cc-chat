/**
 * Claude Runner
 *
 * Executes Claude CLI commands and streams output through the message parser.
 * Uses execa for robust process management with proper cleanup.
 *
 * Features:
 * - Spawns Claude CLI with stream-json output format
 * - Parses streaming JSON messages via EventEmitter-based parser
 * - Handles session resumption via --resume or --continue flags
 * - Configurable timeout with automatic process termination
 */

import { execa, type ResultPromise } from 'execa';
import { MessageParser, type MessageParserHandlers } from './message-parser.js';
import { processManager } from './process-manager.js';
import type { ResultMessage, SystemInitMessage } from '../types/index.js';
import { config } from '../config.js';
import { getLogger } from './logger.js';

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
  const args: string[] = [
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
    const log = getLogger();
    log.debug({ args, cwd, timeout }, '[runner] Spawning Claude process');

    const proc = execa(config.claude.path, args, {
      cwd,
      timeout,
      reject: false,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'inherit',
      // graceful shutdown: SIGTERM first, then SIGKILL after 5s
      killSignal: 'SIGTERM',
      forceKillAfterDelay: 5000,
    });

    // Register with process manager for external stop capability
    processManager.startExeca(id, proc);

    // Stream stdout through parser
    if (proc.stdout) {
      for await (const chunk of proc.stdout) {
        const text = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
        log.debug({ chunkLen: text.length }, '[runner] stdout chunk');
        await parser.feed(text);
      }
    }

    // Flush any remaining buffered data
    await parser.flush();

    // Wait for process to complete
    const execResult = await proc;

    log.debug({ exitCode: execResult.exitCode, hasResult: !!result, sessionId }, '[runner] Process completed');

    processManager.remove(id);

    // Handle non-zero exit without a result message
    if (execResult.exitCode !== 0 && !result) {
      return {
        success: false,
        sessionId,
        error: execResult.stderr || `Process exited with code ${execResult.exitCode}`,
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
