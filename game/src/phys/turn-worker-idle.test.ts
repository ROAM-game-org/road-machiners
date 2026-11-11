import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { initPhysics } from './drive';
import { driveSnapshotOf, SentObstacles, startTurnWorker, type TurnResponse } from './turn';
import { resetPerf } from '../perf';
import { emptyWorld } from '../sim/testkit';

type Answer = Exclude<TurnResponse, { error: string }>;

const posted: TurnResponse[] = [];

beforeAll(initPhysics);
beforeEach(() => {
  posted.length = 0;
  resetPerf();
  vi.stubGlobal('self', globalThis);
  vi.stubGlobal('postMessage', (message: TurnResponse) => void posted.push(message));
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as { onmessage?: unknown }).onmessage;
});

async function idleWorkRuns(): Promise<void> {
  for (let tick = 0; tick < 20; tick++) await new Promise((done) => setTimeout(done, 0));
}

it('sends the work it did between answers with the next answer, apart from the turn', async () => {
  startTurnWorker();
  const worker = self as unknown as { onmessage: (event: { data: unknown }) => Promise<void> };
  const world = emptyWorld();
  const { terrain, ...state } = world;
  const sent = new SentObstacles();
  const request = (id: number) => ({ kind: 'turn', id, questLanguage: 'en', tailSteps: 4, ...sent.split(state), drive: driveSnapshotOf(world), terrain: null });
  await worker.onmessage({ data: { kind: 'terrain', terrain } });
  await worker.onmessage({ data: request(1) });
  await idleWorkRuns();
  await worker.onmessage({ data: request(2) });
  const [first, second] = posted as Answer[];
  expect(posted.map((answer) => answer.id)).toEqual([1, 2]);
  expect(Object.keys(first.idle ?? {})).toContain('route-terrain');
  expect(Object.keys(second.idle ?? {})).toContain('idle');
  expect(Object.keys(second.idle ?? {})).not.toContain('turn');
  expect(second.perf.turn.calls).toBe(1);
  expect(second.perf['route-terrain']).toBeUndefined();
});
