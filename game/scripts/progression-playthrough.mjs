import { closeSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';
import { activityFrom, playthroughWorld } from '../src/sim/progression/activity.ts';
import { isArchetype } from '../src/sim/progression/bot.ts';
import { TEST_MAP } from '../src/test/map.ts';
import { checkpointOf, checkResume, resumeCheckpoint } from '../src/three/playthrough-checkpoint.ts';

const CHECKPOINT_EVERY = Number(process.env.ROAM_CHECKPOINT_EVERY ?? 150);

const USAGE = 'Usage: npm run progression:playthrough -- --seed <n> --turns <n> --out <file> [--archetype markov] [--every 50] [--sha <sha>] [--checkpoint <file>] [--resume <file>]';

const options = parseArgs(process.argv.slice(2).filter((a) => a !== '--'));
await write(options);

function parseArgs(argv) {
  const flags = readFlags(argv);
  const archetype = flags.archetype ?? 'markov';
  if (!isArchetype(archetype)) throw new Error(`Unknown archetype ${archetype}. ${USAGE}`);
  if (!flags.out) throw new Error(`--out is required. ${USAGE}`);
  return { seed: whole(flags.seed, 'seed'), turns: positive(flags.turns, 'turns'), every: positive(flags.every ?? '50', 'every'), archetype, sha: flags.sha ?? null, out: flags.out, checkpoint: flags.checkpoint ?? null, resume: flags.resume ?? null };
}

function readFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i];
    const value = argv[i + 1];
    if (!name?.startsWith('--') || value === undefined) throw new Error(`Bad argument ${name}. ${USAGE}`);
    flags[name.slice(2)] = value;
  }
  return flags;
}

function whole(text, name) {
  const n = Number(text);
  if (text === undefined || !Number.isInteger(n)) throw new Error(`--${name} must be a whole number. ${USAGE}`);
  return n;
}

function positive(text, name) {
  const n = whole(text, name);
  if (n <= 0) throw new Error(`--${name} must be positive. ${USAGE}`);
  return n;
}

async function startOf({ seed, archetype, resume, turns }) {
  if (!resume) return { world: playthroughWorld(TEST_MAP, seed, archetype), turns };
  const resumed = await resumeCheckpoint(readFileSync(resume, 'utf8'), TEST_MAP);
  checkResume(resumed, seed, archetype);
  return { world: resumed.world, turns: turns - (resumed.world.turn - 1) };
}

function writeCheckpoint(file, world, archetype) {
  writeFileSync(`${file}.tmp`, JSON.stringify(checkpointOf(world, archetype)));
  renameSync(`${file}.tmp`, file);
}

async function write({ out, checkpoint, resume, ...run }) {
  const start = await startOf({ ...run, resume });
  if (start.turns <= 0) throw new Error(`The checkpoint is at turn ${start.world.turn}, past --turns ${run.turns}`);
  mkdirSync(dirname(out), { recursive: true });
  const fd = openSync(`${out}.part`, 'w');
  const started = Date.now();
  let last = null;
  let world = start.world;
  const onWorld = (next) => {
    world = next;
    if (checkpoint && next.turn % CHECKPOINT_EVERY === 0) writeCheckpoint(checkpoint, next, run.archetype);
  };
  for (const line of activityFrom(start.world, { ...run, turns: start.turns, onWorld })) {
    writeSync(fd, `${JSON.stringify(line)}\n`);
    if (line.k === 'end') last = line;
  }
  if (checkpoint && last.reason === 'complete') writeCheckpoint(checkpoint, world, run.archetype);
  closeSync(fd);
  renameSync(`${out}.part`, out);
  console.log(`seed ${run.seed} ${run.archetype}: ${last.reason} at turn ${last.turn} in ${((Date.now() - started) / 1000).toFixed(0)} s, log ${out}`);
}
