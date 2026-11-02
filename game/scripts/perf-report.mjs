import { isSoftware } from './gpu.mjs';

export const LOAD_SHARE_MAX = 0.5;
export const SPREAD_MAX = 0.1;
const SLOW_FRAME_MS = 33.3;
const BUDGET_KEYS = ['frameP99Ms', 'over33Per1000', 'over100Max', 'chunkOver100Max', 'turnWaitMs', 'previewMs', 'bootMs'];

export function budgetsFor(budgets, machine) {
  const block = { ...budgets.default, ...(budgets.machines[machine] ?? {}) };
  for (const key of BUDGET_KEYS) if (!Number.isFinite(block[key])) throw new Error(`Budget ${key} is missing for machine ${machine}`);
  return block;
}

const isMeasure = (value) => typeof value === 'number' && Number.isFinite(value);

export function fmt(value, digits = 1) {
  return isMeasure(value) ? value.toFixed(digits) : 'n/a';
}

function statOf(stats, key) {
  return stats && stats.frames > 0 ? stats[key] : null;
}

function lineOf(scene, label, value, limit, unit) {
  const base = { scene, label, limit, unit };
  if (!isMeasure(value)) return { ...base, value: null, pass: false, missing: true, miss: null, severity: null };
  const miss = Math.max(0, value - limit);
  return { ...base, value, pass: value <= limit, missing: false, miss, severity: miss / (limit > 0 ? limit : 1) };
}

function over100Alone(scene) {
  const alone = scene.frame.real.over100 - scene.slowFrames.over100WithChunkBuild;
  if (alone < 0) throw new Error(`Scene ${scene.id} has fewer frames over 100 ms than frames over 100 ms that built a chunk`);
  return alone;
}

function slowPer1000(scene) {
  const real = scene.frame.real;
  return real.frames > 0 ? (real.over33 / real.frames) * 1000 : null;
}

function sceneLines(scene, budget) {
  const lines = [
    lineOf(scene.id, 'frame p99', statOf(scene.frame.real, 'p99'), budget.frameP99Ms, 'ms'),
    lineOf(scene.id, `frames over ${SLOW_FRAME_MS} ms per 1000`, slowPer1000(scene), budget.over33Per1000, ''),
    lineOf(scene.id, 'frames over 100 ms', over100Alone(scene), budget.over100Max, ''),
  ];
  if (scene.id === 'drive') lines.push(lineOf(scene.id, 'frames over 100 ms that built a chunk', scene.slowFrames.over100WithChunkBuild, budget.chunkOver100Max, ''));
  return lines;
}

function turnLines(report, budget) {
  const { turns } = report;
  return [
    lineOf('turns', 'turn wait p99', statOf(turns.waitMs, 'p99'), budget.turnWaitMs, 'ms'),
    lineOf('turns', 'plan preview p99', statOf(turns.previewMs, 'p99'), budget.previewMs, 'ms'),
    lineOf('boot', 'boot', report.bootMs, budget.bootMs, 'ms'),
  ];
}

export function checkBudgets(report, budget) {
  return [...report.scenes.flatMap((scene) => sceneLines(scene, budget)), ...turnLines(report, budget)];
}

function loadProblems(run) {
  const limit = run.cores * LOAD_SHARE_MAX;
  return isMeasure(run.loadStart) && run.loadStart > limit ? [`machine load at start was ${fmt(run.loadStart, 2)}, over half of ${run.cores} cores`] : [];
}

function spreadProblems(scenes) {
  return scenes
    .filter((scene) => !isMeasure(scene.spread) || scene.spread > SPREAD_MAX)
    .map((scene) => `${scene.id} passes disagree by ${isMeasure(scene.spread) ? fmt(scene.spread * 100, 1) : 'n/a'} percent, over ${SPREAD_MAX * 100}`);
}

function contentProblems(scenes) {
  const failed = scenes.filter((scene) => !scene.check.passed).map((scene) => `${scene.id} content check ${scene.check.name} failed: ${scene.check.detail}`);
  const drawn = scenes.filter((scene) => scene.draws.total !== scene.draws.rendererCalls).map((scene) => `${scene.id} counted ${scene.draws.total} draws but the renderer made ${scene.draws.rendererCalls}`);
  return [...failed, ...drawn];
}

