import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { JAM_PARTS, MIX } from '../src/data/sounds.ts';
import { nextRandom } from '../src/sim/rng.ts';
import { BAND_EVENT_LABELS } from '../src/three/band-session.ts';
import { JAM_DEFAULTS, JamSession, onPartBus, takeEnd, takeLevel } from '../src/three/jam-session.ts';
import { SCRIPT_NAMES } from '../src/three/score-sim.ts';

const SONG_DIR = 'public/tmp/jam';
const RATE = 44100;
const STEP_SECONDS = 1 / 60;
const AFTER_LAST_EVENT_SECONDS = 16;
const GAIN_BLOCK = 64;
const BYTES_PER_SAMPLE = 4;
const MAX_DECODE_BYTES = 512 * 1024 * 1024;
const WINDOW_SECONDS = 0.05;
const SCAN_STEP_SECONDS = 0.01;
const CUT_DB = 20;
const HEARD_DB = -50;
const MERGE_SECONDS = 0.25;
const SILENT_DB = -60;
const SWITCHES = { parts: ['band', 'all'], answers: ['band', 'fills'], jumps: ['ring', 'fade'] };

const HELP = `Usage: npm run jam:sim -- <event@seconds ...> [--seed n] [--length s] [--end s] [--parts band|all] [--answers band|fills] [--jumps ring|fade] [--out file.wav]

Plays a scripted fight through the jam lab's session, the same code /jam.html runs, renders what the player would hear and prints it.
Events: ${Object.keys(SCRIPT_NAMES).join(', ')}, and dense, a full turn of up to 10 hits, 8 misses, 3 hits taken, 2 crits, 2 crashes and a sighting in one second. An event at time t is a press at t. Combat starts at 0.

Switches, the first value is the default:
  --parts    band: the conductor brings parts in and out by heat. all: every part always plays, as in /blocks.html.
  --answers  band: each event is answered by its parts from the block playing. fills: drum fills, as in /blocks.html.
  --jumps    ring: on a jump the old block's bass, guitar and vocals ring out. fade: everything fades in ${'30'} ms, as in /blocks.html.

Output:
  Blocks: each block of the song with its start, how it joined the one before and the heat when it was chosen.
  Band: each bar where a part came in or left, with the heat.
  Events: each press, the eighth it was answered on, and which parts answered. A crowded part was still answering an event that weighs as much or more. A heavier event takes the part over.
  Parts per bar: the rendered level of each part, blocks and answers together, in dBFS. A dash is under ${SILENT_DB} dBFS.
  Summary: bars per role, jumps, the share of bars each part sounds in and how many events got an answer.
  Cuts: every moment a part's level falls by more than ${CUT_DB} dB from one ${WINDOW_SECONDS * 1000} ms window to the next while it was above ${HEARD_DB} dBFS.

Options:
  --seed <n>          Seed of every random choice. Default 1.
  --length <seconds>  Total length. Default the last event plus ${AFTER_LAST_EVENT_SECONDS} s.
  --end <seconds>     End combat at this time. Default never.
  --out <file.wav>    Where to write the render. Default tmp/jam-sim.wav.
`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function switchValue(name, value) {
  if (!SWITCHES[name].includes(value)) fail(`--${name} is one of ${SWITCHES[name].join(', ')}`);
  return value;
}

const VALUES = {
  '--seed': (o, v) => { o.seed = Number(v); },
  '--length': (o, v) => { o.length = Number(v); },
  '--end': (o, v) => { o.end = Number(v); },
  '--out': (o, v) => { o.out = v; },
  '--parts': (o, v) => { o.switches.parts = switchValue('parts', v); },
  '--answers': (o, v) => { o.switches.answers = switchValue('answers', v); },
  '--jumps': (o, v) => { o.switches.jumps = switchValue('jumps', v); },
};

function readArg(o, argv, i) {
  const arg = argv[i];
  if (arg === '--help') { console.log(HELP); process.exit(0); }
  if (VALUES[arg]) VALUES[arg](o, argv[i + 1] ?? fail(`${arg} needs a value`));
  else if (arg.startsWith('--')) fail(`Unknown option ${arg}`);
  else o.events.push(parseEvent(arg));
  return VALUES[arg] ? i + 1 : i;
}

function parseEvent(token) {
  const [name, time] = token.split('@');
  const at = Number(time);
  if (!(name === 'dense' || SCRIPT_NAMES[name]) || !Number.isFinite(at)) fail(`Bad event "${token}": write name@seconds with a name from dense, ${Object.keys(SCRIPT_NAMES).join(', ')}`);
  return { name, cue: SCRIPT_NAMES[name] ?? null, at };
}

function parseArgs(argv) {
  const o = { events: [], seed: 1, length: null, end: null, out: 'tmp/jam-sim.wav', switches: { ...JAM_DEFAULTS } };
  for (let i = 0; i < argv.length; i++) i = readArg(o, argv, i);
  if (!Number.isInteger(o.seed)) fail('--seed needs a whole number');
  if (o.events.length === 0) fail(HELP);
  o.events.sort((a, b) => a.at - b.at);
  return o;
}

