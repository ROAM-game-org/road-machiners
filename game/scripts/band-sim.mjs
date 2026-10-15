import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { BAND, BAND_PARTS, MIX, SOUNDS } from '../src/data/sounds.ts';
import { nextRandom } from '../src/sim/rng.ts';
import { BAND_EVENT_LABELS, BAND_STEMS, BARS_PER_LOOP, BEATS_PER_BAR, bandLead, BandSession, stemFiles } from '../src/three/band-session.ts';
import { parseScript, RecordingPlayer } from '../src/three/score-sim.ts';

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
Events: hit, miss, struck, crit, crash, sighted. An event at time t is a press at t. Its stab lands one lead later. A sighting lands at once.

Output:
  Events: each press, where it lands and what the stab did.
  Band: each bar where a part came in or left, with the heat that decided it.
  Parts per bar: the rendered level of each part in each bar, after its gain, in dBFS. A dash is under ${SILENT_DB} dBFS.
  Cuts: every moment a part's level falls by more than ${CUT_DB} dB from one ${WINDOW_SECONDS * 1000} ms window to the next while it was above ${HEARD_DB} dBFS. A sound that rings out loses about 9 dB per beat at the exit decay, so it never trips this. A hard stop does.
    Each cut names its cause: a loop seam, a part's exit, or the stem itself.
  Stabs: how many played and the most that sounded at once.

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
  const planes = [0, 1].map((c) => Float32Array.from({ length }, (_, n) => samples[2 * n + c]));
  return { rate: RATE, channels: planes };
}

function decodeStems(stemsDir) {
  return new Map(stemFiles().map((file) => [file, decode(stemsDir ? path.join(stemsDir, path.basename(file)) : file)]));
}

function accentPlayer(seed) {
  const accents = Object.fromEntries(Object.entries(SOUNDS).filter(([cue]) => cue.startsWith('accent-')));
  const decoded = new Map();
  for (const cue of Object.values(accents)) for (const file of cue.files) decoded.set(file, decode(path.join('public/sfx', file)));
  const rng = { rngState: ~seed };
  return new RecordingPlayer(accents, decoded, () => nextRandom(rng));
}

function run(session, player, events, lengthSeconds) {
  session.tick();
  let next = 0;
  for (let t = STEP_SECONDS; t <= lengthSeconds; t += STEP_SECONDS) {
    player.advanceTo(t);
    for (; next < events.length && events[next].at <= t; next++) session.fire(events[next].cue);
    session.tick();
  }
}

function silence(length) {
  return [new Float32Array(length), new Float32Array(length)];
}

function renderPart(session, part, stems, length) {
  const stem = BAND_STEMS[part];
  return stem.kind === 'loop' ? renderLoop(session, part, stems.get(stem.file), length) : renderPhrases(session, part, stems, length);
}

function renderPhrases(session, part, stems, length) {
  const out = silence(length);
  const volume = MIX.busVolume.music;
  for (const p of session.phrases.filter((x) => x.part === part)) {
    const source = stems.get(p.file);
    const at = Math.round(p.at * RATE);
    for (let c = 0; c < 2; c++) for (let i = 0; i < source.channels[c].length && at + i < length; i++) out[c][at + i] += source.channels[c][i] * p.gain * volume;
  }
  return out;
}

function renderLoop(session, part, stem, length) {
  const out = silence(length);
  const loop = stem.channels[0].length;
  const first = Math.round(session.start * RATE);
  const volume = MIX.busVolume.music;
  for (let block = first; block < length; block += GAIN_BLOCK) {
    const gain = session.levelOf(part, block / RATE) * volume;
    if (gain === 0) continue;
    for (let n = block; n < Math.min(block + GAIN_BLOCK, length); n++) {
      const i = (n - first) % loop;
      out[0][n] = stem.channels[0][i] * gain;
      out[1][n] = stem.channels[1][i] * gain;
    }
  }
  return out;
}

function renderStabs(session, player, length) {
  const out = silence(length);
  for (const press of session.presses) if (press.stab) addStab(out, press.stab, player.sourceOf(press.stab.file));
  return out;
}

