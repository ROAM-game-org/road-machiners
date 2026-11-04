import { afterEach, expect, it, vi } from 'vitest';
import { chaosHighwayStart } from '../sim/testkit';
import { driveSnapshotOf, startTurnWorker, type WorkerRequest } from './turn';
import { initPhysics } from './drive';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (globalThis as { onmessage?: unknown }).onmessage;
});

it('keeps the highway worker alive through preview, idle preparation and the first turn', async () => {
  await initPhysics();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const postMessage = vi.fn();
  vi.stubGlobal('self', globalThis);
  vi.stubGlobal('postMessage', postMessage);
  const worker = globalThis as unknown as { onmessage: (event: { data: WorkerRequest }) => Promise<void> };
  startTurnWorker();
  const world = chaosHighwayStart(1);
  const drive = driveSnapshotOf(world);
  const { terrain, obstacles, ...state } = world;
  const task = { world: state, drive, terrain, obstacles: { kind: 'full' as const, list: obstacles }, questLanguage: 'en' as const };

  await worker.onmessage!({ data: { ...task, kind: 'preview', id: 1, meId: world.player.vehicleId } });
  expect(postMessage.mock.calls[0][0].error).toBeUndefined();
  expect(postMessage.mock.calls[0][0]).toMatchObject({ id: 1, preview: { turns: expect.any(Array) } });
  await vi.runAllTimersAsync();

  await worker.onmessage!({ data: { ...task, kind: 'turn', id: 2, tailSteps: 0, fastTravel: false } });
  expect(postMessage.mock.calls[1][0].error).toBeUndefined();
  expect(postMessage.mock.calls[1][0]).toMatchObject({ id: 2, turn: { world: { turn: world.turn + 1 } } });
  await vi.runAllTimersAsync();
});
