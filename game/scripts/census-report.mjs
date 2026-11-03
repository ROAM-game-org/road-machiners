export const CENSUS_TOP = 25;
const US_PER_MS = 1000;
const WORKER_THREAD = /^DedicatedWorker/;
const PASS_THROUGH = new Set(['timed', 'update', '(anonymous)', '']);
const IDLE = new Set(['(idle)', '(program)', '(root)']);
export const WORKER_ANCHORS = ['computeTurnIn', 'previewIn', 'endTurn'];

export function censusRows(stats, frames) {
  if (!(frames > 0)) throw new Error('The census saw no game frames');
  return Object.entries(stats).map(([key, s]) => ({
    key,
    callsPerFrame: s.calls / frames,
    msPerFrame: s.selfMs / frames,
    kbPerFrame: s.selfBytes / 1024 / frames,
    sameShare: s.calls ? s.sameCalls / s.calls : 0,
    sameMsPerFrame: s.sameMs / frames,
    sameKbPerFrame: s.sameBytes / 1024 / frames,
    gcCalls: s.gcCalls,
  }));
}

export const byOwnTime = (rows) => [...rows].sort((a, b) => b.msPerFrame - a.msPerFrame).slice(0, CENSUS_TOP);
export const byGarbage = (rows) => [...rows].sort((a, b) => b.kbPerFrame - a.kbPerFrame).slice(0, CENSUS_TOP);
export const bySameStateWork = (rows) => rows.filter((row) => row.sameMsPerFrame > 0).sort((a, b) => b.sameMsPerFrame - a.sameMsPerFrame).slice(0, CENSUS_TOP);

const fixed = (n, digits) => n.toFixed(digits).padStart(8);

function rowLine(row, i) {
  return `  ${String(i + 1).padStart(2)}. ${row.key.padEnd(44)} ${fixed(row.callsPerFrame, 1)} calls ${fixed(row.msPerFrame, 3)} ms ${fixed(row.kbPerFrame, 1)} KB  same state ${fixed(row.sameShare * 100, 0)}% of calls, ${row.sameMsPerFrame.toFixed(3)} ms ${row.sameKbPerFrame.toFixed(1)} KB`;
}

function ruleLines(rules) {
  return rules.flatMap((group) => [`Worker ${group.anchor}, ${group.totalMs.toFixed(0)} ms in all, by step:`, ...group.steps.slice(0, CENSUS_TOP).map((step, i) => `  ${String(i + 1).padStart(2)}. ${step.name.padEnd(36)} ${fixed(step.ms, 0)} ms ${fixed((step.ms / group.totalMs) * 100, 1)}%`)]);
}

export function censusLines(scene, census, rules) {
  const rows = censusRows(census.stats, census.frames);
  return [
    `Census of ${scene}: ${census.frames} frames, ${census.systems} systems wrapped. Times and sizes are per frame and count each method's own work, not its callees.`,
    'By own time:',
    ...byOwnTime(rows).map(rowLine),
    'By garbage made:',
    ...byGarbage(rows).map(rowLine),
    'Work done while the world and every object input were the same as on the call before:',
    ...bySameStateWork(rows).map(rowLine),
    ...ruleLines(rules),
  ];
}

const idOf = (event) => String(event.id ?? event.id2?.local ?? event.id2?.global);

function workerProfiles(events) {
  const names = new Map(events.filter((e) => e.ph === 'M' && e.name === 'thread_name').map((e) => [`${e.pid}:${e.tid}`, e.args.name]));
  return events.filter((e) => e.name === 'Profile' && WORKER_THREAD.test(names.get(`${e.pid}:${e.tid}`) ?? '')).map((e) => ({ key: `${e.pid}:${idOf(e)}`, start: e.args.data.startTime }));
}

function addChunk(profile, data) {
  const cpu = data.cpuProfile ?? {};
  for (const node of cpu.nodes ?? []) profile.nodes.set(node.id, { name: node.callFrame.functionName, parent: node.parent });
  const deltas = data.timeDeltas ?? [];
  (cpu.samples ?? []).forEach((id, i) => {
    profile.at += deltas[i];
    if (profile.last !== null) profile.ms.set(profile.last, (profile.ms.get(profile.last) ?? 0) + (profile.at - profile.lastAt) / US_PER_MS);
    profile.last = id;
    profile.lastAt = profile.at;
  });
}

function readProfiles(events) {
  const profiles = new Map(workerProfiles(events).map((p) => [p.key, { nodes: new Map(), ms: new Map(), at: p.start, last: null, lastAt: p.start }]));
  for (const event of events) {
    if (event.name !== 'ProfileChunk') continue;
    const profile = profiles.get(`${event.pid}:${idOf(event)}`);
    if (profile) addChunk(profile, event.args.data);
  }
  return [...profiles.values()];
}

function stackOf(nodes, id) {
  const names = [];
  for (let node = nodes.get(id); node; node = nodes.get(node.parent)) names.push(node.name);
  return names.reverse();
}

function stepUnder(stack, anchor) {
  const at = stack.indexOf(anchor);
  if (at < 0) return null;
  const step = stack.slice(at + 1).find((name) => !PASS_THROUGH.has(name));
  return step ?? `${anchor} itself`;
}

function addSteps(totals, stack, ms) {
  if (IDLE.has(stack.at(-1))) return;
  for (const anchor of WORKER_ANCHORS) {
    const step = stepUnder(stack, anchor);
    if (step === null) continue;
    const group = totals.get(anchor);
    group.set(step, (group.get(step) ?? 0) + ms);
  }
}

export function workerSteps(trace) {
  const events = Array.isArray(trace) ? trace : trace.traceEvents;
  if (!Array.isArray(events)) throw new Error('The trace has no traceEvents list');
  const totals = new Map(WORKER_ANCHORS.map((anchor) => [anchor, new Map()]));
  for (const profile of readProfiles(events)) {
    for (const [id, ms] of profile.ms) addSteps(totals, stackOf(profile.nodes, id), ms);
  }
  return [...totals].filter(([, steps]) => steps.size > 0).map(([anchor, steps]) => {
    const sorted = [...steps].map(([name, ms]) => ({ name, ms })).sort((a, b) => b.ms - a.ms);
    return { anchor, totalMs: sorted.reduce((sum, step) => sum + step.ms, 0), steps: sorted };
  });
}