function addStab(out, stab, source) {
  const gain = stab.gain * SOUNDS[stab.cue].volume * MIX.busVolume.music;
  const sides = [Math.min(1, 1 - stab.pan), Math.min(1, 1 + stab.pan)];
  const at = Math.round(stab.at * RATE);
  for (let c = 0; c < 2; c++) {
    const from = source.channels[Math.min(c, source.channels.length - 1)];
    const n = Math.min(from.length, out[c].length - at);
    for (let i = 0; i < n; i++) out[c][at + i] += from[i] * gain * sides[c];
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

function causeOf(session, part, t, loopSeconds) {
  const intoLoop = (t - session.start) % loopSeconds;
  if (intoLoop < session.beat + 2 * WINDOW_SECONDS || loopSeconds - intoLoop < 2 * WINDOW_SECONDS) return 'loop seam';
  const exit = session.plans.find((p) => p.changes.some((c) => c.part === part && !c.on) && t >= p.start && t - p.start < 4 * session.beat);
  return exit ? `exit at bar ${exit.bar + 1}` : 'in the stem';
}

function barBeat(session, t) {
  const beats = Math.floor((t - session.start) / session.beat);
  return `bar ${Math.floor(beats / BEATS_PER_BAR) + 1}.${(beats % BEATS_PER_BAR) + 1}`;
}

function pad(text, width) {
  return String(text).padEnd(width);
}

function eventsText(session) {
  const rows = session.presses.map((p) => `${pad(p.at.toFixed(2), 8)}${pad(BAND_EVENT_LABELS[p.cue], 10)}${pad(p.lands.toFixed(2), 8)}${pad(p.result, 9)}${p.stab ? `stab ${p.stab.file} from ${p.stab.at.toFixed(2)}` : ''}`);
  return [`${pad('Press', 8)}${pad('Event', 10)}${pad('Lands', 8)}${pad('Result', 9)}Sound`, ...rows].join('\n');
}

function bandText(session) {
  const rows = session.plans.filter((p) => p.changes.length > 0).map((p) => `${pad(`bar ${p.bar + 1}`, 9)}${pad(p.start.toFixed(2), 8)}${pad(p.heat.toFixed(2), 7)}${p.changes.map((c) => `${c.part} ${c.on ? 'in' : 'out'}`).join(', ')}`);
  return [`${pad('Bar', 9)}${pad('At', 8)}${pad('Heat', 7)}Change`, ...rows].join('\n');
}

function partsText(session, rendered, seconds) {
  const head = `${pad('Bar', 6)}${pad('At', 8)}${pad('Heat', 7)}${BAND_PARTS.map((p) => pad(p, 8)).join('')}`;
  const rows = session.plans.filter((p) => p.start + session.beat * BEATS_PER_BAR <= seconds).map((p) => {
    const end = p.start + session.beat * BEATS_PER_BAR;
    const cells = BAND_PARTS.map((part) => {
      const db = windowDb(rendered[part], p.start, end);
      return pad(db < SILENT_DB ? '-' : db.toFixed(0), 8);
    });
    return `${pad(p.bar + 1, 6)}${pad(p.start.toFixed(2), 8)}${pad(p.heat.toFixed(2), 7)}${cells.join('')}`;
  });
  return [head, ...rows].join('\n');
}

function cutsText(session, rendered, seconds, loopSeconds) {
  const rows = BAND_PARTS.flatMap((part) => cutsOf(rendered[part], seconds).map((c) => `${pad(part, 7)}${pad(c.at.toFixed(2), 8)}${pad(barBeat(session, c.at), 10)}${pad(`-${c.drop.toFixed(0)} dB`, 9)}${causeOf(session, part, c.at, loopSeconds)}`));
  if (rows.length === 0) return 'none';
  return [`${pad('Part', 7)}${pad('At', 8)}${pad('Where', 10)}${pad('Drop', 9)}Cause`, ...rows].join('\n');
}

function stabsText(session, player) {
  const spans = session.presses.filter((p) => p.stab).map((p) => [p.stab.at, p.stab.at + player.durationOf(p.stab.file)]);
  const most = Math.max(0, ...spans.map(([a]) => spans.filter(([b, e]) => b <= a && a < e).length));
  return `${spans.length} of ${session.presses.length} events played a stab. At most ${most} stabs sounded at once.`;
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

function mixOf(signals, length) {
  const out = silence(length);
  for (const s of signals) for (let c = 0; c < 2; c++) for (let n = 0; n < length; n++) out[c][n] += s[c][n];
  return out;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const events = parseScript(o.script);
  const seconds = o.length ?? events.at(-1).at + AFTER_LAST_EVENT_SECONDS;
  const length = Math.round(seconds * RATE);
  const stems = decodeStems(o.stemsDir);
  const loopSeconds = stems.get(BAND_STEMS.drums.file).channels[0].length / RATE;
  const player = accentPlayer(o.seed);
  const rng = { rngState: o.seed };
  const lead = bandLead((cue, file) => player.takeWithPeak(cue, file).peak);
  const session = new BandSession({ now: () => player.now(), take: (cue) => player.chooseWithPeak(cue), roll: () => nextRandom(rng), barSeconds: loopSeconds / BARS_PER_LOOP }, lead);
  run(session, player, events, seconds);
  const rendered = Object.fromEntries(BAND_PARTS.map((part) => [part, renderPart(session, part, stems, length)]));
  const mix = mixOf([...Object.values(rendered), renderStabs(session, player, length)], length);
  writeWav(mix, o.out);
  console.log(`band:sim ${o.script.join(' ')} | seed ${o.seed} | length ${seconds.toFixed(1)} s | bar ${(session.beat * BEATS_PER_BAR).toFixed(3)} s | lead ${lead.toFixed(3)} s | changes every ${BAND.phraseBars} bars | stems ${o.stemsDir ?? path.dirname(BAND_STEMS.drums.file)}`);
  console.log(`\nEvents\n${eventsText(session)}`);
  console.log(`\nBand\n${bandText(session)}`);
  console.log(`\nParts per bar, dBFS\n${partsText(session, rendered, seconds)}`);
  console.log(`\nCuts\n${cutsText(session, rendered, seconds, loopSeconds)}`);
  console.log(`\nStabs\n${stabsText(session, player)}`);
  console.log(`\nWrote ${o.out}`);
}

main();
