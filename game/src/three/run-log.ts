import { timed } from '../perf';
import { RunStream, type StreamLine } from '../sim/run-stream';
import type { GameEvent, World } from '../sim/types';
import { DatabaseLost, type SaveBackend } from './save-db';
import type { SlotId } from './save-slots';

export class RunLog {
  private readonly stream: RunStream;
  private seenWorlds = new WeakSet<World>();
  private seenEvents = new WeakSet<GameEvent[]>();
  private pending = new Set<Promise<void>>();
  private lost = false;

  constructor(private logs: Pick<SaveBackend, 'appendLog' | 'readLog'>, readonly runId: string, version: string, private onError: (err: unknown) => void) {
    this.stream = new RunStream({ runId, version, sessionId: freshSessionId() });
  }

  begin(world: World, loadedFrom: SlotId | null): void {
    this.seenWorlds.add(world);
    this.seenEvents.add(world.events);
    this.write(this.stream.begin(world, loadedFrom ?? 'new'));
  }

  note(world: World): void {
    if (this.seenWorlds.has(world)) return;
    const fresh = !this.seenEvents.has(world.events);
    this.seenWorlds.add(world);
    this.seenEvents.add(world.events);
    const events = fresh ? world.events : [];
    this.write(this.lost ? this.resync(world, events) : timed('runLog', () => this.stream.step(world, events)));
  }

  private resync(world: World, events: readonly GameEvent[]): StreamLine[] {
    this.lost = false;
    return [...this.stream.begin(world, 'resync'), ...this.stream.step(world, events)];
  }

  async flush(): Promise<void> {
    await Promise.all(this.pending);
  }

  async lines(header: Record<string, unknown>): Promise<string> {
    const records = await this.logs.readLog(this.runId);
    return [header, ...records].map((r) => JSON.stringify(r)).join('\n') + '\n';
  }

  private write(entries: StreamLine[]): void {
    if (entries.length === 0) return;
    const done = Promise.resolve().then(() => this.logs.appendLog(this.runId, entries)).catch((err) => {
      this.lost = true;
      if (!(err instanceof DatabaseLost)) this.onError(err);
    }).finally(() => this.pending.delete(done));
    this.pending.add(done);
  }
}

function freshSessionId(): string {
  return [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
