import { describe, expect, it } from 'vitest';
import { startKit } from '../data/start';
import { defaultSetup } from '../sim/settings';
import type { World } from '../sim/types';
import { cloneWorld, newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { RunLog } from './run-log';
import { DatabaseLost, memoryBackend } from './save-db';

function start(): World {
  return { ...newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming')), turn: 400 };
}

function after(world: World, change: (w: World) => void): World {
  const next = cloneWorld(world);
  next.events = [];
  change(next);
  return next;
}

describe('RunLog', () => {
  it('numbers records on across sessions and tabs, and writes a world once', async () => {
    const backend = memoryBackend();
    const errors: unknown[] = [];
    const world = start();
    const first = new RunLog(backend, 'run', 'v', (e) => errors.push(e));
    const otherTab = new RunLog(backend, 'run', 'v', (e) => errors.push(e));
    first.begin(world, null);
    otherTab.begin(world, 'auto');
    const next = after(world, (w) => { w.player.money += 10; });
    first.note(next);
    first.note(next);
    await Promise.all([first.flush(), otherTab.flush()]);
    const second = new RunLog(backend, 'run', 'v', (e) => errors.push(e));
    second.begin(world, 'slot1');
    await second.flush();

    const records = await backend.readLog('run');

    expect(records.map((r) => r.seq)).toEqual(records.map((_, i) => i));
    expect(records.filter((r) => r.kind === 'session').map((r) => r.from)).toEqual(['new', 'auto', 'slot1']);
    expect(records.filter((r) => r.kind === 'player' && r.money === world.player.money + 10)).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it('sends a synchronous backend throw to onError once', async () => {
    const throwing = { ...memoryBackend(), appendLog: () => { throw new Error('closing'); } };
    const errors: unknown[] = [];
    const log = new RunLog(throwing, 'run', 'v', (e) => errors.push(e));

    expect(() => log.begin(start(), null)).not.toThrow();
    await log.flush();

    expect(errors.map((e) => (e as Error).message)).toEqual(['closing']);
  });

  it('writes the events of a world once when a later world shares them', async () => {
    const backend = memoryBackend();
    const world = start();
    const log = new RunLog(backend, 'run', 'v', () => {});
    log.begin(world, null);
    const turn = after(world, (w) => { w.events.push({ t: 'skillUp', skill: 'driving', level: 2 }); });
    log.note(turn);
    log.note({ ...turn, player: { ...turn.player, money: turn.player.money + 25 } });
    await log.flush();

    const records = await backend.readLog('run');

    expect(records.filter((r) => r.kind === 'event')).toHaveLength(1);
    expect(records.filter((r) => r.kind === 'player' && r.money === turn.player.money + 25)).toHaveLength(1);
  });

  it('does not write the events of a loaded world again', async () => {
    const backend = memoryBackend();
    const world = after(start(), (w) => { w.events.push({ t: 'skillUp', skill: 'driving', level: 2 }); });
    const log = new RunLog(backend, 'run', 'v', () => {});
    log.begin(world, 'auto');
    await log.flush();
    expect((await backend.readLog('run')).filter((r) => r.kind === 'event')).toEqual([]);
  });

  it('exports JSON Lines with the header first', async () => {
    const log = new RunLog(memoryBackend(), 'run', 'v', () => {});
    log.begin(start(), null);
    await log.flush();

    const lines = (await log.lines({ kind: 'header', runId: 'run' })).trim().split('\n').map((l) => JSON.parse(l));

    expect(lines.slice(0, 3).map((l) => l.kind)).toEqual(['header', 'session', 'player']);
  });

  it('writes a resync keyframe after a failed write, so no delta sits on a base the log never stored', async () => {
    const backend = memoryBackend();
    let fail = true;
    const flaky = { ...backend, appendLog: (id: string, entries: Parameters<typeof backend.appendLog>[1]) => (fail ? Promise.reject(new Error('Quota exceeded')) : backend.appendLog(id, entries)) };
    const world = start();
    const log = new RunLog(flaky, 'run', 'v', () => {});
    log.begin(world, null);
    await log.flush();
    fail = false;
    log.note(after(world, (w) => { w.turn += 1; w.player.money += 5; }));
    await log.flush();

    const records = await backend.readLog('run');

    expect(records.map((r) => r.kind).slice(0, 2)).toEqual(['session', 'player']);
    expect(records[0]).toMatchObject({ from: 'resync' });
    expect(records.find((r) => r.kind === 'player')).toMatchObject({ money: world.player.money + 5 });
  });

  it('gives each log its own session id on every line', async () => {
    const backend = memoryBackend();
    const world = start();
    const one = new RunLog(backend, 'run', 'v', () => {});
    const two = new RunLog(backend, 'run', 'v', () => {});
    one.begin(world, null);
    two.begin(world, null);
    await Promise.all([one.flush(), two.flush()]);
    const ids = new Set((await backend.readLog('run')).map((r) => r.sid));
    expect(ids.size).toBe(2);
    expect(ids.has(undefined)).toBe(false);
  });

  it('sends a refused write to onError', async () => {
    const errors: unknown[] = [];
    const refusing = { ...memoryBackend(), appendLog: () => Promise.reject(new Error('Quota exceeded')) };
    const log = new RunLog(refusing, 'run', 'v', (e) => errors.push(e));
    log.begin(start(), null);
    await log.flush();
    expect(errors.map((e) => (e as Error).message)).toEqual(['Quota exceeded']);
  });

  it('writes a resync keyframe and shows no save note after the database is lost', async () => {
    const backend = memoryBackend();
    let lost = true;
    const losing = { ...backend, appendLog: (id: string, entries: Parameters<typeof backend.appendLog>[1]) => (lost ? Promise.reject(new DatabaseLost('roam.save', new DOMException('Lost.', 'InvalidStateError'))) : backend.appendLog(id, entries)) };
    const errors: unknown[] = [];
    const world = start();
    const log = new RunLog(losing, 'run', 'v', (e) => errors.push(e));
    log.begin(world, null);
    await log.flush();
    lost = false;
    log.note(after(world, (w) => { w.turn += 1; }));
    await log.flush();

    const records = await backend.readLog('run');

    expect(errors).toEqual([]);
    expect(records[0]).toMatchObject({ kind: 'session', from: 'resync' });
  });
});
