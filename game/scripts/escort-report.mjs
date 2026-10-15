import { readdirSync, readFileSync } from 'node:fs';
import { balanceVerdicts, gearShares, median, playVerdicts, seedRun, table } from '../src/sim/progression/escort-report.ts';

const dir = process.argv.slice(2).find((a) => a !== '--') ?? 'tmp/progression';

const shares = [];

function runsOf(archetype) {
  const files = readdirSync(dir).filter((f) => f.startsWith(`${archetype}-`) && f.endsWith('.run.jsonl')).sort((a, b) => Number(a.match(/-(\d+)\./)[1]) - Number(b.match(/-(\d+)\./)[1]));
  return files.map((file) => {
    const seed = Number(file.match(/-(\d+)\./)[1]);
    const lines = readFileSync(`${dir}/${file}`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    if (archetype === 'escort') shares.push(...gearShares(lines));
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
print('Useful parts affordable / useful, their total price / money in M', table(escort, (r) => (r.choice ? `${r.choice.affordable}/${r.choice.useful} ${r.choice.total}/${r.choice.money}` : '-')));
print('Stretches beaten, sprinter', table(sprinter, (r) => `${r.stats.haulerDamage}${mark(r)}`));
console.log(`\nMeasured gear share of pay on both trucks: median ${median(shares).toFixed(2)} over ${shares.length} outposts`);
const line = (v) => console.log(`${v.pass ? 'PASS' : 'FAIL'}  ${v.name}: ${v.detail}`);
const play = playVerdicts(escort);
console.log('\nPlay checks');
play.forEach(line);
if (play.some((v) => !v.pass)) {
  console.log('\nVOID: the escort bot did not play the mode, so its runs measure nothing about balance. The balance checks are not judged. Fix the bot, not the score.');
  process.exitCode = 1;
} else {
  const balance = balanceVerdicts(escort, sprinter);
  console.log('\nBalance checks');
  balance.forEach(line);
  process.exitCode = balance.some((v) => !v.pass) ? 1 : 0;
}
