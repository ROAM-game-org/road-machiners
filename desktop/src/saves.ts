import { randomBytes } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

export type LogEntry = { kind: string; turn: number } & Record<string, unknown>;

export type LogRecord = LogEntry & { runId: string; seq: number };

export type SlotId = string;

const SLOT_PATTERN = /^(auto|day|slot[0-9]+)$/;
const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SLOT_FILE = /^(.+)\.json$/;
const TEMP_SUFFIX = '.tmp';

export function checkedSlot(slot: unknown): SlotId {
  if (typeof slot !== 'string' || !SLOT_PATTERN.test(slot)) throw new Error(`Not a save slot: ${String(slot)}`);
  return slot;
}

export function checkedRunId(runId: unknown): string {
  if (typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId)) throw new Error(`Not a run id: ${String(runId)}`);
  return runId;
}

export class FileSaves {
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly nextSeq = new Map<string, number>();

  constructor(private readonly savesDir: string, private readonly logsDir: string) {}

  async readAll(): Promise<[SlotId, unknown][]> {
    await mkdir(this.savesDir, { recursive: true });
    const names = await readdir(this.savesDir);
    await Promise.all(names.filter((name) => name.endsWith(TEMP_SUFFIX)).map((name) => rm(join(this.savesDir, name))));
    const slots = names.flatMap((name) => this.slotOf(name));
    return Promise.all(slots.map(async (slot) => [slot, await this.readSlot(slot)] as [SlotId, unknown]));
  }

  async put(slot: SlotId, envelope: unknown): Promise<void> {
    const file = this.slotFile(checkedSlot(slot));
    return this.queued(file, () => this.writeAtomic(this.savesDir, file, JSON.stringify(envelope)));
  }

  async remove(slot: SlotId): Promise<void> {
    const file = this.slotFile(checkedSlot(slot));
    return this.queued(file, () => rm(file, { force: true }));
  }

  async appendLog(runId: string, entries: readonly LogEntry[]): Promise<void> {
    const file = this.logFile(checkedRunId(runId));
    return this.queued(file, async () => {
      await mkdir(this.logsDir, { recursive: true });
      const first = await this.seqAfter(runId, file);
      const lines = entries.map((entry, i) => `${JSON.stringify({ ...entry, runId, seq: first + i })}\n`);
      const handle = await open(file, 'a');
      try {
        await handle.appendFile(lines.join(''));
        await handle.sync();
      } finally {
        await handle.close();
      }
      this.nextSeq.set(runId, first + entries.length);
    });
  }

  async readLog(runId: string): Promise<LogRecord[]> {
    const file = this.logFile(checkedRunId(runId));
    return this.queued(file, () => this.readRecords(file));
  }

  private slotOf(name: string): SlotId[] {
    const match = SLOT_FILE.exec(name);
    return match && SLOT_PATTERN.test(match[1]) ? [match[1]] : [];
  }

  private async readSlot(slot: SlotId): Promise<unknown> {
    const file = this.slotFile(slot);
    return this.queued(file, async () => JSON.parse(await readFile(file, 'utf8')) as unknown);
  }

  private slotFile(slot: SlotId): string {
    return join(this.savesDir, `${slot}.json`);
  }

  private logFile(runId: string): string {
    return join(this.logsDir, `${runId}.jsonl`);
  }

  private async seqAfter(runId: string, file: string): Promise<number> {
    const known = this.nextSeq.get(runId);
    if (known !== undefined) return known;
    return (await this.readRecords(file)).length;
  }

  private async readRecords(file: string): Promise<LogRecord[]> {
    const text = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    return text.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as LogRecord);
  }

  private async writeAtomic(dir: string, file: string, text: string): Promise<void> {
    await mkdir(dir, { recursive: true });
    const temp = `${file}.${randomBytes(6).toString('hex')}${TEMP_SUFFIX}`;
    const handle = await open(temp, 'w');
    try {
      await handle.writeFile(text);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, file).catch(async (error: unknown) => {
      await rm(temp, { force: true });
      throw error;
    });
  }

  private queued<T>(file: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(file) ?? Promise.resolve();
    const run = previous.then(work);
    const tail = run.catch(() => undefined);
    this.queues.set(file, tail);
    void tail.then(() => {
      if (this.queues.get(file) === tail) this.queues.delete(file);
    });
    return run;
  }
}
