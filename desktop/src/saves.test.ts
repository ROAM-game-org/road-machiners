import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileSaves } from './saves';

let root: string;
let saves: FileSaves;
const savesDir = () => join(root, 'saves');
const logsDir = () => join(root, 'logs');

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'roam-saves-'));
  saves = new FileSaves(savesDir(), logsDir());
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('file saves', () => {
  it('makes the folder on the first write', async () => {
    await saves.put('auto', { turn: 1 });

    expect(await readdir(savesDir())).toEqual(['auto.json']);
  });

  it('reads back what was written, after the rename', async () => {
    await saves.put('slot2', { turn: 7, nested: { a: [1, 2] } });
    await saves.put('auto', { turn: 3 });

    const read = new Map(await saves.readAll());

    expect(read.get('slot2')).toEqual({ turn: 7, nested: { a: [1, 2] } });
    expect(read.get('auto')).toEqual({ turn: 3 });
    expect(read.size).toBe(2);
  });

  it('reads an empty list before any write', async () => {
    expect(await saves.readAll()).toEqual([]);
  });

  it('leaves no temp file behind after a write', async () => {
    await saves.put('auto', { turn: 1 });
    await saves.put('auto', { turn: 2 });

    expect(await readdir(savesDir())).toEqual(['auto.json']);
  });

  it('keeps the last good save when a write died before the rename', async () => {
    await saves.put('auto', { turn: 1 });
    await writeFile(join(savesDir(), 'auto.json.deadbeef.tmp'), '{"turn": 2, "cut off');

    const read = await new FileSaves(savesDir(), logsDir()).readAll();

    expect(read).toEqual([['auto', { turn: 1 }]]);
    expect(await readdir(savesDir())).toEqual(['auto.json']);
  });

  it('ends with the newest value when writes to one slot overlap', async () => {
    const writes = Array.from({ length: 20 }, (_, turn) => saves.put('auto', { turn }));
    await Promise.all(writes);

    expect(JSON.parse(await readFile(join(savesDir(), 'auto.json'), 'utf8'))).toEqual({ turn: 19 });
  });

  it('removes a slot, and removing a missing slot is fine', async () => {
    await saves.put('day', { turn: 1 });

    await saves.remove('day');
    await saves.remove('day');

    expect(await saves.readAll()).toEqual([]);
  });

  it('refuses a damaged save file loudly', async () => {
    await mkdir(savesDir(), { recursive: true });
    await writeFile(join(savesDir(), 'auto.json'), '{"turn": ');

    await expect(saves.readAll()).rejects.toThrow();
  });

  it('refuses a slot id that is not a slot', async () => {
    await expect(saves.put('../evil', {})).rejects.toThrow(/Not a save slot/);
    await expect(saves.remove('auto/../../x')).rejects.toThrow(/Not a save slot/);
    await expect(saves.put(7 as unknown as string, {})).rejects.toThrow(/Not a save slot/);
  });

  it('ignores files in the folder that are not slots', async () => {
    await mkdir(savesDir(), { recursive: true });
    await writeFile(join(savesDir(), 'notes.json'), '{}');
    await saves.put('slot1', { turn: 1 });

    expect((await saves.readAll()).map(([slot]) => slot)).toEqual(['slot1']);
  });
});

describe('file run log', () => {
  it('numbers records from 0 across appends and reads them back', async () => {
    await saves.appendLog('run-1', [{ kind: 'a', turn: 1 }, { kind: 'b', turn: 2 }]);
    await saves.appendLog('run-1', [{ kind: 'c', turn: 3 }]);

    expect(await saves.readLog('run-1')).toEqual([
      { kind: 'a', turn: 1, runId: 'run-1', seq: 0 },
      { kind: 'b', turn: 2, runId: 'run-1', seq: 1 },
      { kind: 'c', turn: 3, runId: 'run-1', seq: 2 },
    ]);
  });

  it('continues the numbering after a restart', async () => {
    await saves.appendLog('run-1', [{ kind: 'a', turn: 1 }]);
    const later = new FileSaves(savesDir(), logsDir());

    await later.appendLog('run-1', [{ kind: 'b', turn: 2 }]);

    expect((await later.readLog('run-1')).map((r) => r.seq)).toEqual([0, 1]);
  });

  it('keeps runs apart and reads an unknown run as empty', async () => {
    await saves.appendLog('run-1', [{ kind: 'a', turn: 1 }]);

    expect(await saves.readLog('run-2')).toEqual([]);
  });

  it('numbers overlapping appends without gaps or repeats', async () => {
    await Promise.all(Array.from({ length: 10 }, (_, turn) => saves.appendLog('run-1', [{ kind: 'a', turn }])));

    expect((await saves.readLog('run-1')).map((r) => r.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('refuses a run id that could leave the folder', async () => {
    await expect(saves.appendLog('../../x', [{ kind: 'a', turn: 1 }])).rejects.toThrow(/Not a run id/);
    await expect(saves.readLog('a/b')).rejects.toThrow(/Not a run id/);
  });
});
