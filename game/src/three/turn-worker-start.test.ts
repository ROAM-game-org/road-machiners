import { describe, expect, it } from 'vitest';
import type { DriveSnapshot } from '../phys/drive';
import type { World } from '../sim/types';
import { afterBoot, startTurnWorker, type TurnWorkerHost } from './turn-worker-start';

const terrain = { size: 4 } as unknown as World['terrain'];
const world = { terrain } as unknown as World;
const drive = {} as DriveSnapshot;

function host(calls: string[]): TurnWorkerHost {
  return {
    sendTerrain: () => void calls.push('terrain'),
    warm: () => {
      calls.push('warm');
      return Promise.resolve();
    },
  };
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

    const started = startTurnWorker(host(calls), boot.promise, Promise.resolve(), terrain, () => ({ world, drive }));
    await new Promise((resolve) => setTimeout(resolve));

    expect(calls).toEqual([]);
    boot.done();
    await started;
    expect(calls).toEqual(['terrain', 'warm']);
  });

  it('sends the terrain before it warms, though physics lands later', async () => {
    const calls: string[] = [];
    const physics = deferred();

    const started = startTurnWorker(host(calls), Promise.resolve(), physics.promise, terrain, () => ({ world, drive }));
    await new Promise((resolve) => setTimeout(resolve));

    expect(calls).toEqual(['terrain']);
    physics.done();
    await started;
    expect(calls).toEqual(['terrain', 'warm']);
  });
});

describe('the boot order', () => {
  it('starts the turn worker, then the plan preview, then the cache write, each after the one before', async () => {
    const calls: string[] = [];
    const boot = deferred();
    const turns = deferred();

    const ordered = afterBoot(
      boot.promise,
      () => {
        calls.push('turns');
        return turns.promise;
      },
      () => void calls.push('plans'),
      () => void calls.push('keep'),
    );
    await new Promise((resolve) => setTimeout(resolve));
    expect(calls).toEqual([]);
    boot.done();
    await new Promise((resolve) => setTimeout(resolve));
    expect(calls).toEqual(['turns']);
    turns.done();
    await ordered;
    expect(calls).toEqual(['turns', 'plans', 'keep']);
  });
});
