/**
 * Process Manager
 *
 * Manages running Claude CLI processes and message queues.
 * Provides lifecycle management for spawned processes with cleanup on stop.
 *
 * Features:
 * - Track running processes by ID (typically Discord thread ID)
 * - Message queueing for sequential processing
 * - Mutex locks via async-mutex to prevent race conditions
 * - Graceful shutdown of all processes
 */

import type { Subprocess } from 'bun';
import type { ResultPromise } from 'execa';
import { Mutex } from 'async-mutex';

/**
 * A queued message waiting to be processed.
 */
interface QueuedMessage {
  /** The message content */
  content: string;
  /** Resolver to signal completion */
  resolve: () => void;
}

/** Wrapper to hold either a Bun subprocess or an execa process */
interface ManagedProcess {
  kill: () => void;
}

/**
 * Manages Claude CLI subprocesses and message queues.
 *
 * Each process is identified by an ID (typically the Discord thread ID).
 * Uses mutex locks to prevent race conditions when checking/starting processes.
 */
export class ProcessManager {
  /** Map of process ID to running subprocess */
  private running = new Map<string, ManagedProcess>();

  /** Map of process ID to mutex lock */
  private locks = new Map<string, Mutex>();

  /** Map of process ID to message queue */
  private queues = new Map<string, QueuedMessage[]>();

  /**
   * Get or create a mutex for a session.
   */
  private getMutex(id: string): Mutex {
    let mutex = this.locks.get(id);
    if (!mutex) {
      mutex = new Mutex();
      this.locks.set(id, mutex);
    }
    return mutex;
  }

  /**
   * Acquire lock for a session. Must call releaseLock when done.
   */
  async acquireLock(id: string): Promise<void> {
    await this.getMutex(id).acquire();
  }

  /**
   * Release lock for a session.
   */
  releaseLock(id: string): void {
    const mutex = this.locks.get(id);
    if (mutex?.isLocked()) {
      mutex.release();
    }
  }

  /**
   * Register a new Bun subprocess. Kills existing process with same ID if any.
   */
  start(id: string, proc: Subprocess): void {
    const existing = this.running.get(id);
    if (existing) {
      existing.kill();
    }
    this.running.set(id, proc);
  }

  /**
   * Register an execa process. Kills existing process with same ID if any.
   */
  startExeca(id: string, proc: ResultPromise): void {
    const existing = this.running.get(id);
    if (existing) {
      existing.kill();
    }
    this.running.set(id, proc);
  }

  /**
   * Stop a running process by ID.
   * @returns true if a process was stopped, false if not found
   */
  async stop(id: string): Promise<boolean> {
    const proc = this.running.get(id);
    if (!proc) {
      return false;
    }

    proc.kill();
    this.running.delete(id);
    this.cleanup(id);
    return true;
  }

  /**
   * Stop all running processes.
   */
  async stopAll(): Promise<void> {
    const promises = Array.from(this.running.keys()).map(id => this.stop(id));
    await Promise.all(promises);
  }

  /**
   * Check if a process is running.
   */
  isRunning(id: string): boolean {
    return this.running.has(id);
  }

  /**
   * Get a running process by ID.
   */
  get(id: string): ManagedProcess | undefined {
    return this.running.get(id);
  }

  /**
   * Remove a process from tracking without killing it.
   * Used when process has already exited.
   */
  remove(id: string): void {
    this.running.delete(id);
    this.cleanup(id);
  }

  /**
   * Get the count of running processes.
   */
  getRunningCount(): number {
    return this.running.size;
  }

  /**
   * Get IDs of all running processes.
   */
  getRunningIds(): string[] {
    return Array.from(this.running.keys());
  }

  /**
   * Add a message to the queue for a process.
   * Returns a promise that resolves when the message is processed.
   */
  enqueue(id: string, content: string): Promise<void> {
    return new Promise((resolve) => {
      const queue = this.queues.get(id) || [];
      queue.push({ content, resolve });
      this.queues.set(id, queue);
    });
  }

  /**
   * Get the next queued message for a process.
   * Returns undefined if queue is empty.
   */
  dequeue(id: string): QueuedMessage | undefined {
    const queue = this.queues.get(id);
    if (!queue || queue.length === 0) {
      return undefined;
    }
    return queue.shift();
  }

  /**
   * Get the number of messages in the queue.
   */
  getQueueLength(id: string): number {
    return this.queues.get(id)?.length || 0;
  }

  /**
   * Clear all queued messages, resolving their promises.
   */
  clearQueue(id: string): void {
    const queue = this.queues.get(id);
    if (queue) {
      for (const item of queue) {
        item.resolve();
      }
      this.queues.delete(id);
    }
  }

  /**
   * Clean up mutex and queue for a session (e.g., on archive).
   */
  cleanup(id: string): void {
    this.clearQueue(id);
    this.locks.delete(id);
  }
}

/** Global process manager instance */
export const processManager = new ProcessManager();