function decode(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ar', String(RATE), '-ac', '2', '-'], { maxBuffer: MAX_DECODE_BYTES });
  if (r.status !== 0) fail(`ffmpeg could not decode ${file}: ${r.stderr}`);
  const samples = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / BYTES_PER_SAMPLE);
  const length = samples.length / 2;
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  for (let n = 0; n < length; n++) {
    left[n] = samples[2 * n];
    right[n] = samples[2 * n + 1];
  }
  return [left, right];
}

const silentOutput = { play: () => {}, end: () => {}, move: () => {} };

function play(session, e, t) {
  if (e.name === 'dense') session.denseTurn(t);
  else session.fire(e.cue, t);
}

function endDue(session, o, t) {
  return o.end !== null && session.inCombat && t >= o.end;
}

function run(session, o, seconds) {
  const pending = [...o.events];
  session.start(0);
  for (let t = 0; t <= seconds; t += STEP_SECONDS) {
    while (pending.length && pending[0].at <= t) play(session, pending.shift(), t);
    if (endDue(session, o, t)) session.end(t);
    session.tick(t);
  }
}

function silence(length) {
  return [new Float32Array(length), new Float32Array(length)];
}

function gainAt(session, take, t) {
  return takeLevel(take, t) * (onPartBus(take) ? session.levelOf(take.part, t) : 1) * MIX.busVolume.music;
}

function addSamples(take, source, out, from, to, gain) {
  for (let n = from; n < to; n++) {
    const k = Math.round((take.from + n / RATE - take.at) * RATE);
    if (k < 0 || k >= source[0].length) continue;
    out[0][n] += source[0][k] * gain;
    out[1][n] += source[1][k] * gain;
  }
}

function renderTake(session, take, source, out) {
  const first = Math.max(0, Math.round((take.at - take.fadeIn) * RATE));
  const last = Math.min(out[0].length, Math.round(takeEnd(take) * RATE));
  for (let block = first; block < last; block += GAIN_BLOCK) {
    addSamples(take, source, out, block, Math.min(block + GAIN_BLOCK, last), gainAt(session, take, block / RATE));
  }
}

function windowDb(signal, from, to) {
  const a = Math.max(0, Math.round(from * RATE));
  const b = Math.min(signal[0].length, Math.round(to * RATE));
  if (b <= a) return -Infinity;
  let sum = 0;
  for (let n = a; n < b; n++) sum += signal[0][n] ** 2 + signal[1][n] ** 2;
  return 10 * Math.log10(sum / (2 * (b - a)) + 1e-20);
}

function cutsOf(signal, seconds) {
  const cuts = [];
  for (let t = WINDOW_SECONDS; t < seconds - WINDOW_SECONDS; t += SCAN_STEP_SECONDS) {
    const before = windowDb(signal, t - WINDOW_SECONDS, t);
    const drop = before - windowDb(signal, t, t + WINDOW_SECONDS);
    if (before < HEARD_DB || drop < CUT_DB) continue;
    const last = cuts.at(-1);
    if (last && t - last.at < MERGE_SECONDS) last.drop = Math.max(last.drop, drop);
    else cuts.push({ at: t, drop });
  }
  return cuts;
}

function causeOf(session, part, t) {
  const block = session.blocks.played.find((p) => Math.abs(p.start - t) < 4 * WINDOW_SECONDS);
  if (block) return `${block.join} into ${block.label}`;
  const exit = session.plans.find((p) => t >= p.start && t - p.start < 4 * session.beat && session.moves[part].some((m) => m.target === 0 && m.at === p.start));
  if (exit) return `${part} out at bar ${exit.bar + 1}`;
  const answer = session.takes.find((k) => k.kind === 'answer' && k.part === part && t >= k.at && t < takeEnd(k));
  return answer ? `answer from ${answer.at.toFixed(2)}` : 'in the stem';
}

const pad = (text, width) => String(text).padEnd(width);
const time = (t) => `${t.toFixed(2)}`.padStart(7);

function blocksText(session) {
  const rows = session.blocks.played.map((p) => `${time(p.start)}  ${pad(p.label, 12)}${pad(p.join, 9)}${pad(p.heat.toFixed(1), 6)}${p.guitars ? 'guitar pushed' : ''}`);
  return [`${pad('  start', 9)}${pad('block', 12)}${pad('join', 9)}${pad('heat', 6)}`, ...rows].join('\n');
}

function bandText(session) {
  const rows = JAM_PARTS.flatMap((part) => session.moves[part].map((m) => ({ part, m }))).sort((a, b) => a.m.at - b.m.at);
  const lines = rows.map(({ part, m }) => `${time(m.at)}  ${pad(part, 8)}${m.target > 0 ? 'in' : 'out'}  heat ${session.heatAt(m.at).toFixed(1)}`);
  return lines.length ? lines.join('\n') : 'none';
}

function answersOf(press) {
  const heard = press.answers.map((a) => a.part);
  const crowded = press.crowded.map((p) => `${p} crowded`);
  const over = press.cut.map((k) => `took ${k.part} over`);
  return [...heard, ...crowded, ...over].join(', ');
}

