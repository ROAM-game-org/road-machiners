import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { initPhysics } from './drive';
import { driveSnapshotOf, SentObstacles, startTurnWorker, type IdleFailure, type TurnResponse } from './turn';
import { resetPerf } from '../perf';
import { emptyWorld } from '../sim/testkit';
import { buildCellsAround } from '../sim/nav/layer';
import { campWarmSteps } from '../sim/camp-warm';

vi.mock('../sim/nav/layer', async (actual) => {
  const layer = await actual<typeof import('../sim/nav/layer')>();
  return { ...layer, buildCellsAround: vi.fn(layer.buildCellsAround) };
});
vi.mock('../sim/camp-warm', async (actual) => {
  const warm = await actual<typeof import('../sim/camp-warm')>();
  return { ...warm, campWarmSteps: vi.fn(warm.campWarmSteps) };
});

type Answer = Extract<TurnResponse, { turn: unknown }>;

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

function turnWorker() {
  startTurnWorker();
  const worker = self as unknown as { onmessage: (event: { data: unknown }) => Promise<void> };
  const world = emptyWorld();
  const { terrain, ...state } = world;
  const sent = new SentObstacles();
  const request = (id: number) => ({ kind: 'turn', id, questLanguage: 'en', tailSteps: 4, ...sent.split(state), drive: driveSnapshotOf(world), terrain: null });
  return {
    start: () => worker.onmessage({ data: { kind: 'terrain', terrain } }),
    ask: (id: number) => worker.onmessage({ data: request(id) }),
    warm: () => worker.onmessage({ data: { kind: 'warm', ...sent.split(state) } }),
  };
}

function idleFailures(): IdleFailure[] {
  return posted.filter((message): message is IdleFailure => 'idleError' in message);
}

async function idleWorkRuns(): Promise<void> {
  for (let tick = 0; tick < 20; tick++) await new Promise((done) => setTimeout(done, 0));
}

it('sends the work it did between answers with the next answer, apart from the turn', async () => {
  const worker = turnWorker();
  await worker.start();
  await worker.ask(1);
  await idleWorkRuns();
  await worker.ask(2);
  const [first, second] = posted as Answer[];
  expect(posted.map((message) => ('id' in message ? message.id : 'idle'))).toEqual([1, 2]);
  expect(Object.keys(first.idle ?? {})).toContain('route-terrain');
  expect(Object.keys(second.idle ?? {})).toContain('idle');
  expect(Object.keys(second.idle ?? {})).not.toContain('turn');
  expect(second.perf.turn.calls).toBe(1);
  expect(second.perf['route-terrain']).toBeUndefined();
});

it('posts a failure of idle route cells as its own message and ends that idle run', async () => {
  vi.mocked(buildCellsAround).mockImplementationOnce(() => {
    throw new TypeError('idle cells broke');
  });
  vi.mocked(campWarmSteps).mockClear();
  const worker = turnWorker();
  await worker.start();
  await worker.ask(1);
  await idleWorkRuns();
  expect(posted.map((message) => ('id' in message ? message.id : 'idle'))).toEqual([1, 'idle']);
  const [failure] = idleFailures();
  expect(failure.idleError).toMatch(/^TypeError: idle cells broke\n/);
  expect(campWarmSteps).not.toHaveBeenCalled();
});

it('posts a failure of a camp warm step once, skips the steps after it and still answers the next turn', async () => {
  const later = vi.fn();
  vi.mocked(campWarmSteps).mockImplementationOnce(() => [
    () => {
      throw new Error('camp warm broke');
    },
    later,
  ]);
  const worker = turnWorker();
  await worker.start();
  await worker.ask(1);
  await idleWorkRuns();
  await worker.ask(2);
  expect(idleFailures()).toHaveLength(1);
  expect(idleFailures()[0].idleError).toContain('camp warm broke');
  expect(later).not.toHaveBeenCalled();
  const answers = posted.filter((message): message is Answer => 'turn' in message);
  expect(answers.map((answer) => answer.id)).toEqual([1, 2]);
  expect(Object.keys(answers[1].idle ?? {})).toEqual(expect.arrayContaining(['idle', 'camp-warm']));
});

it('builds the nav layers while idle after a warm request, posts nothing for it, and the next answer builds none', async () => {
  const worker = turnWorker();
  await worker.start();
  await worker.warm();
  expect(posted).toEqual([]);
  await idleWorkRuns();
  await worker.ask(1);
  const [answer] = posted as Answer[];
  expect(Object.keys(answer.idle ?? {})).toEqual(expect.arrayContaining(['idle', 'warm-routes']));
  expect(answer.perf['nav-layer']).toBeUndefined();
});

it('answers a turn after a warm request with the same turn a cold worker gives', async () => {
  const cold = turnWorker();
  await cold.start();
  await cold.ask(1);
  const [coldAnswer] = posted as Answer[];
  posted.length = 0;
  const warmed = turnWorker();
  await warmed.start();
  await warmed.warm();
  await idleWorkRuns();
  await warmed.ask(1);
  const [warmAnswer] = posted as Answer[];
  expect(warmAnswer.turn.world).toEqual(coldAnswer.turn.world);
  expect(warmAnswer.turn.result.frames).toEqual(coldAnswer.turn.result.frames);
});

it('answers a request that arrives while warm slices remain and ends that warm run', async () => {
  const worker = turnWorker();
  await worker.start();
  await worker.warm();
  await worker.ask(1);
  expect(posted.map((message) => ('id' in message ? message.id : 'idle'))).toEqual([1]);
  await idleWorkRuns();
  expect(posted).toHaveLength(1);
});

it('fails a warm request that comes before any terrain', async () => {
  const worker = turnWorker();
  await expect(worker.warm()).rejects.toThrow('Turn worker has no terrain');
});