function setupProblems(report, run) {
  const problems = [];
  if (isSoftware(report.renderer)) problems.push(`renderer is software: ${report.renderer}`);
  if (!run.frameCapOff) problems.push('frame cap is on');
  if (report.schema !== 1) problems.push(`report schema ${report.schema} is not 1`);
  return problems;
}

export function trustProblems(wrapped) {
  const { bench, run } = wrapped;
  return [...setupProblems(bench, run), ...loadProblems(run), ...spreadProblems(bench.scenes), ...contentProblems(bench.scenes)];
}

export function notes(wrapped) {
  const { bench, run } = wrapped;
  const found = [];
  if (!bench.gpuTimer) found.push('GPU timer missing in this browser: GPU time and the gpu or cpu label are n/a');
  if (!isMeasure(run.loadStart) || !isMeasure(run.loadEnd)) found.push('machine load not measured');
  return found;
}

export function bundleProblems(manifest) {
  const entry = manifest['index.html'];
  if (!entry) throw new Error('The Vite manifest has no index.html entry');
  const loaded = new Set();
  const visit = (key) => {
    if (loaded.has(key)) return;
    loaded.add(key);
    for (const next of manifest[key].imports ?? []) visit(next);
  };
  visit('index.html');
  const problems = [...loaded].filter((key) => key.startsWith('src/bench/')).map((key) => `${key} loads with the game`);
  if (!Object.keys(manifest).some((key) => key.startsWith('src/bench/'))) problems.push('the build has no bench chunk');
  return problems;
}

const SYSTEMS = ['terrain', 'props', 'vehicles', 'lights', 'effects', 'overlays', 'other'];

function drawShare(scene, system) {
  if (!SYSTEMS.includes(system) || scene.draws.total <= 0) return null;
  const own = scene.draws.bySystem[system];
  return ((own.main.draws + own.shadow.draws) / scene.draws.total) * 100;
}

