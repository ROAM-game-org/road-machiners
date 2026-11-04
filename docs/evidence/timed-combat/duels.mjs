import { mkdirSync, writeFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { initPhysics } from '../src/phys/drive.ts';
import { parseLineup, runFight, formatReport, turnLine } from '../src/test/combat-harness.ts';
const stage = process.argv[2];
if (!['before', 'after'].includes(stage)) throw new Error('Stage must be before or after');
const seeds = [1337, 41, 73];
const pairs = [['mg', 'cannon'], ['mg', 'shotgun'], ['cannon', 'shotgun']];
const armors = ['bare', 'plates'];
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const out = `tmp/combat-rollout/${stage}-${revision.slice(0, 9)}-duels`;
mkdirSync(out);
writeFileSync(`${out}/config.json`, JSON.stringify({ revision, stage, seeds, pairs, armors, driver: 'buggy', chassis: 'hauler', wear: 0, gap: 8, orbit: 6, maxTurns: 120 }, null, 2));
const reports = [];
const trace = openSync(`${out}/turns.log`, 'wx');
await initPhysics();
try {
  for (const armor of armors) for (const [a, b] of pairs) for (const seed of seeds) {
    const fight = { a: parseLineup(`buggy:${a}/${armor}@hauler~0`), b: parseLineup(`buggy:${b}/${armor}@hauler~0`), seed, gap: 8, orbit: 6, maxTurns: 120, arena: null, road: null, crew: null, guard: false, late: null, bystander: null };
    const result = runFight(fight, (w, turn) => writeSync(trace, `${armor} ${a}/${b} seed ${seed} ${turnLine(w, turn)}\n`));
    reports.push(result);
    console.log(JSON.stringify({ armor, a, b, seed, turns: result.turns, outcome: result.outcome, aDamage: result.a.damage, bDamage: result.b.damage }));
    writeFileSync(`${out}/fights.json`, JSON.stringify(reports, null, 2));
  }
  writeFileSync(`${out}/report.md`, formatReport(reports, []));
} finally { closeSync(trace); }
