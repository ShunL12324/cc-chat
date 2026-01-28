import type { Subprocess } from 'bun';

interface QueuedMessage {
  content: string;
  resolve: () => void;
}

export class ProcessManager {
  private running = new Map<string, Subprocess>();
  private queues = new Map<string, QueuedMessage[]>();

  start(id: string, proc: Subprocess): void {
    const existing = this.running.get(id);
    if (existing) {
      existing.kill();
    }
    this.running.set(id, proc);
  }

  async stop(id: string): Promise<boolean> {
    const proc = this.running.get(id);
    if (!proc) {
      return false;
    }

    proc.kill();
    this.running.delete(id);
    return true;
  }

  async stopAll(): Promise<void> {
    const promises = Array.from(this.running.keys()).map(id => this.stop(id));
    await Promise.all(promises);
  }

  isRunning(id: string): boolean {
    return this.running.has(id);
  }

  get(id: string): Subprocess | undefined {
    return this.running.get(id);
  }

  remove(id: string): void {
    this.running.delete(id);
  }

  getRunningCount(): number {
    return this.running.size;
  }

  // Queue methods
  enqueue(id: string, content: string): Promise<void> {
    return new Promise((resolve) => {
      const queue = this.queues.get(id) || [];
      queue.push({ content, resolve });
      this.queues.set(id, queue);
    });
  }

  dequeue(id: string): QueuedMessage | undefined {
    const queue = this.queues.get(id);
    if (!queue || queue.length === 0) {
      return undefined;
    }
    return queue.shift();
  }

  getQueueLength(id: string): number {
    return this.queues.get(id)?.length || 0;
  }

  clearQueue(id: string): void {
    const queue = this.queues.get(id);
    if (queue) {
      for (const item of queue) {
        item.resolve();
      }
      this.queues.delete(id);
    }
  }
}

export const processManager = new ProcessManager();
