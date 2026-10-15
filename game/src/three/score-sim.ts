import { BANK, beatLoopSeconds, MIX, type Cue } from "../data/sounds";
import { BeatLengthMismatch } from "../audio/bank";
import { loudestAt, pickVariant, VoiceLimiter } from "../audio/pick";
import { PEAK_WINDOW_SECONDS, type BeatLoopHandle, type LoopHandle, type Placement, type SoundSelection } from "../audio/player";
import type { AccentCue } from "./sound";
import { EVENT_LABELS, LEDGER_HEAD, ledgerCells, levelAt, type MixPlan, type PlannedBase, type PlannedPlay, type ScoreSession } from "./score-session";

export type Decoded = { rate: number; channels: Float32Array[] };
export type PlayRecord = { id: string; file: string; start: number; from: number; rate: number; volume: number; pan: number; admitted: boolean };

const silentLoop: LoopHandle = {
  setGain: () => undefined,
  glide: () => undefined,
  once: () => undefined,
  stop: () => undefined,
};

function fitLoop(decoded: Decoded, seconds: number, file: string): Decoded {
  const length = Math.round(seconds * decoded.rate);
  const have = decoded.channels[0].length;
  if (Math.abs(have - length) > BANK.beatSlackSeconds * decoded.rate) throw new BeatLengthMismatch(file, have / decoded.rate, seconds);
  const channels = decoded.channels.map((c) => {
    const fitted = new Float32Array(length);
    fitted.set(c.subarray(0, length));
    return fitted;
  });
  return { rate: decoded.rate, channels };
}

export class RecordingPlayer {
  readonly plays: PlayRecord[] = [];
  private time = 0;
  private last = new Map<string, number>();
  private peaks = new Map<string, number>();
  private voices = new VoiceLimiter();
  private buffers = new Map<string, Decoded>();

  constructor(
    private sounds: Record<string, Cue>,
    decoded: Map<string, Decoded>,
    private roll: () => number,
  ) {
    for (const [file, d] of decoded) this.buffers.set(file, d);
    for (const cue of Object.values(sounds)) this.fitBeatFiles(cue);
  }

  advanceTo(seconds: number): void {
    if (seconds < this.time) throw new Error(`The recording clock cannot go back from ${this.time} to ${seconds}`);
    this.time = seconds;
  }

  now(): number {
    return this.time;
  }

  sourceOf(file: string): Decoded {
    return this.buffer(file);
  }

  durationOf(file: string): number {
    const buffer = this.buffer(file);
    return buffer.channels[0].length / buffer.rate;
  }

  play(id: string, at: Placement, delayMs: number, selection?: SoundSelection): void {
    const cue = this.cue(id);
    if (cue.loop) throw new Error(`Sound ${id} is a loop; use loop()`);
    const file = selection ? this.fileOf(id, cue, selection.file) : cue.files[this.nextIndex(id, cue)];
    const rate = selection ? this.checkedRate(id, selection.rate) : 1 + (this.roll() * 2 - 1) * cue.pitchJitter;
    const from = this.checkedFrom(id, selection?.from ?? 0, this.durationOf(file));
    const start = this.time + delayMs / 1000;
    const admitted = this.voices.admit(id, cue.maxVoices, this.time, start + (this.durationOf(file) - from) / rate);
    this.plays.push({ id, file, start, from, rate, volume: cue.volume * at.gain, pan: at.pan, admitted });
  }

  beatLoop(id: string, file: string): BeatLoopHandle {
    const cue = this.cue(id);
    if (!cue.loop) throw new Error(`Sound ${id} is not a loop`);
    this.fileOf(id, cue, file);
    return { ...silentLoop, duration: this.durationOf(file), duck: () => undefined };
  }

  loop(): LoopHandle {
    return silentLoop;
  }

  setBusTone(): void {
    return undefined;
  }

  chooseWithPeak(id: string): { file: string; peak: number } {
    const cue = this.cue(id);
    return this.takeWithPeak(id, cue.files[this.nextIndex(id, cue)]);
  }

  takeWithPeak(id: string, file: string): { file: string; peak: number } {
    this.fileOf(id, this.cue(id), file);
    let peak = this.peaks.get(file);
    if (peak === undefined) {
      const buffer = this.buffer(file);
      peak = loudestAt(buffer.channels[0], buffer.rate, PEAK_WINDOW_SECONDS);
      this.peaks.set(file, peak);
    }
    return { file, peak };
  }

  private fitBeatFiles(cue: Cue): void {
    if (!cue.beat) return;
    for (const file of cue.files) this.buffers.set(file, fitLoop(this.buffer(file), beatLoopSeconds(cue.beat), file));
  }

