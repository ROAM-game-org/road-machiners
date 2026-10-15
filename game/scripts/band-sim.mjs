import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { BAND, BAND_PARTS, MIX } from '../src/data/sounds.ts';
import { nextRandom } from '../src/sim/rng.ts';
import { answerLevel, BAND_EVENT_LABELS, BAND_STEMS, BARS_PER_LOOP, BEATS_PER_BAR, BandSession, stemFiles } from '../src/three/band-session.ts';
import { parseScript } from '../src/three/score-sim.ts';

const RATE = 48000;
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

const HELP = `Usage: npm run band:sim -- <event@seconds ...> [--seed n] [--length s] [--stems-dir dir] [--out file.wav]

Plays a scripted fight through the band lab's session, the same code /band.html runs, and prints what the player would hear.
Events: hit, miss, struck, crit, crash, sighted. An event at time t is a press at t. It lands one lead later, as a shot lands after the turn shows it. A sighting lands at once.

Output:
  Events: each press, where it lands, and which parts answered it and when. A crowded part was still answering an event that weighs as much or more. A heavier event takes the part over and cuts the earlier answer short.
  Band: each bar where a part came in or left, with the heat that decided it.
  Parts per bar: the rendered level of each part in each bar, loops, phrases and answers together, in dBFS. A dash is under ${SILENT_DB} dBFS.
  Summary: the share of bars each part sounds in, how many arrangement changes happened, and how long after its landing each answer starts.
  Cuts: every moment a part's level falls by more than ${CUT_DB} dB from one ${WINDOW_SECONDS * 1000} ms window to the next while it was above ${HEARD_DB} dBFS. A ring-out never trips this. A hard stop does.

Options:
  --seed <n>          Seed of every random choice. Default 1.
  --length <seconds>  Total length. Default the last event plus ${AFTER_LAST_EVENT_SECONDS} s.
  --stems-dir <dir>   Read the band stems from this folder instead of the one the lab uses.
  --out <file.wav>    Where to write the render. Default tmp/band-sim.wav.
`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const VALUES = {
  '--seed': (o, v) => { o.seed = Number(v); },
  '--length': (o, v) => { o.length = Number(v); },
  '--stems-dir': (o, v) => { o.stemsDir = v; },
  '--out': (o, v) => { o.out = v; },
};

function readArg(o, argv, i) {
  const arg = argv[i];
  if (arg === '--help') { console.log(HELP); process.exit(0); }
  if (VALUES[arg]) VALUES[arg](o, argv[i + 1] ?? fail(`${arg} needs a value`));
  else if (arg.startsWith('--')) fail(`Unknown option ${arg}`);
  else o.script.push(arg);
  return VALUES[arg] ? i + 1 : i;
}

function parseArgs(argv) {
  const o = { script: [], seed: 1, length: null, stemsDir: null, out: 'tmp/band-sim.wav' };
  for (let i = 0; i < argv.length; i++) i = readArg(o, argv, i);
  if (!Number.isInteger(o.seed)) fail('--seed needs a whole number');
  return o;
}

function decode(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ar', String(RATE), '-ac', '2', '-'], { maxBuffer: MAX_DECODE_BYTES });
  if (r.status !== 0) fail(`ffmpeg could not decode ${file}: ${r.stderr}`);
  const samples = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / BYTES_PER_SAMPLE);
  const length = samples.length / 2;
  return [0, 1].map((c) => Float32Array.from({ length }, (_, n) => samples[2 * n + c]));
}

function decodeStems(stemsDir) {
  return new Map(stemFiles().map((file) => [file, decode(stemsDir ? path.join(stemsDir, path.basename(file)) : file)]));
}

function run(session, clock, events, seconds) {
  session.tick();
  let next = 0;
  for (let t = STEP_SECONDS; t <= seconds; t += STEP_SECONDS) {
    clock.t = t;
    for (; next < events.length && events[next].at <= t; next++) session.fire(events[next].cue);
    session.tick();
  }
}

function silence(length) {
  return [new Float32Array(length), new Float32Array(length)];
}

