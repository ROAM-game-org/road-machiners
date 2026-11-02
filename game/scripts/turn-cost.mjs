import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = 'Usage: node scripts/turn-cost.mjs [--job trader:1] [--turns 60] [--skip 10] [--dir tmp/turn-cost] [--profile <file.cpuprofile>]';
const MAX_PROFILE_BYTES = 400 * 1024 * 1024;
const TOP_FUNCTIONS = 25;
const AREAS = ['sim/nav', 'sim/vision', 'sim/terrain', 'sim/far', 'sim/loadout-memo', 'sim/grid', 'phys/'];

function readFlags(argv) {
  const flags = {};
  const list = argv.filter((a) => a !== '--');
  for (let i = 0; i < list.length; i += 2) {
    const name = list[i];
    const value = list[i + 1];
    if (!name?.startsWith('--') || value === undefined) throw new Error(`Bad argument ${name}. ${USAGE}`);
    flags[name.slice(2)] = value;
  }
  return flags;
}

function wholeNumber(text, name) {
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0) throw new Error(`--${name} must be a whole number, got ${text}. ${USAGE}`);
  return value;
}

function recordProfile({ job, turns, dir }) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const profileDir = resolve(dir, `prof-${stamp}`);
  mkdirSync(profileDir, { recursive: true });
  const viteNode = fileURLToPath(new URL('../node_modules/.bin/vite-node', import.meta.url));
  const script = fileURLToPath(new URL('./progression-record.mjs', import.meta.url));
  const run = spawnSync(viteNode, [script, '--', '--job', job, '--turns', String(turns), '--physics', 'true', '--out', resolve(dir, 'run')], {
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: `--cpu-prof --cpu-prof-dir=${profileDir}` },
  });
  if (run.status !== 0) throw new Error(`The recorder exited with ${run.status}`);
  return profileDir;
}

function profileFiles(profileDir) {
  const files = readdirSync(profileDir).filter((f) => f.endsWith('.cpuprofile')).map((f) => join(profileDir, f));
  if (files.length === 0) throw new Error(`No .cpuprofile in ${profileDir}`);
  for (const file of files) if (statSync(file).size > MAX_PROFILE_BYTES) throw new Error(`${file} is over ${MAX_PROFILE_BYTES} bytes; free disk and shorten --turns`);
  return files;
}

function parseProfiles(profileDir) {
  const found = profileFiles(profileDir).map((file) => ({ file, turns: turnsOf(JSON.parse(readFileSync(file, 'utf8'))) }));
  const best = found.reduce((a, b) => (b.turns.length > a.turns.length ? b : a));
  if (best.turns.length === 0) throw new Error(`No endTurn samples in ${found.map((f) => f.file).join(', ')}`);
  return best;
}

function indexOf(profile) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const chains = new Map();
  const chain = (id) => {
    if (!chains.has(id)) {
      const out = [id];
      while (parent.has(out[out.length - 1])) out.push(parent.get(out[out.length - 1]));
      chains.set(id, out);
    }
    return chains.get(id);
  };
  return { frame: (id) => nodes.get(id).callFrame, chain };
}

const isEndTurn = (cf) => cf.functionName === 'endTurn' && cf.url.endsWith('src/sim/world.ts');
const shortName = (cf) => `${cf.functionName || '(anon)'} ${cf.url.split('/game/').pop()}:${cf.lineNumber + 1}`;

function callbackAt(index, ids, endTurnAt) {
  for (let i = endTurnAt - 1; i >= 0; i--) {
    if (index.frame(ids[i]).functionName === '' && index.frame(ids[i + 1]).functionName === 'update') return i;
  }
  return -1;
}

function stepOf(index, ids) {
  const callback = callbackAt(index, ids, ids.findIndex((id) => isEndTurn(index.frame(id))));
  if (callback < 0) return 'outside pipeline';
  if (callback === 0) return 'pipeline self';
  const step = index.frame(ids[callback - 1]);
  if (step.functionName) return step.functionName;
  const named = ids.slice(0, callback - 1).map((id) => index.frame(id).functionName).filter(Boolean).reverse().slice(0, 3);
  return `anonymous: ${named.join(' > ')}`;
}