  private buffer(file: string): Decoded {
    const buffer = this.buffers.get(file);
    if (!buffer) throw new Error(`Sound file ${file} was not loaded`);
    return buffer;
  }

  private cue(id: string): Cue {
    const cue = this.sounds[id];
    if (!cue) throw new Error(`Unknown sound ${id}`);
    return cue;
  }

  private fileOf(id: string, cue: Cue, file: string): string {
    if (!cue.files.includes(file)) throw new Error(`Sound ${id} has no file ${file}`);
    return file;
  }

  private nextIndex(id: string, cue: Cue): number {
    const i = pickVariant(cue.files.length, this.last.get(id) ?? null, this.roll());
    this.last.set(id, i);
    return i;
  }

  private checkedRate(id: string, rate: number): number {
    if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Invalid playback rate for ${id}`);
    return rate;
  }

  private checkedFrom(id: string, from: number, duration: number): number {
    if (!Number.isFinite(from) || from < 0 || (from > 0 && from >= duration)) throw new Error(`Sound ${id} cannot start at ${from} s of a ${duration} s take`);
    return from;
  }
}

export type Stereo = [Float32Array, Float32Array];
export type Stem = { start: number; data: Stereo };
export type Rendered = { rate: number; base: Stereo; stabs: Stereo; mix: Stereo; stems: Map<number, Stem> };
type Pan = { a: number; b: number; c: number; d: number };

const ENVELOPE_BLOCK = 24;

function silence(length: number): Stereo {
  return [new Float32Array(length), new Float32Array(length)];
}

function panCoefficients(channels: number, pan: number): Pan {
  if (channels === 1) {
    const x = ((pan + 1) / 2) * (Math.PI / 2);
    return { a: Math.cos(x), b: 0, c: Math.sin(x), d: 0 };
  }
  if (channels !== 2) throw new Error(`The mix renders mono and stereo files, not ${channels} channels`);
  const x = (pan <= 0 ? pan + 1 : pan) * (Math.PI / 2);
  return pan <= 0 ? { a: 1, b: Math.cos(x), c: 0, d: Math.sin(x) } : { a: Math.cos(x), b: 0, c: Math.sin(x), d: 1 };
}

function addPanned(out: Stereo, at: number, source: Decoded, sourceAt: number, pan: Pan, gain: number): void {
  const [left, right] = source.channels;
  const inL = left[sourceAt];
  const inR = right ? right[sourceAt] : 0;
  out[0][at] += gain * (pan.a * inL + pan.b * inR);
  out[1][at] += gain * (pan.c * inL + pan.d * inR);
}

function baseGainAt(base: PlannedBase, t: number): number {
  return base.volume * levelAt(base.gain, 0, t) * levelAt(base.duck, 1, t);
}

function renderBase(base: PlannedBase, source: Decoded, out: Stereo): void {
  const rate = source.rate;
  const length = source.channels[0].length;
  const pan = panCoefficients(source.channels.length, 0);
  const startAt = Math.round(base.when * rate);
  const offset = Math.round(base.offset * rate);
  for (let block = Math.max(0, startAt); block < out[0].length; block += ENVELOPE_BLOCK) {
    const from = baseGainAt(base, block / rate);
    const to = baseGainAt(base, (block + ENVELOPE_BLOCK) / rate);
    const end = Math.min(out[0].length, block + ENVELOPE_BLOCK);
    for (let n = block; n < end; n++) {
      const gain = from + ((to - from) * (n - block)) / ENVELOPE_BLOCK;
      addPanned(out, n, source, (n - startAt + offset) % length, pan, gain);
    }
  }
}

function playGain(play: PlannedPlay, joinSeconds: number, rate: number, n: number): number {
  if (play.from === 0) return play.volume;
  return play.volume * Math.min(1, n / (joinSeconds * rate));
}

function renderPlay(play: PlannedPlay, source: Decoded, joinSeconds: number): Stem {
  const rate = source.rate;
  const from = Math.round(play.from * rate);
  const count = source.channels[0].length - from;
  const data = silence(count);
  const pan = panCoefficients(source.channels.length, play.pan);
  for (let n = 0; n < count; n++) addPanned(data, n, source, from + n, pan, playGain(play, joinSeconds, rate, n));
  return { start: Math.round(play.start * rate), data };
}

function addStem(out: Stereo, stem: Stem): void {
  for (let c = 0; c < 2; c++) {
    const end = Math.min(out[c].length, stem.start + stem.data[c].length);
    for (let n = Math.max(0, stem.start); n < end; n++) out[c][n] += stem.data[c][n - stem.start];
  }
}

function sum(a: Stereo, b: Stereo): Stereo {
  const mix = silence(a[0].length);
  for (let c = 0; c < 2; c++) for (let n = 0; n < mix[c].length; n++) mix[c][n] = a[c][n] + b[c][n];
  return mix;
}

export function renderMix(plan: MixPlan, decodedOf: (file: string) => Decoded, rate: number, seconds: number): Rendered {
  const sourceOf = (file: string): Decoded => {
    const source = decodedOf(file);
    if (source.rate !== rate) throw new Error(`Sound file ${file} is at ${source.rate} Hz, the mix renders at ${rate} Hz`);
    return source;
  };
  const length = Math.ceil(seconds * rate);
  const base = silence(length);
  for (const b of plan.bases) renderBase(b, sourceOf(b.file), base);
  const stabs = silence(length);
  const stems = new Map<number, Stem>();
  for (const p of plan.plays) {
    const stem = renderPlay(p, sourceOf(p.file), MIX.score.joinFadeSeconds);
    stems.set(p.index, stem);
    addStem(stabs, stem);
  }
  return { rate, base, stabs, mix: sum(base, stabs), stems };
}

export type Band = "low" | "mid" | "high";
export type StabInput = { id: number; label: string; start: number; playIndex: number; baseGain: number };
export type StabCheck = {
  id: number;
  label: string;
  contrast: Record<Band, number>;
  baseGain: number;
  loudSeconds: number;
  masked: boolean;
  short: boolean;
  others: number;
  note: string;
};

export const SCORE_CHECK = {
  windowSeconds: 0.5,
  referenceSeconds: 1.5,
  maskedDb: 6,
  shortSeconds: 0.5,
  shortDropDb: 15,
  hopSeconds: 0.01,
  lowEdgeHz: 200,
  highEdgeHz: 2000,
};
const BANDS: Band[] = ["low", "mid", "high"];
const BUTTERWORTH_Q = Math.SQRT1_2;

type Coefficients = { b0: number; b1: number; b2: number; a1: number; a2: number };
type Bands = Record<Band, Stereo>;

function section(kind: "lowpass" | "highpass", hz: number, rate: number): Coefficients {
  const w = (2 * Math.PI * hz) / rate;
  const alpha = Math.sin(w) / (2 * BUTTERWORTH_Q);
  const cos = Math.cos(w);
  const edge = kind === "lowpass" ? (1 - cos) / 2 : (1 + cos) / 2;
  const b1 = kind === "lowpass" ? 1 - cos : -(1 + cos);
  const a0 = 1 + alpha;
  return { b0: edge / a0, b1: b1 / a0, b2: edge / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

function run(x: Float32Array, k: Coefficients): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let n = 0; n < x.length; n++) {
    const out = k.b0 * x[n] + k.b1 * x1 + k.b2 * x2 - k.a1 * y1 - k.a2 * y2;
    x2 = x1;
    x1 = x[n];
    y2 = y1;
    y1 = out;
    y[n] = out;
  }
  return y;
}

function filter(x: Float32Array, kind: "lowpass" | "highpass", hz: number, rate: number): Float32Array {
  const k = section(kind, hz, rate);
  return run(run(x, k), k);
}

function bandOf(x: Float32Array, band: Band, rate: number): Float32Array {
  const { lowEdgeHz, highEdgeHz } = SCORE_CHECK;
  if (band === "low") return filter(x, "lowpass", lowEdgeHz, rate);
  if (band === "high") return filter(x, "highpass", highEdgeHz, rate);
  return filter(filter(x, "highpass", lowEdgeHz, rate), "lowpass", highEdgeHz, rate);
}

function splitBands(signal: Stereo, rate: number): Bands {
  const split = (band: Band): Stereo => [bandOf(signal[0], band, rate), bandOf(signal[1], band, rate)];
  return { low: split("low"), mid: split("mid"), high: split("high") };
}

function meanPower(signal: Stereo, rate: number, from: number, to: number): number {
  const start = Math.max(0, Math.floor(from * rate));
  const end = Math.min(signal[0].length, Math.ceil(to * rate));
  if (end <= start) throw new Error(`The window ${from} to ${to} s is outside the render`);
  let total = 0;
  for (let n = start; n < end; n++) total += signal[0][n] ** 2 + signal[1][n] ** 2;
  return total / (end - start);
}

function decibels(power: number, reference: number): number {
  if (power === 0) return -Infinity;
  if (reference === 0) return Infinity;
  return 10 * Math.log10(power / reference);
}

export function loudSeconds(stem: Stem, rate: number): number {
  const hop = Math.round(SCORE_CHECK.hopSeconds * rate);
  const powers: number[] = [];
  for (let n = 0; n < stem.data[0].length; n += hop) powers.push(meanPower(stem.data, rate, n / rate, (n + hop) / rate));
  const floor = Math.max(...powers) * 10 ** (-SCORE_CHECK.shortDropDb / 10);
  const loud = powers.flatMap((p, i) => (p >= floor ? [i] : []));
  return (loud[loud.length - 1] - loud[0] + 1) * SCORE_CHECK.hopSeconds;
}

function referenceWindow(input: StabInput, win: [number, number]): { span: [number, number]; note: string } {
  const preEnd = win[0];
  const preStart = preEnd - SCORE_CHECK.referenceSeconds;
  if (preStart < 0) return { span: win, note: "no base before it, base under it used" };
  return { span: [preStart, preEnd], note: "" };
}

function overlapping(rendered: Rendered, own: number, win: [number, number]): number {
  let count = 0;
  for (const [index, stem] of rendered.stems) {
    const from = stem.start / rendered.rate;
    const to = from + stem.data[0].length / rendered.rate;
    if (index !== own && from < win[1] && to > win[0]) count++;
  }
  return count;
}

function checkStab(rendered: Rendered, mix: Bands, base: Bands, input: StabInput): StabCheck {
  const { windowSeconds, maskedDb, shortSeconds } = SCORE_CHECK;
  const win: [number, number] = [input.start, input.start + windowSeconds];
  const ref = referenceWindow(input, win);
  const rate = rendered.rate;
  const contrast = Object.fromEntries(BANDS.map((b) => [b, decibels(meanPower(mix[b], rate, ...win), meanPower(base[b], rate, ...ref.span))])) as Record<Band, number>;
  const stem = rendered.stems.get(input.playIndex);
  const loud = stem ? loudSeconds(stem, rate) : 0;
  return {
    id: input.id,
    label: input.label,
    contrast,
    baseGain: input.baseGain,
    loudSeconds: loud,
    masked: !(contrast.mid >= maskedDb && contrast.high >= maskedDb),
    short: loud < shortSeconds,
    others: overlapping(rendered, input.playIndex, win),
    note: ref.note,
  };
}

export function checkStabs(rendered: Rendered, inputs: StabInput[]): StabCheck[] {
  const mix = splitBands(rendered.mix, rendered.rate);
  const base = splitBands(rendered.base, rendered.rate);
  return inputs.map((input) => checkStab(rendered, mix, base, input));
}

function signed(db: number): string {
  if (!Number.isFinite(db)) return db > 0 ? "inf" : "-inf";
  return `${db >= 0 ? "+" : ""}${db.toFixed(1)}`;
}

function flagsOf(c: StabCheck): string {
  const flags = [c.masked ? "MASKED" : "", c.short ? "SHORT" : ""].filter((f) => f !== "");
  const notes = [c.others > 0 ? `${c.others} other sounds in the window` : "", c.note].filter((n) => n !== "");
  return [...flags, ...notes.map((n) => `(${n})`)].join(" ");
}

export function contrastText(checks: StabCheck[]): string {
  const head = ["#", "Event", "Low dB", "Mid dB", "High dB", "Base", "Sounds s", "Flags"];
  const rows = checks.map((c) => [
    String(c.id),
    c.label,
    signed(c.contrast.low),
    signed(c.contrast.mid),
    signed(c.contrast.high),
    c.baseGain.toFixed(2),
    c.loudSeconds.toFixed(2),
    flagsOf(c),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((cell, i) => cell.padEnd(widths[i])).join("  ").trimEnd();
  return [line(head), ...rows.map(line)].join("\n");
}

export type ScriptEvent = { name: string; cue: AccentCue; at: number };
export type ScriptRun = { stepSeconds: number; lengthSeconds: number };
type Entry = { at: number; text: string };

export const SCRIPT_NAMES: Record<string, AccentCue> = {
  sighted: "accent-sighted",
  struck: "accent-struck",
  crit: "accent-crit",
  crash: "accent-crash",
  hit: "accent-hit",
  miss: "accent-miss",
};

export function parseScript(tokens: string[]): ScriptEvent[] {
  if (tokens.length === 0) throw new Error(`A script needs events like hit@1.0, from ${Object.keys(SCRIPT_NAMES).join(", ")}`);
  return tokens.map(parseEvent).sort((a, b) => a.at - b.at);
}

function parseEvent(token: string): ScriptEvent {
  const parts = token.split("@");
  const cue = SCRIPT_NAMES[parts[0]];
  if (parts.length !== 2 || !cue || !/^\d+(\.\d+)?$/.test(parts[1])) {
    throw new Error(`Bad script event "${token}": write name@seconds with a name from ${Object.keys(SCRIPT_NAMES).join(", ")}`);
  }
  return { name: parts[0], cue, at: Number(parts[1]) };
}

export function runScript(session: ScoreSession, clock: Pick<RecordingPlayer, "advanceTo">, events: ScriptEvent[], run: ScriptRun): void {
  session.flipCombat();
  session.frame();
  const steps = Math.round(run.lengthSeconds / run.stepSeconds);
  let next = 0;
  for (let i = 1; i <= steps; i++) {
    const t = i * run.stepSeconds;
    clock.advanceTo(t);
    for (; next < events.length && events[next].at <= t; next++) session.fire(events[next].cue);
    session.frame();
  }
  if (next < events.length) throw new Error(`The script has events after its length of ${run.lengthSeconds} s`);
}

export function ledgerText(session: ScoreSession): string {
  const head = ["#", ...LEDGER_HEAD.slice(1, -1), "Note"];
  const rows = session.ledger().map(ledgerCells);
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((cell, i) => cell.padEnd(widths[i])).join("  ").trimEnd();
  return [line(head), ...rows.map(line)].join("\n");
}

function baseEntries(base: PlannedBase): Entry[] {
  const start = { at: base.when, text: `base ${base.id} starts, ${base.offset.toFixed(3)} s into its ${base.duration.toFixed(2)} s loop` };
  const gains = base.gain.map((m) => ({ at: m.at, text: `base ${base.id} level goes to ${m.target.toFixed(2)} over ${(m.tc * 3).toFixed(2)} s` }));
  const ducks = base.duck.map((m) => ({ at: m.at, text: m.target < 1 ? `duck: base drops to ${m.target.toFixed(2)} in ${(m.tc * 3).toFixed(2)} s` : `duck: base comes back over ${(m.tc * 3).toFixed(2)} s` }));
  return [start, ...gains, ...ducks];
}

function playEntries(session: ScoreSession, plan: MixPlan, recorder: RecordingPlayer): Entry[] {
  return plan.plays.map((p) => {
    const record = recorder.plays[p.index];
    const seconds = recorder.durationOf(p.file) - p.from;
    const what = p.stab ? `stab of #${p.owner}` : `tail of #${p.owner}`;
    const where = `${session.sounded[p.index].gain.toFixed(2)} gain, pan ${p.pan.toFixed(2)}`;
    const dropped = record.admitted ? "" : ", dropped by the voice limit";
    const joined = p.from > 0 ? `, starts ${p.from.toFixed(2)} s into the take` : "";
    return { at: p.start, text: `${what} ${p.file} for ${seconds.toFixed(2)} s, ${where}${joined}${dropped}` };
  });
}

