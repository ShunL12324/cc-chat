import type { Subprocess } from 'bun';

export class ProcessManager {
  private running = new Map<string, Subprocess>();

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
}

export const processManager = new ProcessManager();
