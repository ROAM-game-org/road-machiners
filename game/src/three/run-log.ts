import { RunStream, type StreamLine } from '../sim/run-stream';
import type { GameEvent, World } from '../sim/types';
import type { SaveBackend } from './save-db';
import type { SlotId } from './save-slots';

export class RunLog {
  private readonly stream: RunStream;
  private seenWorlds = new WeakSet<World>();
  private seenEvents = new WeakSet<GameEvent[]>();
  private pending = new Set<Promise<void>>();

  constructor(private backend: SaveBackend, readonly runId: string, version: string, private onError: (err: unknown) => void) {
    this.stream = new RunStream({ runId, version });
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
    this.write(this.stream.step(world, fresh ? world.events : []));
  }

  async flush(): Promise<void> {
    await Promise.all(this.pending);
  }

  async lines(header: Record<string, unknown>): Promise<string> {
    const records = await this.backend.readLog(this.runId);
    return [header, ...records].map((r) => JSON.stringify(r)).join('\n') + '\n';
  }

  private write(entries: StreamLine[]): void {
    if (entries.length === 0) return;
    const done = Promise.resolve().then(() => this.backend.appendLog(this.runId, entries)).catch(this.onError).finally(() => this.pending.delete(done));
    this.pending.add(done);
  }
}