function topSavings(scene) {
  if (scene.savings === null) return 'savings not measured';
  const ranked = Object.entries(scene.savings)
    .filter(([, saving]) => isMeasure(saving) && saving > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
  if (ranked.length === 0) return 'no toggle saved time';
  return ranked.map(([name, saving]) => `${name} saves ${fmt(saving)} ms${isMeasure(drawShare(scene, name)) ? ` (${fmt(drawShare(scene, name), 0)} percent of draws)` : ''}`).join(', ');
}

function topTimer(timers) {
  const [top] = Object.entries(timers).sort((a, b) => b[1] - a[1]);
  return top ? ` (top timer ${top[0]} ${fmt(top[1])} ms)` : '';
}

function slowCause(scene) {
  const slow = scene.slowFrames;
  if (slow.count === 0) return 'no slow frames';
  const where = slow.renderMs >= slow.tickRestMs ? `render CPU ${fmt(slow.renderMs, 0)} ms` : `game tick ${fmt(slow.tickRestMs, 0)} ms${topTimer(slow.timers)}`;
  const extras = [`${fmt(slow.uploadBytes / 1e6)} MB uploaded`, `${slow.chunkBuilds} chunk builds`];
  return `${slow.count} slow frames, mostly ${where}, ${extras.join(', ')}`;
}

function topStep(steps) {
  const [top] = Object.entries(steps).sort((a, b) => b[1].total - a[1].total);
  return top ? `top turn step ${top[0]} ${fmt(top[1].total)} ms over ${top[1].calls} calls` : 'no turn steps recorded';
}

function entryText(group, report) {
  const scene = report.scenes.find((candidate) => candidate.id === group.scene);
  if (scene) return `${scene.id}, ${scene.bound ?? 'bound unknown'} bound. ${topSavings(scene)}. Slow frames: ${slowCause(scene)}.`;
  if (group.scene === 'turns') return `${topStep(report.turns.steps)}.`;
  return 'boot has no per system breakdown.';
}

export function fixNext(report, lines) {
  const groups = new Map();
  for (const line of lines.filter((candidate) => !candidate.pass && !candidate.missing)) {
    const group = groups.get(line.scene) ?? { scene: line.scene, severity: 0, misses: [] };
    group.severity = Math.max(group.severity, line.severity);
    group.misses.push(`${line.label} ${fmt(line.value)} against ${fmt(line.limit)}`);
    groups.set(line.scene, group);
  }
  return [...groups.values()]
    .sort((a, b) => b.severity - a.severity)
    .map((group) => ({ scene: group.scene, severity: group.severity, text: `${entryText(group, report)} Misses: ${group.misses.join('; ')}.` }));
}

function statusOf(line) {
  if (line.missing) return 'NOT MEASURED';
  return line.pass ? 'pass' : 'MISS';
}

function lineText(line) {
  const unit = line.unit ? ` ${line.unit}` : '';
  const miss = statusOf(line) === 'MISS' ? ` over by ${fmt(line.miss)}${unit}` : '';
  return `${statusOf(line).padEnd(13)}${line.scene.padEnd(16)}${line.label.padEnd(38)}${fmt(line.value).padStart(8)} of ${fmt(line.limit).padStart(6)}${unit}${miss}`;
}

function headerLines(wrapped) {
  const { bench, run } = wrapped;
  return [
    `machine ${run.machine}, ${run.cores} cores, commit ${run.commit}, started ${run.startedAt}`,
    `renderer ${bench.renderer}, viewport ${bench.viewport.width}x${bench.viewport.height}, pixel ratio ${bench.pixelRatio}, render scale ${bench.renderScale}, town ${bench.town}`,
    `load at start ${fmt(run.loadStart, 2)}, at end ${fmt(run.loadEnd, 2)}`,
  ];
}

export function summary(wrapped, lines) {
  const out = [...headerLines(wrapped), ''];
  const untrusted = wrapped.run.untrusted;
  out.push(untrusted.length ? 'UNTRUSTED RUN, do not compare these numbers:' : 'trusted run');
  out.push(...untrusted.map((problem) => `  ${problem}`), ...notes(wrapped).map((note) => `  note: ${note}`), '');
  out.push(...lines.map(lineText), '');
  const next = fixNext(wrapped.bench, lines);
  out.push(next.length ? 'Fix next, worst miss first. Savings overlap, so they rank and never add up:' : 'No budget missed.');
  out.push(...next.map((entry, i) => `${i + 1}. ${entry.text}`));
  const failed = lines.filter((line) => !line.pass).length;
  out.push('', failed || untrusted.length ? `FAIL: ${failed} budget lines not met, ${untrusted.length} trust problems` : 'PASS');
  return out.join('\n');
}

function changeOf(a, b) {
  if (!isMeasure(a) || !isMeasure(b)) return null;
  const smaller = Math.min(a, b);
  return smaller > 0 ? Math.abs(b - a) / smaller : Number(a !== b) * Infinity;
}

function deltaText(a, b, change) {
  if (change === null) return 'n/a';
  if (change === Infinity) return 'from zero';
  return `${b >= a ? '+' : '-'}${fmt(change * 100)}%`;
}

function row(label, a, b, delta, flagged) {
  return `${label.padEnd(44)}${String(a).padStart(14)}${String(b).padStart(14)}${delta.padStart(10)}${flagged ? '  CHANGED' : ''}`;
}

function numRow(label, a, b, flagAbove = null) {
  const change = changeOf(a, b);
  const flagged = change === null ? isMeasure(a) !== isMeasure(b) : flagAbove !== null && change > flagAbove;
  return row(label, fmt(a, 2), fmt(b, 2), deltaText(a, b, change), flagged);
}

function textRow(label, a, b) {
  return row(label, a, b, '', false);
}

function passSpread(scene, key) {
  return changeOf(...scene.passes.map((pass) => pass.real[key]));
}

function realRows(a, b) {
  const noise = (key) => Math.max(passSpread(a, key), passSpread(b, key));
  const stat = (key) => numRow(`${a.id} real ms ${key}`, statOf(a.frame.real, key), statOf(b.frame.real, key), key === 'median' || key === 'p99' ? noise(key) : null);
  return [...['median', 'p99', 'worst', 'over33', 'over100'].map(stat), textRow(`${a.id} p99 spread`, fmt(passSpread(a, 'p99'), 2), fmt(passSpread(b, 'p99'), 2))];
}

function drawCell(count) {
  return `${count.draws}/${count.triangles}`;
}

function drawRows(scene, a, b) {
  return SYSTEMS.flatMap((system) => ['main', 'shadow'].map((pass) => {
    const left = a.draws.bySystem[system][pass];
    const right = b.draws.bySystem[system][pass];
    const changed = drawCell(left) !== drawCell(right);
    return row(`${scene} ${system} ${pass} draws/triangles`, drawCell(left), drawCell(right), '', changed);
  }));
}

function sceneRows(a, b) {
  const id = a.id;
  return [
    ...realRows(a, b),
    ...['tickCpu', 'renderCpu', 'gpu'].map((key) => numRow(`${id} ${key} median ms`, statOf(a.frame[key], 'median'), statOf(b.frame[key], 'median'))),
    textRow(`${id} spread`, fmt(a.spread, 2), fmt(b.spread, 2)),
    textRow(`${id} bound`, a.bound ?? 'n/a', b.bound ?? 'n/a'),
    numRow(`${id} long tasks`, a.longTasks, b.longTasks),
    numRow(`${id} draws counted`, a.draws.total, b.draws.total, 0),
    ...drawRows(id, a, b),
    ...savingRows(id, a.savings, b.savings),
  ];
}

function savingRows(id, a, b) {
  const names = [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])];
  return names.map((name) => numRow(`${id} saving ${name} ms`, a?.[name] ?? null, b?.[name] ?? null));
}

