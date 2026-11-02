import { describe, expect, it } from 'vitest';
import { allocationLines, allocationReport, measureWindows, profileLines, profileReport, type TraceEvent } from '../../scripts/perf-profile.mjs';

const PID = 1;
const MAIN = 10;
const WORKER = 20;
const OTHER_WORKER = 30;

const frame = (functionName: string, url = 'http://x/assets/index-abc.js', lineNumber = 4) => ({ functionName, url, lineNumber, columnNumber: 0 });
const thread = (tid: number, name: string): TraceEvent => ({ ph: 'M', name: 'thread_name', pid: PID, tid, args: { name } });
const measure = (name: string, id: string, fromMs: number, toMs: number): TraceEvent[] => [
  { ph: 'b', cat: 'blink.user_timing', name, pid: PID, tid: MAIN, id2: { local: id }, ts: fromMs * 1000 },
  { ph: 'e', cat: 'blink.user_timing', name, pid: PID, tid: MAIN, id2: { local: id }, ts: toMs * 1000 },
];

function profile(tid: number, id: string, startMs: number, nodes: Record<number, ReturnType<typeof frame>>, samples: number[], stepMs: number): TraceEvent[] {
  const callFrames = Object.entries(nodes).map(([nodeId, callFrame]) => ({ id: Number(nodeId), callFrame }));
  const half = Math.ceil(samples.length / 2);
  const chunk = (from: number, to: number, withNodes: boolean): TraceEvent => ({
    name: 'ProfileChunk', ph: 'P', pid: PID, tid, id,
    args: { data: { cpuProfile: { nodes: withNodes ? callFrames : [], samples: samples.slice(from, to) }, timeDeltas: samples.slice(from, to).map(() => stepMs * 1000) } },
  });
  return [{ name: 'Profile', ph: 'P', pid: PID, tid, id, args: { data: { startTime: (startMs - stepMs) * 1000 } } }, chunk(0, half, true), chunk(half, samples.length, false)];
}

const NODES = { 1: frame('(root)', ''), 2: frame('(idle)', ''), 3: frame('render', 'http://x/assets/three-1.js', 99), 4: frame('tick', 'http://x/assets/index-abc.js', 11), 5: frame('(program)', '') };

function trace(extra: TraceEvent[] = []): TraceEvent[] {
  const mainSamples = [2, 2, 3, 3, 3, 4, 2, 2, 5, 5, 2, 2];
  const workerSamples = [2, 4, 4, 4, 4, 2, 2, 2, 2, 2, 2, 2];
  const otherSamples = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
  return [
    thread(MAIN, 'CrRendererMain'), thread(WORKER, 'DedicatedWorker thread'), thread(OTHER_WORKER, 'DedicatedWorker thread'),
    ...profile(MAIN, '0x1', 0, NODES, mainSamples, 10),
    ...profile(WORKER, '0x2', 0, NODES, workerSamples, 10),
    ...profile(OTHER_WORKER, '0x3', 0, NODES, otherSamples, 10),
    ...extra,
  ];
}

const slow = (scene: string, from: number, to: number) => measure(`bench:slow-frame:${scene}`, `s${from}`, from, to);
const turn = (scene: string, from: number, to: number) => measure(`bench:turn:${scene}`, `t${from}`, from, to);

function onlyGroup(events: TraceEvent[], kind: string) {
  const group = profileReport(events).groups.find((candidate) => candidate.kind === kind);
  if (!group) throw new Error(`no ${kind} group`);
  return group;
}

describe('measureWindows', () => {
  it('pairs begin and end events by name and id and converts microseconds to milliseconds', () => {
    const windows = measureWindows([...slow('a', 20, 50), ...turn('b', 60, 90)]);
    expect(windows).toMatchObject([
      { kind: 'slowFrames', scene: 'a', from: 20, to: 50, tid: MAIN },
      { kind: 'turns', scene: 'b', from: 60, to: 90 },
    ]);
  });

  it('throws on an end with no begin', () => {
    expect(() => measureWindows([slow('a', 0, 10)[1]])).toThrow('no begin');
  });
});

describe('profileReport self time', () => {
  it('sums the self time of each function inside a slow frame window and ranks it', () => {
    const group = onlyGroup(trace(slow('town-day', 20, 100)), 'slowFrames');
    expect(group.top.map((entry) => [entry.name, entry.ms])).toEqual([['render', 30], ['(program)', 20], ['tick', 10]]);
    expect(group.windowMs).toBe(80);
  });

  it('keeps the file and the one based line and gives the percent of window time', () => {
    const [top] = onlyGroup(trace(slow('town-day', 20, 100)), 'slowFrames').top;
    expect(top).toMatchObject({ name: 'render', file: 'three-1.js', line: 100, pct: 37.5 });
  });

  it('leaves idle and root out of the ranking but counts them in the window', () => {
    const group = onlyGroup(trace(slow('town-day', 0, 20)), 'slowFrames');
    expect(group.top).toEqual([]);
    expect(group.busyMs).toBe(0);
    expect(group.windowMs).toBe(20);
  });
});

