interface Waiting {
  readonly action: () => void;
  readonly key: string | undefined;
}

export class TurnWait {
  private queue: Waiting[] = [];
  private releasing = false;

  constructor(private readonly turnPlays: () => boolean) {}

  get size(): number {
    return this.queue.length;
  }

  defer(action: () => void, key?: string): void {
    if (key !== undefined && this.queue.some((waiting) => waiting.key === key)) return;
    this.queue.push({ action, key });
  }

  release(): void {
    if (this.releasing) throw new Error("TurnWait released inside a release");
    if (this.queue.length === 0) return;
    const taken = this.queue;
    this.queue = [];
    this.releasing = true;
    try {
      for (const [i, waiting] of taken.entries()) {
        waiting.action();
        if (this.turnPlays()) {
          this.queue = [...taken.slice(i + 1), ...this.queue];
          return;
        }
      }
    } finally {
      this.releasing = false;
    }
  }
}
