import { describe, expect, it } from 'vitest';
import type { DriveSnapshot } from '../phys/drive';
import type { World } from '../sim/types';
import { startTurnWorker, type TurnWorkerHost } from './turn-worker-start';

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
  it('sends no terrain and warms nothing while the ground bake runs, even with physics ready', async () => {
    const calls: string[] = [];
    const bake = deferred();

    const started = startTurnWorker(host(calls), bake.promise, Promise.resolve(), Promise.resolve(), terrain, () => ({ world, drive }));
    await new Promise((resolve) => setTimeout(resolve));

    expect(calls).toEqual([]);
    bake.done();
    await started;
    expect(calls).toEqual(['terrain', 'warm']);
  });

  it('sends the terrain before it warms, though physics lands later', async () => {
    const calls: string[] = [];
    const physics = deferred();

    const started = startTurnWorker(host(calls), Promise.resolve(), Promise.resolve(), physics.promise, terrain, () => ({ world, drive }));
    await new Promise((resolve) => setTimeout(resolve));

    expect(calls).toEqual(['terrain']);
    physics.done();
    await started;
    expect(calls).toEqual(['terrain', 'warm']);
  });

  it('sends nothing before the first frame, then the terrain, then the warm', async () => {
    const calls: string[] = [];
    const frame = deferred();

    const started = startTurnWorker(host(calls), Promise.resolve(), frame.promise, Promise.resolve(), terrain, () => ({ world, drive }));
    await new Promise((resolve) => setTimeout(resolve));

    expect(calls).toEqual([]);
    frame.done();
    await started;
    expect(calls).toEqual(['terrain', 'warm']);
  });
});