describe('profileReport window clipping', () => {
  it('counts only the part of a sample that lies inside the window', () => {
    const group = onlyGroup(trace(slow('town-day', 25, 45)), 'slowFrames');
    expect(group.top.map((entry) => [entry.name, entry.ms])).toEqual([['render', 20]]);
  });

  it('adds up several windows of one scene and keeps scenes apart', () => {
    const events = trace([...slow('town-day', 20, 30), ...slow('town-day', 40, 60), ...slow('drive', 50, 60)]);
    const groups = profileReport(events).groups.filter((group) => group.kind === 'slowFrames');
    const day = groups.find((group) => group.scene === 'town-day');
    expect(day?.windows).toBe(2);
    expect(day?.top.map((entry) => [entry.name, entry.ms])).toEqual([['render', 20], ['tick', 10]]);
    expect(groups.find((group) => group.scene === 'drive')?.top.map((entry) => entry.name)).toEqual(['tick']);
  });
});

describe('profileReport thread split', () => {
  const events = trace(turn('fight', 10, 60));

  it('reads the turn window on the busiest worker thread, never on the main thread', () => {
    const group = onlyGroup(events, 'workerTurns');
    expect(group.thread).toBe(`worker ${PID}:${OTHER_WORKER}`);
    expect(group.top.map((entry) => entry.name)).toEqual(['render']);
  });

  it('reads the same window on the main thread as its own group', () => {
    const group = onlyGroup(events, 'mainTurns');
    expect(group.thread).toBe(`main ${PID}:${MAIN}`);
    expect(group.top.map((entry) => [entry.name, entry.ms])).toEqual([['render', 30], ['tick', 10]]);
  });

  it('does not mix worker samples into slow frame windows', () => {
    const group = onlyGroup(trace(slow('town-day', 10, 60)), 'slowFrames');
    expect(group.top.map((entry) => entry.name)).toEqual(['render', 'tick']);
  });
});

describe('profileReport errors', () => {
  it('throws when the main thread has no profile', () => {
    const events = trace(slow('town-day', 0, 10)).filter((event) => event.tid !== MAIN || event.ph !== 'P');
    expect(() => profileReport(events)).toThrow('no CPU profile for the main thread');
  });

  it('throws when a turn window has no worker profile', () => {
    const events = trace(turn('fight', 0, 10)).filter((event) => event.tid === MAIN || event.ph === 'b' || event.ph === 'e');
    expect(() => profileReport(events)).toThrow('no CPU profile for a dedicated worker');
  });

  it('throws when the trace holds no bench measures', () => {
    expect(() => profileReport(trace())).toThrow('no bench: measures');
  });

  it('throws on a chunk with no profile', () => {
    expect(() => profileReport(trace(slow('a', 0, 10)).slice(3).filter((event) => event.name !== 'Profile'))).toThrow('no Profile event');
  });
});

describe('profileLines', () => {
  it('names the scene, the function and its file and line', () => {
    const text = profileLines(profileReport(trace(slow('town-day', 20, 100)))).join('\n');
    expect(text).toContain('Slow frames, main thread, town-day');
    expect(text).toContain('render three-1.js:100');
  });
});

describe('allocation report', () => {
  const node = (functionName: string, selfSize: number, children: ReturnType<typeof frame>[] | unknown[] = []) => ({ callFrame: frame(functionName, 'http://x/assets/index-abc.js', 9), selfSize, children });

  it('ranks the functions that allocated most with the function that called them, adding the same pair across call paths', () => {
    const clones = [node('clone', 5e6), node('clone', 1e6)];
    const head = node('(root)', 0, [node('post', 3e6, [clones[0]]), node('tick', 1e6, [clones[1]]), node('post', 1e6, [node('clone', 2e6)])]);
    const report = allocationReport({ head } as never);
    expect(report.totalMb).toBeCloseTo(13, 5);
    expect(report.top.map((entry) => [entry.name, entry.caller.name, entry.mb])).toEqual([['clone', 'post', 7], ['post', '(root)', 4], ['tick', '(root)', 1], ['clone', 'tick', 1]]);
    expect(allocationLines(report).join('\n')).toContain('clone index-abc.js:10 called by post index-abc.js:10');
  });

  it('fails when the sampling profile holds no allocations', () => {
    expect(() => allocationReport({ head: node('(root)', 0) } as never)).toThrow('no allocations');
  });
});
