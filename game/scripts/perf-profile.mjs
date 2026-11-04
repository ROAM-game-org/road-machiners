export const TOP_COUNT = 10;
const US_PER_MS = 1000;
const IDLE_NAMES = new Set(['(idle)', '(root)']);
const WORKER_THREAD = /^DedicatedWorker/;
const KINDS = { 'slow-frame': 'slowFrames', turn: 'turns' };

function eventsOf(trace) {
  const events = Array.isArray(trace) ? trace : trace.traceEvents;
  if (!Array.isArray(events)) throw new Error('The trace has no traceEvents list');
  return events;
}

const idOf = (event) => String(event.id ?? event.id2?.local ?? event.id2?.global);

function windowOf(open, event) {
  const key = `${event.name}|${event.pid}|${idOf(event)}`;
  const begin = open.get(key);
  if (!begin) throw new Error(`The trace has an end of ${event.name} with no begin`);
  open.delete(key);
  const [, kind, scene] = event.name.split(':');
  if (!KINDS[kind]) throw new Error(`Unknown bench measure ${event.name}`);
  return { kind: KINDS[kind], scene, pid: begin.pid, tid: begin.tid, from: begin.ts / US_PER_MS, to: event.ts / US_PER_MS };
}

const isBenchMeasure = (event) => typeof event.name === 'string' && event.name.startsWith('bench:') && String(event.cat).includes('blink.user_timing');

export function measureWindows(events) {
  const open = new Map();
  const windows = [];
  for (const event of events.filter(isBenchMeasure)) {
    if (event.ph === 'b') open.set(`${event.name}|${event.pid}|${idOf(event)}`, event);
    if (event.ph === 'e') windows.push(windowOf(open, event));
  }
  return windows.sort((a, b) => a.from - b.from);
}

const profileKey = (event) => `${event.pid}:${idOf(event)}`;

function chunkInto(profile, event) {
  const { nodes, samples, deltas } = chunkParts(event.args.data);
  for (const node of nodes) profile.nodes.set(node.id, node.callFrame);
  profile.samples.push(...samples);
  profile.deltas.push(...deltas);
}

function chunkParts(data) {
  const cpu = data.cpuProfile ?? {};
  return { nodes: cpu.nodes ?? [], samples: cpu.samples ?? [], deltas: data.timeDeltas ?? [] };
}

function profilesOf(events) {
  const profiles = new Map();
  for (const event of events) {
    if (event.name === 'Profile') profiles.set(profileKey(event), { pid: event.pid, tid: event.tid, start: event.args.data.startTime, nodes: new Map(), samples: [], deltas: [] });
    if (event.name === 'ProfileChunk') chunkInto(profiles.get(profileKey(event)) ?? failChunk(event), event);
  }
  return [...profiles.values()];
}

function failChunk(event) {
  throw new Error(`The trace has a ProfileChunk ${profileKey(event)} with no Profile event`);
}

function intervalsOf(profile) {
  let at = profile.start;
  const times = profile.deltas.map((delta) => (at += delta) / US_PER_MS);
  return times.slice(0, -1).map((from, i) => ({ from, to: times[i + 1], frame: profile.nodes.get(profile.samples[i]) }));
}

function threadsOf(events) {
  const intervals = new Map();
  for (const profile of profilesOf(events)) {
    const key = `${profile.pid}:${profile.tid}`;
    intervals.set(key, [...(intervals.get(key) ?? []), ...intervalsOf(profile)]);
  }
  for (const list of intervals.values()) list.sort((a, b) => a.from - b.from);
  return intervals;
}

function threadNames(events) {
  const names = events.filter((event) => event.ph === 'M' && event.name === 'thread_name');
  return new Map(names.map((event) => [`${event.pid}:${event.tid}`, event.args.name]));
}

function firstEndingAfter(intervals, time) {
  let low = 0;
  let high = intervals.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (intervals[mid].to <= time) low = mid + 1;
    else high = mid;
  }
  return low;
}

const overlap = (interval, window) => Math.max(0, Math.min(interval.to, window.to) - Math.max(interval.from, window.from));

function keyOf(frame) {
  const name = frame.functionName || '(anonymous)';
  const file = (frame.url ?? '').split('?')[0].split('/').pop();
  const line = file ? frame.lineNumber + 1 : null;
  return { name, file, line };
}

function addTime(totals, frame, ms) {
  const where = keyOf(frame);
  if (IDLE_NAMES.has(where.name)) return;
  const key = `${where.name}|${where.file}|${where.line}`;
  const entry = totals.get(key) ?? { ...where, ms: 0 };
  entry.ms += ms;
  totals.set(key, entry);
}

function selfTimes(intervals, windows) {
  const totals = new Map();
  for (const window of windows) {
    for (let i = firstEndingAfter(intervals, window.from); i < intervals.length && intervals[i].from < window.to; i++) {
      addTime(totals, intervals[i].frame, overlap(intervals[i], window));
    }
  }
  return totals;
}