function eventsText(session) {
  const rows = session.presses.map((p) => `${time(p.at)}  ${pad(BAND_EVENT_LABELS[p.cue], 10)}${pad(p.slot === null ? '-' : p.slot.toFixed(2), 8)}${answersOf(p)}`);
  return [`${pad('  press', 9)}${pad('event', 10)}${pad('slot', 8)}answer`, ...rows].join('\n');
}

function barsOf(session, seconds) {
  return session.plans.filter((p) => p.start + session.barSeconds <= seconds);
}

function partsText(session, rendered, seconds) {
  const head = `${pad('bar', 5)}${pad('at', 8)}${pad('heat', 6)}${pad('block', 13)}${JAM_PARTS.map((p) => pad(p, 8)).join('')}`;
  const rows = barsOf(session, seconds).map((p) => {
    const cells = JAM_PARTS.map((part) => {
      const db = windowDb(rendered[part], p.start, p.start + session.barSeconds);
      return pad(db < SILENT_DB ? '-' : db.toFixed(0), 8);
    });
    const block = session.playingAt(p.start + session.beat / 2)?.label ?? '';
    return `${pad(p.bar + 1, 5)}${pad(p.start.toFixed(2), 8)}${pad(p.heat.toFixed(1), 6)}${pad(block, 13)}${cells.join('')}`;
  });
  return [head, ...rows].join('\n');
}

function summaryText(session, rendered, seconds) {
  const blocks = session.blocks.played.filter((p) => p.role !== 'end');
  const roles = {};
  for (const p of blocks) roles[p.role] = (roles[p.role] ?? 0) + p.bars;
  const bars = barsOf(session, seconds);
  const busy = JAM_PARTS.map((part) => `${part} ${Math.round((100 * bars.filter((p) => windowDb(rendered[part], p.start, p.start + session.barSeconds) >= SILENT_DB).length) / bars.length)}%`);
  const answered = session.presses.filter((p) => p.answers.length > 0).length;
  const fills = session.takes.filter((k) => k.kind === 'fill').length;
  return [
    `Bars per role: ${Object.entries(roles).map(([r, b]) => `${r} ${b}`).join(', ')}`,
    `${blocks.filter((p) => p.join === 'jump').length} jumps in ${blocks.length} blocks`,
    `Bars each part sounds in: ${busy.join(', ')}`,
    `Events answered by the band: ${answered} of ${session.presses.length}. Drum fills played: ${fills}`,
  ].join('\n');
}

function cutsText(session, rendered, seconds) {
  const rows = JAM_PARTS.flatMap((part) => cutsOf(rendered[part], seconds).map((c) => `${pad(part, 8)}${time(c.at)}  ${pad(`-${c.drop.toFixed(0)} dB`, 9)}${causeOf(session, part, c.at)}`));
  return rows.length ? rows.join('\n') : 'none';
}

function writeWav(parts, file) {
  mkdirSync(path.dirname(file), { recursive: true });
  const length = parts[0][0].length;
  const data = new Float32Array(length * 2);
  for (const p of parts) for (let n = 0; n < length; n++) {
    data[2 * n] += p[0][n];
    data[2 * n + 1] += p[1][n];
  }
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '2', '-i', '-', '-c:a', 'pcm_f32le', file], { input: Buffer.from(data.buffer) });
  if (r.status !== 0) fail(`ffmpeg could not write ${file}: ${r.stderr}`);
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const song = JSON.parse(readFileSync(path.join(SONG_DIR, 'song.json'), 'utf8'));
  const rng = { rngState: o.seed };
  const session = new JamSession(song, silentOutput, () => nextRandom(rng), o.switches);
  const seconds = o.length ?? o.events.at(-1).at + AFTER_LAST_EVENT_SECONDS;
  run(session, o, seconds);
  const length = Math.round(seconds * RATE);
  const rendered = {};
  for (const part of JAM_PARTS) {
    const source = decode(path.join(SONG_DIR, song.parts[part]));
    rendered[part] = silence(length);
    for (const take of session.takes.filter((k) => k.part === part)) renderTake(session, take, source, rendered[part]);
  }
  writeWav(Object.values(rendered), o.out);
  const s = o.switches;
  console.log(`jam:sim ${o.events.map((e) => `${e.name}@${e.at}`).join(' ')} | seed ${o.seed} | ${seconds.toFixed(1)} s | parts ${s.parts}, answers ${s.answers}, jumps ${s.jumps} | bar ${session.barSeconds.toFixed(3)} s`);
  console.log(`\nBlocks\n${blocksText(session)}`);
  console.log(`\nBand\n${bandText(session)}`);
  console.log(`\nEvents\n${eventsText(session)}`);
  console.log(`\nParts per bar, dBFS\n${partsText(session, rendered, seconds)}`);
  console.log(`\nSummary\n${summaryText(session, rendered, seconds)}`);
  console.log(`\nCuts\n${cutsText(session, rendered, seconds)}`);
  console.log(`\nWrote ${o.out}`);
}

main();
