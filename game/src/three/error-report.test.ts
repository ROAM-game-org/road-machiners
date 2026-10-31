import { describe, expect, it, vi } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { emptyWorld } from '../sim/testkit';
import type { World } from '../sim/types';
import type { DriveSnapshot } from '../phys/drive';
import { ErrorReporter, GameContext, type ErrorReport } from './error-report';
import { writeSave } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { TurnFailure } from './travel';

function makeSlots(): SaveSlots {
  return new SaveSlots(memoryBackend(), new Map());
}

type Sent = { url: string; report: ErrorReport };

vi.stubGlobal('document', { documentElement: { lang: 'ru' } });
vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2 });

type Watched = { reporter: ErrorReporter; context: GameContext };

const failures = vi.fn();

function reporter(status = 200): Watched & { sent: Sent[] } {
  const sent: Sent[] = [];
  const post = async (url: string, init: RequestInit): Promise<Response> => {
    const bytes = new Uint8Array(await (init.body as Blob).arrayBuffer());
    sent.push({ url, report: JSON.parse(gunzipSync(bytes).toString('utf8')) as ErrorReport });
    return new Response(null, { status });
  };
  const context = new GameContext('dev', '3.4.5+abc1234', failures);
  return { reporter: new ErrorReporter('https://factory.test/errors', context, post), context, sent };
}

function watching(r: Watched, world: World, slots = makeSlots()): void {
  r.context.watchSaves(slots);
  r.context.watch({ world: () => world, log: () => ['Day 2 08:00 Sold scrap', 'Day 2 07:30 Arrived'] });
}

describe('error reports', () => {
  it('sends the error, the world in memory, the log and an older autosave', async () => {
    const slots = makeSlots();
    writeSave(slots, 'auto', { ...emptyWorld(), turn: 40 }, 'run-1', 1);
    const { sent, ...r } = reporter();
    watching(r, { ...emptyWorld(), turn: 44 }, slots);

    await r.reporter.report(new RangeError('wheel 7 has no axle'));

    expect(sent).toHaveLength(1);
    const { url, report } = sent[0];
    expect(url).toBe('https://factory.test/errors');
    expect(report).toMatchObject({ build: 'dev', version: '3.4.5+abc1234', language: 'ru', turn: 44, autosaveIsWorld: false, drive: null });
    expect(report.screen).toEqual({ width: 1280, height: 720, pixelRatio: 2, uiSize: 1 });
    expect(report.error).toMatchObject({ name: 'RangeError', message: 'wheel 7 has no axle' });
    expect(report.error.stack).toContain('wheel 7 has no axle');
    expect(report.log).toEqual(['Day 2 08:00 Sold scrap', 'Day 2 07:30 Arrived']);
    expect((report.world as { world: { turn: number } }).world.turn).toBe(44);
    expect((JSON.parse(report.autosave ?? '') as { world: { turn: number } }).world.turn).toBe(40);
  });

  it('marks an autosave of the same turn as the world in memory and does not send it twice', async () => {
    const slots = makeSlots();
    writeSave(slots, 'auto', { ...emptyWorld(), turn: 44 }, 'run-1', 1);
    const { sent, ...r } = reporter();
    watching(r, { ...emptyWorld(), turn: 44 }, slots);

    await r.reporter.report(new Error('boom'));

    expect(sent[0].report).toMatchObject({ autosave: null, autosaveIsWorld: true });
  });

  it('reports a boot error with no world', async () => {
    const { sent, ...r } = reporter();

    await r.reporter.report('map fetch failed');

    expect(sent[0].report).toMatchObject({ turn: null, world: null, log: [], autosave: null, autosaveIsWorld: false });
    expect(sent[0].report.error).toEqual({ name: 'NonError', message: 'map fetch failed', stack: '' });
  });

  it('holds the autosave once the slots are watched, before any world exists', async () => {
    const slots = makeSlots();
    writeSave(slots, 'auto', { ...emptyWorld(), turn: 12 }, 'run-1', 1);
    const { sent, ...r } = reporter();
    r.context.watchSaves(slots);

    await r.reporter.report('load hung');

    expect(sent[0].report).toMatchObject({ turn: null, world: null, log: [], autosaveIsWorld: false });
    expect((JSON.parse(sent[0].report.autosave ?? '') as { world: { turn: number } }).world.turn).toBe(12);
  });

  it('sends world null with the autosave when the world source throws', async () => {
    const slots = makeSlots();
    writeSave(slots, 'auto', { ...emptyWorld(), turn: 12 }, 'run-1', 1);
    const { sent, ...r } = reporter();
    const broken = new Error('world gone');
    r.context.watchSaves(slots);
    r.context.watch({ world: () => { throw broken; }, log: () => ['line'] });
    failures.mockClear();

    await r.reporter.report(new Error('boom'));

    expect(sent[0].report).toMatchObject({ turn: null, world: null, log: [], autosaveIsWorld: false });
    expect(sent[0].report.autosave).not.toBeNull();
    expect(failures).toHaveBeenCalledTimes(1);
    expect(failures).toHaveBeenCalledWith(broken);
  });

  it('sends world null when the world cannot be written into the report', async () => {
    const { sent, ...r } = reporter();
    const base = emptyWorld();
    const unwritable: World = { ...base, turn: 5, player: { ...base.player, explored: new Uint8Array([7]) } };
    watching(r, unwritable);
    failures.mockClear();

    await r.reporter.report(new Error('boom'));

    expect(sent[0].report).toMatchObject({ turn: null, world: null, log: [] });
    expect(failures).toHaveBeenCalledTimes(1);
  });

  it('sends a repeated error once per session', async () => {
    const { sent, ...r } = reporter();

    await r.reporter.report(new Error('every frame'));
    await r.reporter.report(new Error('every frame'));
    await r.reporter.report(new TypeError('every frame'));

    expect(sent.map((s) => `${s.report.error.name}: ${s.report.error.message}`)).toEqual(['Error: every frame', 'TypeError: every frame']);
  });

  it('carries a failed turn with the worker stack and its start drive', async () => {
    const { sent, ...r } = reporter();
    watching(r, { ...emptyWorld(), turn: 9 });
    const drive = { bodies: { player: 3 }, rears: {}, couplings: {}, shapes: { player: 'scout' }, obstacles: {}, craters: {}, ramps: {}, memory: {}, terrain: { handle: 1, x0: 0, z0: 0 }, decks: [], snapshot: new Uint8Array([0, 1, 254, 255]) } satisfies DriveSnapshot;
    const workerStack = 'TypeError: no route\n    at planRoute (turn-abc.js:1:200)';

    await r.reporter.report(new TurnFailure(workerStack, drive));

    const report = sent[0].report;
    expect(report.error).toEqual({ name: 'TypeError', message: 'no route', stack: workerStack });
    expect(report.drive).toEqual({ bodies: { player: 3 }, rears: {}, couplings: {}, shapes: { player: 'scout' }, obstacles: {}, craters: {}, ramps: {}, memory: {}, terrain: { handle: 1, x0: 0, z0: 0 }, decks: [], snapshot: 'AAH+/w==' });
  });

  it('only warns when the endpoint refuses, so the game goes on', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { sent, ...r } = reporter(429);

    await expect(r.reporter.report(new Error('boom'))).resolves.toBeUndefined();

    expect(sent).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith('Error report not sent:', new Error('the error endpoint answered 429'));
    warn.mockRestore();
  });
});
