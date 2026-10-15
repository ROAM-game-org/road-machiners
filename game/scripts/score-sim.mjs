import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { SOUNDS } from '../src/data/sounds.ts';
import { nextRandom } from '../src/sim/rng.ts';
import { ScoreSession } from '../src/three/score-session.ts';
import { checkStabs, contrastText, ledgerText, parseScript, RecordingPlayer, renderMix, runScript, SCORE_CHECK, SCRIPT_NAMES, stabInputs, timelineText } from '../src/three/score-sim.ts';

const RATE = 48000;
const SFX_DIR = 'public/sfx';
const DEFAULT_STEP_SECONDS = 1 / 60;
const AFTER_LAST_EVENT_SECONDS = 8;
const BYTES_PER_SAMPLE = 4;
const MAX_DECODE_BYTES = 512 * 1024 * 1024;
const BASES = ['drums', 'bass', 'horns', 'trombone'];
const NAMES = Object.keys(SCRIPT_NAMES).join(', ');
const C = SCORE_CHECK;

const HELP = `Usage: npm run score:sim -- <event@seconds ...> [options]

Plays a scripted fight through the combat score's real code and prints what the player would hear.
Events: ${NAMES}. Example: hit@1.0 hit@1.4 crit@3 crash@5 sighted@6
An event at time t is a press at t. Its stab lands one lead later, the longest take peak plus the score's offer-ahead time, as in the lab at /score.html. A sighting plays at once.

Options:
  --base <${BASES.join('|')}|any>   Fix the base loop. Default any, a random one.
  --take <event>=<n>   Pin the take of an event to its n-th file, from 1. Repeat for several events.
  --seed <n>           Seed of every random choice. Default 1. The same script and seed give the same output.
  --force              Skip the score's rules, as the lab's Force button does.
  --length <seconds>   Total length. Default the last event plus ${AFTER_LAST_EVENT_SECONDS} s.
  --step <seconds>     Fixed step of the simulated clock. Default 1/60 s, a frame.
  --out <file.wav>     Where to write the mixed render. Default tmp/score-sim.wav.
  --sfx-dir <dir>      Use a file from this folder instead of public/sfx when the name matches.
  --help               Print this text.

Output: the ledger the lab shows, a timeline of the base, stabs, tails and ducks, then the contrast table.

What the table measures, in the mixed render with every duck, pan, gain and the base phase:
  A stab window is ${C.windowSeconds} s long and starts where the player first hears the stab, so it holds the take's attack and body. It does not start at the take's loudest moment, since a flat take has no meaningful one.
  The base window is the ${C.referenceSeconds} s of the base alone just before the stab starts. It is longer than the stab window so it holds two beats of the slowest base, or the drum hits inside it would swing the number. When the fight is too young for it, the base under the stab is used.
  Low is below ${C.lowEdgeHz} Hz, mid is ${C.lowEdgeHz} to ${C.highEdgeHz} Hz, high is above ${C.highEdgeHz} Hz.
  The dB is the power of the whole mix in the stab window over the power of the base before it, per band.
  MASKED: mid or high is under +${C.maskedDb} dB. +${C.maskedDb} dB is four times the base power, so the stab itself carries three times the base, which is the least that stands out of a loop that keeps playing. A boom that sits only in the low band fails it.
  SHORT: the take sounds for under ${C.shortSeconds} s, counted from its first to its last moment above -${C.shortDropDb} dB of its own peak, so it dies before the ear can place it. Sounds s is that time, measured on the stab alone after its gain and pan.
  Base is the base level at the window. Under 1.00 the base is still fading in, so the dB reads too high. Start events after about 6 s.
  The render holds the combat score only. Wind, calm music and the sfx bus are not in it.
`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const FLAGS = {
  '--force': (o) => { o.force = true; },
  '--help': () => { console.log(HELP); process.exit(0); },
};

const VALUES = {
  '--base': (o, v) => { o.base = v; },
  '--take': (o, v) => { o.takes.push(v); },
  '--seed': (o, v) => { o.seed = Number(v); },
  '--length': (o, v) => { o.length = Number(v); },
  '--step': (o, v) => { o.step = Number(v); },
  '--out': (o, v) => { o.out = v; },
  '--sfx-dir': (o, v) => { o.sfxDir = v; },
};

function readArg(o, argv, i) {
  const arg = argv[i];
  if (FLAGS[arg]) FLAGS[arg](o);
  else if (VALUES[arg]) VALUES[arg](o, argv[i + 1] ?? fail(`${arg} needs a value`));
  else if (arg.startsWith('--')) fail(`Unknown option ${arg}`);
  else o.script.push(arg);
  return VALUES[arg] ? i + 1 : i;
}

function parseArgs(argv) {
  const o = { script: [], takes: [], force: false, base: 'any', seed: 1, length: null, step: DEFAULT_STEP_SECONDS, out: 'tmp/score-sim.wav', sfxDir: null };
  for (let i = 0; i < argv.length; i++) i = readArg(o, argv, i);
  if (!Number.isInteger(o.seed)) fail('--seed needs a whole number');
  if (!(o.step > 0 && o.step <= 0.05)) fail('--step needs seconds above 0 and up to 0.05, or the score skips beat slots');
  return o;
}

