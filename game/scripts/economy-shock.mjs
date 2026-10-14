import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

function argOf(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function parseSeeds(text) {
  const range = /^(\d+)-(\d+)$/.exec(text);
  const seeds = range ? Array.from({ length: +range[2] - +range[1] + 1 }, (_, i) => +range[1] + i) : text.split(',').map(Number);
  for (const s of seeds) if (!Number.isInteger(s)) throw new Error(`--seeds must be a list like 1,2,3 or a range like 1-3, got "${text}"`);
  return seeds;
}

const days = Number(argOf('days', '6'));
if (!Number.isInteger(days) || days <= 0) throw new Error(`--days must be a positive integer, got "${argOf('days')}"`);
const shocks = argOf('shock', 'none').split(',');
const one = argOf('seed', null);
const at = Number(argOf('at', '450'));
if (!Number.isInteger(at) || at < 0) throw new Error(`--at must be a turn, got "${argOf('at')}"`);
const runFile = (shock, seed) => `tmp/economy/${shock}-${seed}.json`;

if (one !== null) {
  const { playShock } = await import('../src/sim/progression/economy-shock.ts');
  const run = playShock(Number(one), days, shocks[0], at, (s) => {
    console.log(`[economy] ${shocks[0]} seed ${one} day ${s.day}: ${s.traders} traders, ${s.convoys} convoys`);
    writeFileSync(`${runFile(shocks[0], one)}.partial`, JSON.stringify(s));
  });
  writeFileSync(runFile(shocks[0], one), JSON.stringify(run));
  process.exit(0);
}

mkdirSync('tmp/economy', { recursive: true });
const seeds = parseSeeds(argOf('seeds', '1-3'));
const jobs = shocks.flatMap((shock) => seeds.map((seed) => ({ shock, seed })));
const codes = await Promise.all(jobs.map(({ shock, seed }) => new Promise((resolve) => {
  const child = spawn('npx', ['vite-node', 'scripts/economy-shock.mjs', '--', '--seed', String(seed), '--days', String(days), '--shock', shock, '--at', String(at)], { stdio: 'inherit' });
  child.on('exit', resolve);
})));
if (codes.some((c) => c !== 0)) throw new Error(`an economy run failed: exit codes ${codes.join(', ')}`);
const { formatShocks, SHOCKS } = await import('../src/sim/progression/economy-shock.ts');
for (const shock of shocks) if (!SHOCKS.includes(shock)) throw new Error(`Unknown shock ${shock}`);
const report = formatShocks(jobs.map(({ shock, seed }) => JSON.parse(readFileSync(runFile(shock, seed), 'utf8'))));
writeFileSync('tmp/economy/report.md', `${report}\n`);
console.log(report);