function eventEntries(session: ScoreSession): Entry[] {
  const presses = session.presses.map((p) => ({ at: p.at, text: `press #${p.id} ${EVENT_LABELS[p.cue]}` }));
  const results = session.offers.map((o) => ({ at: o.at, text: `#${o.id} ${EVENT_LABELS[o.cue]} lands, ${o.result} on ${o.line}, heat ${o.heat.toFixed(1)}` }));
  return [...presses, ...results];
}

export function timelineText(session: ScoreSession, recorder: RecordingPlayer): string {
  const plan = session.mixPlan();
  const entries = [...plan.bases.flatMap(baseEntries), ...playEntries(session, plan, recorder), ...eventEntries(session)];
  return entries
    .sort((a, b) => a.at - b.at)
    .map((e) => `${e.at.toFixed(3).padStart(7)}  ${e.text}`)
    .join("\n");
}

export function stabInputs(session: ScoreSession): StabInput[] {
  const plan = session.mixPlan();
  const base = plan.bases[0];
  return session.offers.filter((o) => o.result === "played" || o.result === "forced").map((o) => {
    const stab = plan.plays.find((p) => p.stab && p.owner === o.id);
    if (!stab) throw new Error(`Event ${o.id} played with no stab`);
    return { id: o.id, label: EVENT_LABELS[o.cue], start: stab.start, playIndex: stab.index, baseGain: gainBefore(base, stab.start) };
  });
}

function gainBefore(base: PlannedBase | undefined, t: number): number {
  if (!base) throw new Error("The score played no base");
  return levelAt(base.gain, 0, t);
}
