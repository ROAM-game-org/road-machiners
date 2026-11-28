import { describe, expect, it } from 'vitest';
import type { DriveSnapshot } from '../phys/drive';
import type { World } from '../sim/types';
import { afterBoot, startTurnWorker, type AfterBootSteps, type TurnWorkerHost } from './turn-worker-start';

const terrain = { size: 4 } as unknown as World['terrain'];
const world = { terrain } as unknown as World;
const drive = {} as DriveSnapshot;

function host(calls: string[], ready: { signal: () => void } = { signal: () => {} }): TurnWorkerHost {
  return {
    sendTerrain: (_terrain, onReady) => {
      calls.push('terrain');
      ready.signal = onReady;
    },
    warm: () => {
      calls.push('warm');
      return Promise.resolve();
    },
  };
}

type Start = { boot?: Promise<void>; physics?: Promise<void>; ready?: { signal: () => void } };

function start(calls: string[], { boot = Promise.resolve(), physics = Promise.resolve(), ready }: Start = {}): Promise<void> {
  return startTurnWorker({ host: host(calls, ready), bootFinished: boot, physicsReady: physics, terrain, opening: () => ({ world, drive }), mark: (step) => void calls.push(`mark ${step}`) });
}

function deferred(): { promise: Promise<void>; done: () => void } {
  let done!: () => void;
  const promise = new Promise<void>((resolve) => (done = resolve));
  return { promise, done };
}

describe('the turn worker start', () => {
  it('sends no terrain and warms nothing while the boot runs, even with physics ready', async () => {
    const calls: string[] = [];
    const boot = deferred();

    const started = start(calls, { boot: boot.promise });
    await new Promise((resolve) => setTimeout(resolve));

    expect(calls).toEqual([]);
    boot.done();
    await started;
    expect(calls).toEqual(['terrain', 'warm']);
  });

  it('sends the terrain before it warms, though physics lands later', async () => {
    const calls: string[] = [];
    const physics = deferred();

    const started = start(calls, { physics: physics.promise });
    await new Promise((resolve) => setTimeout(resolve));

    expect(calls).toEqual(['terrain']);
    physics.done();
    await started;
    expect(calls).toEqual(['terrain', 'warm']);
  });

  it('marks the first turn as its own boot step once the worker says its route ground is ready', async () => {
    const calls: string[] = [];
    const physics = deferred();
    const ready = { signal: () => {} };

    const started = start(calls, { physics: physics.promise, ready });
    await new Promise((resolve) => setTimeout(resolve));
    expect(calls).toEqual(['terrain']);
    ready.signal();
    physics.done();
    await started;

    expect(calls).toEqual(['terrain', 'mark running the first turn in the turn worker', 'warm']);
  });
});

function recordingSteps(calls: string[], jobs: { turns?: Promise<void>; tiles?: Promise<void> } = {}): AfterBootSteps {
  return {
    mark: (step) => void calls.push(`mark ${step}`),
    startTurns: () => {
      calls.push('turns');
      return jobs.turns ?? Promise.resolve();
    },
    warmPlans: () => void calls.push('plans'),
    keep: () => void calls.push('keep'),
    tilesFilled: jobs.tiles ?? Promise.resolve(),
    end: () => void calls.push('end'),
  };
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

describe('the boot order', () => {
  it('marks and runs the turn worker, the plan preview, the cache write and the tile fill, each after the one before, then ends the mark', async () => {
    const calls: string[] = [];
    const boot = deferred();
    const turns = deferred();

    const ordered = afterBoot(boot.promise, recordingSteps(calls, { turns: turns.promise }));
    await settle();
    expect(calls).toEqual([]);
    boot.done();
    await settle();
    expect(calls).toEqual(['mark starting the turn worker', 'turns']);
    turns.done();
    await ordered;

    expect(calls).toEqual(['mark starting the turn worker', 'turns', 'mark warming the plans', 'plans', 'mark writing the ground cache', 'keep', 'mark filling the ground tiles', 'end']);
  });

  it('keeps the boot mark while the ground tiles still fill', async () => {
    const calls: string[] = [];
    const tiles = deferred();

    const ordered = afterBoot(Promise.resolve(), recordingSteps(calls, { tiles: tiles.promise }));
    await settle();
    expect(calls).not.toContain('end');
    tiles.done();
    await ordered;

    expect(calls.at(-1)).toBe('end');
  });

  it('still keeps the bake and ends the mark when the turn worker fails to start, and warms no plans', async () => {
    const calls: string[] = [];

    const ordered = afterBoot(Promise.resolve(), { ...recordingSteps(calls), startTurns: () => Promise.reject(new Error('no worker')) });

    await expect(ordered).rejects.toThrow('no worker');
    expect(calls).toEqual(['mark starting the turn worker', 'mark writing the ground cache', 'keep', 'mark filling the ground tiles', 'end']);
  });
});