function turnRows(a, b) {
  const stats = ['waitMs', 'workerTurnMs', 'previewMs'].flatMap((key) => ['median', 'p99', 'worst'].map((stat) => numRow(`turns ${key} ${stat}`, statOf(a[key], stat), statOf(b[key], stat))));
  const names = [...new Set([...Object.keys(a.steps), ...Object.keys(b.steps)])];
  const steps = names.flatMap((name) => ['total', 'calls', 'max'].map((key) => numRow(`turn step ${name} ${key}`, a.steps[name]?.[key] ?? null, b.steps[name]?.[key] ?? null)));
  return [...stats, ...steps];
}

function differs(label, a, b) {
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [`warning: ${label} differs: ${JSON.stringify(a)} against ${JSON.stringify(b)}`];
}

function warnings(a, b) {
  return [
    ...differs('machine', a.run.machine, b.run.machine),
    ...differs('renderer', a.bench.renderer, b.bench.renderer),
    ...differs('viewport', a.bench.viewport, b.bench.viewport),
    ...differs('pixel ratio', a.bench.pixelRatio, b.bench.pixelRatio),
    ...differs('render scale', a.bench.renderScale, b.bench.renderScale),
    ...differs('town', a.bench.town, b.bench.town),
    ...(a.run.untrusted.length || b.run.untrusted.length ? ['warning: at least one run is untrusted'] : []),
  ];
}

function pairScenes(a, b) {
  const ids = [...new Set([...a.bench.scenes, ...b.bench.scenes].map((scene) => scene.id))];
  return ids.map((id) => [id, a.bench.scenes.find((scene) => scene.id === id), b.bench.scenes.find((scene) => scene.id === id)]);
}

function pairRows([id, a, b]) {
  return a && b ? sceneRows(a, b) : [`${id}: only in ${a ? 'the first' : 'the second'} report`];
}

export function compare(a, b) {
  const head = [`A: ${a.run.machine} ${a.run.commit} ${a.run.startedAt}`, `B: ${b.run.machine} ${b.run.commit} ${b.run.startedAt}`, ...warnings(a, b), ''];
  const body = [...pairScenes(a, b).flatMap(pairRows), ...turnRows(a.bench.turns, b.bench.turns), numRow('boot ms', a.bench.bootMs, b.bench.bootMs)];
  const flags = body.filter((line) => line.endsWith('CHANGED')).length;
  return [...head, textRow('measure', 'A', 'B'), ...body, '', `${flags} lines changed`].join('\n');
}