function fileOf(name, sfxDir) {
  const over = sfxDir && path.join(sfxDir, name);
  return over && existsSync(over) ? over : path.join(SFX_DIR, name);
}

function channelsOf(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
  return Number(out.trim());
}

function decode(file) {
  const channels = channelsOf(file);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ar', String(RATE), '-ac', String(channels), '-'], { maxBuffer: MAX_DECODE_BYTES });
  if (r.status !== 0) fail(`ffmpeg could not decode ${file}: ${r.stderr}`);
  const samples = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / BYTES_PER_SAMPLE);
  const length = samples.length / channels;
  const planes = Array.from({ length: channels }, (_, c) => Float32Array.from({ length }, (__, n) => samples[n * channels + c]));
  return { rate: RATE, channels: planes };
}

function decodeAll(sfxDir) {
  const decoded = new Map();
  const wanted = Object.entries(SOUNDS).filter(([cue]) => cue.startsWith('accent-') || cue.startsWith('score-'));
  for (const [, cue] of wanted) for (const file of cue.files) decoded.set(file, decode(fileOf(file, sfxDir)));
  return decoded;
}

function pinTakes(session, takes) {
  for (const take of takes) {
    const [name, n] = take.split('=');
    const cue = SCRIPT_NAMES[name];
    const file = cue && SOUNDS[cue].files[Number(n) - 1];
    if (!file) fail(`Bad --take "${take}": write event=n with an event from ${NAMES} and n from 1 to its file count`);
    session.pinTake(cue, file);
  }
}

function pickBase(session, base) {
  if (base === 'any') return;
  if (!BASES.includes(base)) fail(`Bad --base "${base}": use ${BASES.join(', ')} or any`);
  session.pickBase(`score-${base}`);
}

function lengthOf(o, events) {
  if (o.length !== null) return o.length;
  return events[events.length - 1].at + AFTER_LAST_EVENT_SECONDS;
}

function interleaved(mix) {
  const out = new Float32Array(mix[0].length * 2);
  for (let n = 0; n < mix[0].length; n++) {
    out[2 * n] = mix[0][n];
    out[2 * n + 1] = mix[1][n];
  }
  return out;
}

function writeWav(mix, file) {
  mkdirSync(path.dirname(file), { recursive: true });
  const data = interleaved(mix);
  const args = ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '2', '-i', '-', '-c:a', 'pcm_f32le', file];
  const r = spawnSync('ffmpeg', args, { input: Buffer.from(data.buffer, data.byteOffset, data.byteLength) });
  if (r.status !== 0) fail(`ffmpeg could not write ${file}: ${r.stderr}`);
}

function peakDb(mix) {
  let peak = 0;
  for (const channel of mix) for (const v of channel) peak = Math.max(peak, Math.abs(v));
  return 20 * Math.log10(peak);
}

function summary(checks) {
  const lines = checks.map((c) => `#${c.id} ${c.label}: ${[c.masked ? 'MASKED' : '', c.short ? 'SHORT' : ''].filter(Boolean).join(' and ') || 'clear'}`);
  return lines.join('\n');
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const events = parseScript(o.script);
  const lengthSeconds = lengthOf(o, events);
  const scoreRng = { rngState: o.seed };
  const playerRng = { rngState: ~o.seed };
  const player = new RecordingPlayer(SOUNDS, decodeAll(o.sfxDir), () => nextRandom(playerRng));
  const session = new ScoreSession({ player, durationOf: (f) => player.durationOf(f), roll: () => nextRandom(scoreRng), wallMs: () => player.now() * 1000 });
  pinTakes(session, o.takes);
  pickBase(session, o.base);
  session.setForced(o.force);
  runScript(session, player, events, { stepSeconds: o.step, lengthSeconds });
  const plan = session.mixPlan();
  const heard = { bases: plan.bases, plays: plan.plays.filter((p) => player.plays[p.index].admitted) };
  const rendered = renderMix(heard, (f) => player.sourceOf(f), RATE, lengthSeconds);
  const inputs = stabInputs(session).filter((i) => heard.plays.some((p) => p.index === i.playIndex));
  const checks = checkStabs(rendered, inputs);
  writeWav(rendered.mix, o.out);
  console.log(`score:sim ${o.script.join(' ')} | base ${o.base} | seed ${o.seed} | force ${o.force} | step ${o.step.toFixed(4)} s | length ${lengthSeconds} s | lead ${(session.leadMs / 1000).toFixed(3)} s`);
  console.log(`\nLedger\n${ledgerText(session)}`);
  console.log(`\nTimeline, seconds from the start of the simulated clock, combat starts at 0\n${timelineText(session, player)}`);
  console.log(`\nStab over base in the mixed render\n${contrastText(checks)}\n${summary(checks)}`);
  console.log(`\nMix peak ${peakDb(rendered.mix).toFixed(1)} dBFS\nWrote ${o.out}`);
}

main();