function isRapier(cf) {
  return cf.url.startsWith('wasm://') || cf.url.includes('rapier') || /^(wasm-to-js|js-to-wasm)/.test(cf.functionName);
}

function categoryOf(cf) {
  if (isRapier(cf)) return 'rapier wasm and glue';
  const area = AREAS.find((part) => cf.url.includes(`src/${part}`));
  if (area) return area;
  return cf.url.includes('/src/sim/') ? 'sim other' : cf.functionName || 'other';
}

function inTurn(index, ids, current) {
  return ids.some((id) => isEndTurn(index.frame(id))) || (ids.length <= 2 && current !== null);
}

function closeTurn(turns, current) {
  if (current) turns.push(current);
  return null;
}

function turnsOf(profile) {
  const index = indexOf(profile);
  const turns = [];
  let current = null;
  for (let i = 0; i < profile.samples.length; i++) {
    const ids = index.chain(profile.samples[i]);
    if (!inTurn(index, ids, current)) {
      current = closeTurn(turns, current);
      continue;
    }
    current ??= { ms: 0, steps: new Map(), cats: new Map(), funcs: new Map() };
    addSample(current, index, ids, ids.some((id) => isEndTurn(index.frame(id))), profile.timeDeltas[i] / 1000);
  }
  closeTurn(turns, current);
  return turns;
}

function addSample(turn, index, ids, inside, ms) {
  const leaf = index.frame(ids[0]);
  turn.ms += ms;
  add(turn.steps, inside ? stepOf(index, ids) : `rootless: ${leaf.functionName || '(anon)'}`, ms);
  add(turn.cats, categoryOf(leaf), ms);
  add(turn.funcs, shortName(leaf), ms);
}

function add(map, key, ms) {
  map.set(key, (map.get(key) ?? 0) + ms);
}

function merged(turns, key) {
  const out = new Map();
  for (const t of turns) for (const [k, v] of t[key]) add(out, k, v);
  return [...out].sort((a, b) => b[1] - a[1]);
}

function report(turns, skip) {
  console.log(`${turns.length} turns found`);
  turns.forEach((t, i) => {
    const top = [...t.steps].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ');
    console.log(`turn ${String(i + 1).padStart(3)} ${t.ms.toFixed(0).padStart(7)} ms  ${top}`);
  });
  const steady = turns.slice(skip);
  if (steady.length === 0) throw new Error(`--skip ${skip} leaves no turns of ${turns.length}`);
  const total = steady.reduce((a, t) => a + t.ms, 0);
  console.log(`\nsteady turns ${steady.length}, mean ${(total / steady.length).toFixed(0)} ms per turn`);
  for (const [label, key] of [['by category', 'cats'], ['by pipeline step', 'steps'], ['top self-time functions', 'funcs']]) {
    console.log(`\nsteady ${label}`);
    for (const [k, v] of merged(steady, key).slice(0, TOP_FUNCTIONS)) console.log(`  ${(v / steady.length).toFixed(1).padStart(7)} ms/turn  ${((100 * v) / total).toFixed(1).padStart(5)}%  ${k}`);
  }
}

function loadTurns(flags) {
  if (flags.profile) return turnsOf(JSON.parse(readFileSync(flags.profile, 'utf8')));
  const profileDir = recordProfile({ job: flags.job ?? 'trader:1', turns: wholeNumber(flags.turns ?? '60', 'turns'), dir: flags.dir ?? 'tmp/turn-cost' });
  const best = parseProfiles(profileDir);
  console.log(`profile ${best.file}`);
  return best.turns;
}

function main() {
  const flags = readFlags(process.argv.slice(2));
  const skip = wholeNumber(flags.skip ?? '10', 'skip');
  console.log(`started ${new Date().toISOString()}`);
  report(loadTurns(flags), skip);
}

main();
