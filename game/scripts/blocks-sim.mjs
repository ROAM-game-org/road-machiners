import { readFileSync } from 'node:fs';
import { nextRandom } from '../src/sim/rng.ts';
import { BlockSession } from '../src/three/block-session.ts';
import { SCRIPT_NAMES } from '../src/three/score-sim.ts';

const SONG_JSON = 'public/tmp/score-proto/song.json';
const STEP_SECONDS = 1 / 60;
const AFTER_LAST_EVENT_SECONDS = 20;

const HELP = `Usage: npm run blocks:sim -- <event@seconds ...> [--seed n] [--length s] [--end s]

Plays a scripted fight through the block lab's session, the same code /blocks.html runs, on a simulated clock, and prints what it chose.
Events: ${Object.keys(SCRIPT_NAMES).join(', ')}, and dense, a full turn of up to 10 hits, 8 misses, 3 hits taken, 2 crits, 2 crashes and a sighting in one second.
An event at time t lands at t. Combat starts at 0.

Output:
  Blocks: each block with its start, how it joined the one before, the heat when it was chosen, the level trim that keeps it as loud as the median block and the odds behind the choice.
  Answers: each beat whose winning event was heavy and asked for the lanes. Other events are only counted.
  Lanes: each run of the guitar and cymbal lanes.
  Summary: bars per role, jumps and how long each lane was open.

Options:
  --seed <n>          Seed of every random choice. Default 1.
  --length <seconds>  How long the fight runs. Default the last event plus ${AFTER_LAST_EVENT_SECONDS} s.
  --end <seconds>     End combat at this time. Default the length.
`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const OPTIONS = ['--seed', '--length', '--end'];

function readArg(o, argv, i) {
  const arg = argv[i];
  if (arg === '--help') { console.log(HELP); process.exit(0); }
  if (OPTIONS.includes(arg)) {
    o[arg.slice(2)] = Number(argv[i + 1] ?? fail(`${arg} needs a value`));
    return i + 1;
  }
  if (arg.startsWith('--')) fail(`Unknown option ${arg}`);
  o.events.push(parseEvent(arg));
  return i;
}

function parseArgs(argv) {
  const o = { events: [], seed: 1, length: null, end: null };
  for (let i = 0; i < argv.length; i++) i = readArg(o, argv, i);
  if (!Number.isInteger(o.seed)) fail('--seed needs a whole number');
  o.events.sort((a, b) => a.at - b.at);
  return o;
}

function parseEvent(token) {
  const [name, time] = token.split('@');
  const at = Number(time);
  if (!(name === 'dense' || SCRIPT_NAMES[name]) || !Number.isFinite(at)) fail(`Bad event "${token}": write name@seconds with a name from dense, ${Object.keys(SCRIPT_NAMES).join(', ')}`);
  return { name, cue: SCRIPT_NAMES[name] ?? null, at };
}

const silentVoice = { fadeOut: () => {}, cut: () => {} };
const output = { voice: () => silentVoice, lean: () => silentVoice };

function play(session, e) {
  if (e.name === 'dense') session.denseTurn(e.at);
  else session.fire(e.cue, e.at);
}

function step(session, pending, t, end) {
  while (pending.length && pending[0].at <= t) play(session, pending.shift());
  if (session.inCombat && t >= end) session.end(t);
  session.tick(t);
}

function run(o) {
  const song = JSON.parse(readFileSync(SONG_JSON, 'utf8'));
  const rng = { rngState: o.seed };
  const session = new BlockSession(song, output, () => nextRandom(rng));
  const length = o.length ?? (o.events.at(-1)?.at ?? 0) + AFTER_LAST_EVENT_SECONDS;
  const pending = [...o.events];
  session.start(0);
  for (let t = 0; t <= length; t += STEP_SECONDS) step(session, pending, t, o.end ?? length);
  return session;
}

const pad = (s, n) => String(s).padEnd(n);
const time = (t) => `${t.toFixed(2)}s`.padStart(8);
const trimText = (level) => `${(20 * Math.log10(level)).toFixed(1)} dB`;

function printBlocks(session) {
  console.log('Blocks');
  console.log(`  ${pad('start', 8)}  ${pad('block', 12)} ${pad('join', 8)} ${pad('heat', 6)} ${pad('trim', 8)} odds`);
  for (const p of session.played) console.log(`  ${time(p.start)}  ${pad(p.label, 12)} ${pad(p.join, 8)} ${pad(p.heat.toFixed(1), 6)} ${pad(trimText(p.level), 8)} ${p.odds}`);
  console.log('\nLanes');
  for (const o of session.overlays) console.log(`  ${pad(o.lane, 8)} ${time(o.from)} to ${time(o.to)}  from bar ${o.bar}`);
}

function printAnswers(session) {
  console.log('\nAnswers');
  const winners = session.fired.filter((f) => f.result !== null);
  for (const f of winners.filter((w) => w.result === 'lanes')) console.log(`  ${time(f.at)}  ${f.cue.replace('accent-', '')} asked for the lanes`);
  console.log(`  ${session.fired.length} events, ${winners.length} won their beat, ${winners.filter((w) => w.result === 'lanes').length} of them heavy`);
}

function printSummary(session) {
  const blocks = session.played.filter((p) => p.role !== 'end');
  const bars = {};
  for (const p of blocks) bars[p.role] = (bars[p.role] ?? 0) + p.bars;
  const seconds = (lane) => session.overlays.filter((o) => o.lane === lane).reduce((sum, o) => sum + o.to - o.from, 0);
  console.log('\nSummary');
  console.log(`  bars per role: ${Object.entries(bars).map(([r, b]) => `${r} ${b}`).join(', ')}`);
  console.log(`  ${blocks.filter((p) => p.join === 'jump').length} jumps in ${blocks.length} blocks`);
  for (const lane of ['guitars', 'cymbals']) console.log(`  ${lane}: open ${seconds(lane).toFixed(1)} s in ${session.overlays.filter((o) => o.lane === lane).length} runs`);
}

const session = run(parseArgs(process.argv.slice(2)));
printBlocks(session);
printAnswers(session);
printSummary(session);