function renderLoop(session, part, source, out) {
  const loop = source[0].length;
  const first = Math.round(session.start * RATE);
  const volume = MIX.busVolume.music;
  for (let block = first; block < out[0].length; block += GAIN_BLOCK) {
    const gain = session.levelOf(part, block / RATE) * volume;
    if (gain === 0) continue;
    for (let n = block; n < Math.min(block + GAIN_BLOCK, out[0].length); n++) {
      const i = (n - first) % loop;
      out[0][n] += source[0][i] * gain;
      out[1][n] += source[1][i] * gain;
    }
  }
}

function renderPlay(session, play, source, out) {
  const at = Math.round(play.at * RATE);
  const from = Math.round(play.from * RATE);
  const span = play.seconds === null ? source[0].length : Math.min(out[0].length - at, Math.round((play.seconds + 8 * session.beat) * RATE));
  const volume = MIX.busVolume.music;
  for (let i = 0; i < span && at + i < out[0].length; i++) {
    const gain = answerLevel(play, (at + i) / RATE, session.beat) * volume;
    const k = (from + i) % source[0].length;
    out[0][at + i] += source[0][k] * gain;
    out[1][at + i] += source[1][k] * gain;
  }
}

function renderPart(session, part, stems, length) {
  const out = silence(length);
  const stem = BAND_STEMS[part];
  if (stem.kind === 'loop') renderLoop(session, part, stems.get(stem.file), out);
  for (const play of session.plays.filter((p) => p.part === part)) renderPlay(session, play, stems.get(play.file), out);
  return out;
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

function causeOf(session, part, t, loopSeconds) {
  const intoLoop = (t - session.start) % loopSeconds;
  if (intoLoop < session.beat + 2 * WINDOW_SECONDS || loopSeconds - intoLoop < 2 * WINDOW_SECONDS) return 'loop seam';
  const exit = session.plans.find((p) => p.changes.some((c) => c.part === part && !c.on) && t >= p.start && t - p.start < 4 * session.beat);
  if (exit) return `exit at bar ${exit.bar + 1}`;
  const answer = session.plays.find((p) => p.part === part && p.seconds !== null && t >= p.at && t - p.at < p.seconds + 4 * session.beat);
  return answer ? `answer from ${answer.at.toFixed(2)}` : 'in the stem';
}

function barBeat(session, t) {
  const beats = Math.floor((t - session.start) / session.beat);
  return `bar ${Math.floor(beats / BEATS_PER_BAR) + 1}.${(beats % BEATS_PER_BAR) + 1}`;
}

function pad(text, width) {
  return String(text).padEnd(width);
}

function answersOf(press) {
  const heard = press.answers.map((a) => `${a.part} at ${a.at.toFixed(2)}`);
  const crowded = press.crowded.map((p) => `${p} crowded`);
  const over = press.cut.map((p) => `took ${p.part} over`);
  return [...heard, ...crowded, ...over].join(', ');
}

function eventsText(session) {
  const rows = session.presses.map((p) => `${pad(p.at.toFixed(2), 8)}${pad(BAND_EVENT_LABELS[p.cue], 10)}${pad(p.lands.toFixed(2), 8)}${answersOf(p)}`);
  return [`${pad('Press', 8)}${pad('Event', 10)}${pad('Lands', 8)}Answer`, ...rows].join('\n');
}

function bandText(session) {
  const rows = session.plans.filter((p) => p.changes.length > 0).map((p) => `${pad(`bar ${p.bar + 1}`, 9)}${pad(p.start.toFixed(2), 8)}${pad(p.heat.toFixed(2), 7)}${p.changes.map((c) => `${c.part} ${c.on ? 'in' : 'out'}`).join(', ')}`);
  return [`${pad('Bar', 9)}${pad('At', 8)}${pad('Heat', 7)}Change`, ...rows].join('\n');
}

function fullBars(session, seconds) {
  return session.plans.filter((p) => p.start + session.beat * BEATS_PER_BAR <= seconds);
}

function partsText(session, rendered, seconds) {
  const head = `${pad('Bar', 6)}${pad('At', 8)}${pad('Heat', 7)}${BAND_PARTS.map((p) => pad(p, 8)).join('')}`;
  const rows = fullBars(session, seconds).map((p) => {
    const end = p.start + session.beat * BEATS_PER_BAR;
    const cells = BAND_PARTS.map((part) => {
      const db = windowDb(rendered[part], p.start, end);
      return pad(db < SILENT_DB ? '-' : db.toFixed(0), 8);
    });
    return `${pad(p.bar + 1, 6)}${pad(p.start.toFixed(2), 8)}${pad(p.heat.toFixed(2), 7)}${cells.join('')}`;
  });
  return [head, ...rows].join('\n');
}

function summaryText(session, rendered, seconds) {
  const bars = fullBars(session, seconds);
  const busy = BAND_PARTS.map((part) => {
    const heard = bars.filter((p) => windowDb(rendered[part], p.start, p.start + session.beat * BEATS_PER_BAR) >= SILENT_DB).length;
    return `${part} ${Math.round((100 * heard) / bars.length)}%`;
  });
  const changes = session.plans.flatMap((p) => p.changes).filter((c) => c.why !== 'always').length;
  const delays = session.presses.flatMap((p) => p.answers.map((a) => (a.at - p.lands) * 1000)).sort((a, b) => a - b);
  const answered = session.presses.filter((p) => p.answers.length > 0).length;
  const delay = delays.length ? `${delays[Math.floor(delays.length / 2)].toFixed(0)} ms median, ${delays[0].toFixed(0)} to ${delays.at(-1).toFixed(0)} ms` : 'none';
  return [`Bars each part sounds in: ${busy.join(', ')}`, `Arrangement changes: ${changes} in ${bars.length} bars`, `Events answered: ${answered} of ${session.presses.length}`, `Answer start after landing: ${delay}`].join('\n');
}

function cutsText(session, rendered, seconds, loopSeconds) {
  const rows = BAND_PARTS.flatMap((part) => cutsOf(rendered[part], seconds).map((c) => `${pad(part, 7)}${pad(c.at.toFixed(2), 8)}${pad(barBeat(session, c.at), 10)}${pad(`-${c.drop.toFixed(0)} dB`, 9)}${causeOf(session, part, c.at, loopSeconds)}`));
  if (rows.length === 0) return 'none';
  return [`${pad('Part', 7)}${pad('At', 8)}${pad('Where', 10)}${pad('Drop', 9)}Cause`, ...rows].join('\n');
}

function mixOf(signals, length) {
  const out = silence(length);
  for (const s of signals) for (let c = 0; c < 2; c++) for (let n = 0; n < length; n++) out[c][n] += s[c][n];
  return out;
}

function writeWav(mix, file) {
  mkdirSync(path.dirname(file), { recursive: true });
  const data = new Float32Array(mix[0].length * 2);
  for (let n = 0; n < mix[0].length; n++) {
    data[2 * n] = mix[0][n];
    data[2 * n + 1] = mix[1][n];
  }
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '2', '-i', '-', '-c:a', 'pcm_f32le', file], { input: Buffer.from(data.buffer) });
  if (r.status !== 0) fail(`ffmpeg could not write ${file}: ${r.stderr}`);
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const events = parseScript(o.script);
  const seconds = o.length ?? events.at(-1).at + AFTER_LAST_EVENT_SECONDS;
  const length = Math.round(seconds * RATE);
  const stems = decodeStems(o.stemsDir);
  const loopSeconds = stems.get(BAND_STEMS.drums.file)[0].length / RATE;
  const clock = { t: 0 };
  const rng = { rngState: o.seed };
  const session = new BandSession({ now: () => clock.t, roll: () => nextRandom(rng), barSeconds: loopSeconds / BARS_PER_LOOP });
  run(session, clock, events, seconds);
  const rendered = Object.fromEntries(BAND_PARTS.map((part) => [part, renderPart(session, part, stems, length)]));
  writeWav(mixOf(Object.values(rendered), length), o.out);
  console.log(`band:sim ${o.script.join(' ')} | seed ${o.seed} | length ${seconds.toFixed(1)} s | bar ${(session.beat * BEATS_PER_BAR).toFixed(3)} s | lead ${session.lead.toFixed(2)} s | changes every ${BAND.phraseBars} bars`);
  console.log(`\nEvents\n${eventsText(session)}`);
  console.log(`\nBand\n${bandText(session)}`);
  console.log(`\nParts per bar, dBFS\n${partsText(session, rendered, seconds)}`);
  console.log(`\nSummary\n${summaryText(session, rendered, seconds)}`);
  console.log(`\nCuts\n${cutsText(session, rendered, seconds, loopSeconds)}`);
  console.log(`\nWrote ${o.out}`);
}

main();