function groupOf(kind, scene, thread, intervals, windows) {
  const windowMs = windows.reduce((sum, window) => sum + window.to - window.from, 0);
  const entries = [...selfTimes(intervals, windows).values()].sort((a, b) => b.ms - a.ms);
  const busyMs = entries.reduce((sum, entry) => sum + entry.ms, 0);
  const top = entries.slice(0, TOP_COUNT).map((entry) => ({ ...entry, pct: (entry.ms / windowMs) * 100 }));
  return { kind, scene, thread, windows: windows.length, windowMs, busyMs, top };
}

function intervalsFor(threads, key, what) {
  const intervals = threads.get(key);
  if (!intervals?.length) throw new Error(`The trace has no CPU profile for ${what} (thread ${key})`);
  return intervals;
}

function turnWorker(threads, names, pid) {
  const keys = [...threads.keys()].filter((key) => key.startsWith(`${pid}:`) && WORKER_THREAD.test(names.get(key) ?? ''));
  if (keys.length === 0) throw new Error('The trace has no CPU profile for a dedicated worker thread');
  return keys;
}

function workerGroup(kind, scene, keys, threads, windows) {
  const groups = keys.map((key) => groupOf(kind, scene, `worker ${key}`, threads.get(key), windows));
  return groups.reduce((best, group) => (group.busyMs > best.busyMs ? group : best));
}

function groupsForScene(context, scene, windows) {
  const { threads, names, main } = context;
  const mainIntervals = intervalsFor(threads, main.key, 'the main thread');
  if (windows[0].kind === 'slowFrames') return [groupOf('slowFrames', scene, `main ${main.key}`, mainIntervals, windows)];
  const keys = turnWorker(threads, names, main.pid);
  return [workerGroup('workerTurns', scene, keys, threads, windows), groupOf('mainTurns', scene, `main ${main.key}`, mainIntervals, windows)];
}

export function profileReport(trace) {
  const events = eventsOf(trace);
  const windows = measureWindows(events);
  if (windows.length === 0) throw new Error('The trace has no bench: measures, so there are no slow frames or turns to profile');
  const main = { pid: windows[0].pid, key: `${windows[0].pid}:${windows[0].tid}` };
  const context = { threads: threadsOf(events), names: threadNames(events), main };
  const bySceneAndKind = Map.groupBy(windows, (window) => `${window.kind}|${window.scene}`);
  const groups = [...bySceneAndKind.values()].flatMap((list) => groupsForScene(context, list[0].scene, list));
  return { groups };
}

const TITLES = { slowFrames: 'Slow frames, main thread', workerTurns: 'Turns, worker thread', mainTurns: 'Turns, main thread' };

function groupLines(group) {
  const head = `${TITLES[group.kind]}, ${group.scene}: ${group.windows} windows, ${group.windowMs.toFixed(0)} ms, ${((group.busyMs / group.windowMs) * 100).toFixed(0)} percent busy`;
  const rows = group.top.map((entry, i) => `  ${String(i + 1).padStart(2)}. ${entry.ms.toFixed(1).padStart(8)} ms ${entry.pct.toFixed(1).padStart(5)}%  ${entry.name} ${entry.file ? `${entry.file}:${entry.line}` : ''}`);
  return [head, ...rows];
}

export function profileLines(profile) {
  const groups = profile.groups.flatMap((group) => ['', ...groupLines(group)]);
  return profile.allocations ? [...groups, ...allocationLines(profile.allocations)] : groups;
}

function allocationTotals(node, caller, totals) {
  const where = keyOf(node.callFrame);
  if (node.selfSize > 0) {
    const key = `${where.name}|${where.file}|${where.line}|${caller.name}|${caller.file}|${caller.line}`;
    const entry = totals.get(key) ?? { ...where, caller, bytes: 0 };
    entry.bytes += node.selfSize;
    totals.set(key, entry);
  }
  for (const child of node.children ?? []) allocationTotals(child, where, totals);
  return totals;
}

export function allocationReport(sampling) {
  const totals = allocationTotals(sampling.head, { name: '(top)', file: '', line: null }, new Map());
  const all = [...totals.values()].reduce((sum, entry) => sum + entry.bytes, 0);
  if (all === 0) throw new Error('The heap sampling profile holds no allocations');
  const top = [...totals.values()].sort((a, b) => b.bytes - a.bytes).slice(0, TOP_COUNT).map((entry) => ({ ...entry, mb: entry.bytes / 1e6, pct: (entry.bytes / all) * 100 }));
  return { totalMb: all / 1e6, top };
}

export function allocationLines(allocations) {
  const at = (entry) => `${entry.name} ${entry.file ? `${entry.file}:${entry.line}` : ''}`;
  const rows = allocations.top.map((entry, i) => `  ${String(i + 1).padStart(2)}. ${entry.mb.toFixed(1).padStart(8)} MB ${entry.pct.toFixed(1).padStart(5)}%  ${at(entry)} called by ${at(entry.caller)}`);
  return ['', `Allocations on the main thread over the whole run, ${allocations.totalMb.toFixed(1)} MB sampled:`, ...rows];
}
