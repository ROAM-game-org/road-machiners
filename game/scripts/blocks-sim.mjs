import { readFileSync } from 'node:fs';
import { nextRandom } from '../src/sim/rng.ts';
import { BlockSession } from '../src/three/block-session.ts';
import { BLOCK_EVENTS } from '../src/three/block-session.ts';

const SONG_ROOT = 'public/tmp/score-proto';
const STEP_SECONDS = 1 / 60;
const AFTER_LAST_EVENT_SECONDS = 20;

const HELP = `Usage: npm run blocks:sim -- <event@seconds ...> [--seed n] [--length s] [--end s]

Plays a scripted fight through the block lab's session, the same code /blocks.html runs, on a simulated clock, and prints what it chose.
Events: ${BLOCK_EVENTS.join(', ')}, and dense, a full turn in one second: up to 10 hits, 8 misses and 3 hits taken, often a crit, sometimes a crash, rarely an enemy joining or a knockout.
An event at time t lands at t. Combat starts at 0.

Output:
  Blocks: each block with its start, how it joined the one before, the heat when it was chosen, the level trim that keeps it as loud as the median block and the odds behind the choice.
  Answers: each event whose surprise crossed the line and asked for the lanes, then a count per kind of event.
  Lanes: each run of the guitar and cymbal lanes.
  Summary: bars per role, jumps and how long each lane was open.

Options:
  --seed <n>          Seed of every random choice. Default 1.
  --length <seconds>  How long the fight runs. Default the last event plus ${AFTER_LAST_EVENT_SECONDS} s.
  --end <seconds>     End combat at this time. Default the length.
  --song <name>       Song folder under ${SONG_ROOT}, one of the songs in scripts/score-songs.json. Required.
`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const OPTIONS = { '--seed': Number, '--length': Number, '--end': Number, '--song': String };

function readArg(o, argv, i) {
  const arg = argv[i];
  if (arg === '--help') { console.log(HELP); process.exit(0); }
  const read = OPTIONS[arg];
  if (read) {
    o[arg.slice(2)] = read(argv[i + 1] ?? fail(`${arg} needs a value`));
    return i + 1;
  }
  if (arg.startsWith('--')) fail(`Unknown option ${arg}`);
  o.events.push(parseEvent(arg));
  return i;
}

function parseArgs(argv) {
  const o = { events: [], seed: 1, length: null, end: null, song: null };
  for (let i = 0; i < argv.length; i++) i = readArg(o, argv, i);
  if (!Number.isInteger(o.seed)) fail('--seed needs a whole number');
  if (!o.song) fail('--song is required');
  o.events.sort((a, b) => a.at - b.at);
  return o;
}

function parseEvent(token) {
  const [name, time] = token.split('@');
  const at = Number(time);
  if (!(name === 'dense' || BLOCK_EVENTS.includes(name)) || !Number.isFinite(at)) fail(`Bad event "${token}": write name@seconds with a name from dense, ${BLOCK_EVENTS.join(', ')}`);
  return { name, at };
}

const silentVoice = { fadeOut: () => {}, cut: () => {} };
const output = { voice: () => silentVoice, lean: () => silentVoice };

function play(session, e) {
  if (e.name === 'dense') session.denseTurn(e.at);
  else session.fire(e.name, e.at);
}

function step(session, pending, t, end) {
  while (pending.length && pending[0].at <= t) play(session, pending.shift());
  if (session.inCombat && t >= end) session.end(t);
  session.tick(t);
}

function run(o) {
  const song = JSON.parse(readFileSync(`${SONG_ROOT}/${o.song}/song.json`, 'utf8'));
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
  const opening = session.fired.filter((f) => f.lanes);
  for (const f of opening) console.log(`  ${time(f.at)}  ${pad(f.kind, 9)} surprise ${f.surprise.toFixed(2)}`);
  const kinds = [...new Set(session.fired.map((f) => f.kind))];
  console.log(`  ${session.fired.length} events, ${opening.length} crossed the surprise line`);
  for (const kind of kinds) {
    const all = session.fired.filter((f) => f.kind === kind);
    console.log(`  ${pad(kind, 9)} ${String(all.length).padStart(4)} events, ${all.filter((f) => f.lanes).length} opened the lanes`);
  }
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
  const heats = blocks.map((p) => p.heat).sort((a, b) => a - b);
  const at = (q) => heats[Math.min(heats.length - 1, Math.floor(q * heats.length))].toFixed(1);
  console.log(`  heat when blocks were chosen: low ${at(0.1)}, median ${at(0.5)}, high ${at(0.9)}`);
}

const session = run(parseArgs(process.argv.slice(2)));
printBlocks(session);
printAnswers(session);
printSummary(session);
