import { mkdirSync, openSync, writeSync, closeSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { recordTurns } from '../src/sim/progression/record-node.ts';
import { physicsMover } from '../src/phys/recorder-mover.ts';
import { corePart, mountedParts } from '../src/sim/grid.ts';
import { playerVehicle, haulerOf } from '../src/sim/damage.ts';
import { getResources } from '../src/sim/resources.ts';
import { maxHp } from '../src/sim/wear.ts';
import { maxHealthOf } from '../src/sim/health.ts';
import { turnPartHits } from '../src/sim/combat.ts';

function flag(name) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith('--') || value.trim() === '') throw new Error(`--${name} needs a value`);
  return value;
}

function integerFlag(name) {
  const value = Number(flag(name));
  if (!Number.isSafeInteger(value)) throw new Error(`--${name} needs an integer`);
  return value;
}

function positiveFlag(name) {
  const value = integerFlag(name);
  if (value <= 0) throw new Error(`--${name} must be positive`);
  return value;
}

function stopReason(step, completed, target) {
  const loss = step.events.find(event => event.t === 'runLost');
  if (loss) return loss.cause;
  if (step.world.player.state === 'dead') return 'death';
  return completed >= target ? 'completed' : null;
}

function damaged(hits, id) {
  return (hits.get(id) ?? []).reduce((sum, hit) => sum + hit.damage, 0);
}

function cabHealth(vehicle) {
  const cab = corePart(vehicle, 'cab');
  return { current: cab.hp, maximum: maxHp(cab) };
}

function disabled(vehicle) {
  return mountedParts(vehicle).filter(part => part.hp <= 0).map(part => ({ id: part.id, defId: part.defId }));
}

const seed = integerFlag('seed');
const maxTurns = positiveFlag('turns');
const targetStretches = positiveFlag('stretches');
const out = resolve(flag('out'));
if (execFileSync('git', ['diff', 'HEAD', '--', 'src'], { encoding: 'utf8' })) throw new Error('Game source must match the recorded revision');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sourceTree = execFileSync('git', ['rev-parse', 'HEAD:game/src'], { encoding: 'utf8' }).trim();
const runnerHash = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const header = { revision, sourceTree, runnerHash, node: process.version, seed, policy: 'escort', physics: true, maxTurns, targetStretches };
mkdirSync(dirname(out), { recursive: true });
mkdirSync(out);
writeFileSync(`${out}/config.json`, JSON.stringify(header, null, 2));
const fd = openSync(`${out}/turns.jsonl`, 'wx');
let incomingDamage = 0, haulerDamage = 0, completedStretches = 0, reason = null, last = null;
try {
  for (const step of recordTurns(seed, 'escort', maxTurns, {}, await physicsMover())) {
    const w = step.world, run = w.chaosHighway;
    if (!run) throw new Error('Highway recording lost its run state');
    if (!last) {
      header.setup = structuredClone(w.setup);
      writeFileSync(`${out}/config.json`, JSON.stringify(header, null, 2));
    }
    const player = playerVehicle(w), hauler = haulerOf(w);
    const hits = turnPartHits(w);
    incomingDamage += damaged(hits, player.id);
    haulerDamage += damaged(hits, hauler.id);
    completedStretches = Math.max(completedStretches, run.window);
    reason = stopReason(step, completedStretches, targetStretches);
    last = {
      turn: w.turn, completedStretches, playerState: w.player.state, health: w.player.health, healthMaximum: maxHealthOf(w),
      playerChassis: player.chassisId, playerCab: cabHealth(player), playerDisabled: disabled(player),
      haulerChassis: hauler.chassisId, haulerHealth: getResources(w, hauler).health, haulerCab: cabHealth(hauler), haulerDisabled: disabled(hauler),
      incomingDamage, haulerDamage,
    };
    const row = JSON.stringify(last, (_key, value) => {
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Highway metric is not finite');
      return value;
    });
    writeSync(fd, `${row}\n`);
    if (reason) break;
  }
  if (!last) throw new Error('Highway recorder produced no turns');
  const result = { ...header, reason: reason ?? 'turn limit', result: last };
  writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { closeSync(fd); }
