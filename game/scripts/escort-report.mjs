import { readdirSync, readFileSync } from 'node:fs';
import { seedRun, table, verdicts } from '../src/sim/progression/escort-report.ts';

const dir = process.argv.slice(2).find((a) => a !== '--') ?? 'tmp/progression';

function runsOf(archetype) {
  const files = readdirSync(dir).filter((f) => f.startsWith(`${archetype}-`) && f.endsWith('.run.jsonl')).sort((a, b) => Number(a.match(/-(\d+)\./)[1]) - Number(b.match(/-(\d+)\./)[1]));
  return files.map((file) => {
    const seed = Number(file.match(/-(\d+)\./)[1]);
    const lines = readFileSync(`${dir}/${file}`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    return seedRun(seed, lines);
  });
}

function print(title, rows) {
  console.log(`\n${title}`);
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  for (const r of rows) console.log(r.map((c, i) => c.padEnd(widths[i])).join('  '));
}

const escort = runsOf('escort');
const sprinter = runsOf('sprinter');
if (escort.length === 0) throw new Error(`No escort run logs in ${dir}/. Run npm run progression:record -- --archetypes escort first.`);
const mark = (row) => (row.won ? '' : '!');
print('Hauler damage by stretch (! marks the stretch that lost the run)', table(escort, (r) => `${r.stats.haulerDamage}${mark(r)}`));
print('Hauler condition at the start and end of the stretch', table(escort, (r) => `${Math.round(r.stats.haulerStart * 100)}>${Math.round(r.stats.haulerEnd * 100)}${mark(r)}`));
print('Player shots / fights', table(escort, (r) => `${r.stats.playerShots}/${r.stats.fights}`));
print('Enemy trucks', table(escort, (r) => `${r.stats.enemies.length}`));
print('Useful parts affordable / useful / money in M', table(escort, (r) => (r.choice ? `${r.choice.affordable}/${r.choice.useful}/${r.choice.money}` : '-')));
print('Stretches beaten, sprinter', table(sprinter, (r) => `${r.stats.haulerDamage}${mark(r)}`));
console.log('\nCriteria');
let failed = 0;
for (const v of verdicts(escort, sprinter)) {
  console.log(`${v.pass ? 'PASS' : 'FAIL'}  ${v.name}: ${v.detail}`);
  if (!v.pass) failed++;
}
process.exitCode = failed > 0 ? 1 : 0;
