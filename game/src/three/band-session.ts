import { BAND, BAND_ANSWERS, BAND_PARTS, type BandEvent, type BandPart } from "../data/sounds";
import { Conductor, type BarPlan } from "../audio/designer";
import { levelAt, type Move } from "./score-session";

export type LoopStem = { kind: "loop"; file: string; gain: number };
export type PhraseStem = { kind: "phrase"; files: readonly string[]; loopBar: number; gain: number };
export const BAND_STEMS: Record<BandPart, LoopStem | PhraseStem> = {
  drums: { kind: "loop", file: "tmp/band/jaw/drums.wav", gain: 1 },
  bass: { kind: "loop", file: "tmp/band/jaw/bass.wav", gain: 1 },
  wall: { kind: "loop", file: "tmp/band/jaw/wall.wav", gain: 1 },
  keys: { kind: "phrase", files: ["tmp/band/jaw/keys-1.wav", "tmp/band/jaw/keys-2.wav"], loopBar: 4, gain: 2 },
};
export const BARS_PER_LOOP = 8;
export const BEATS_PER_BAR = 4;
export const ANSWER_SLOTS_PER_BEAT = 2;
export const ANSWER_ATTACK_SECONDS = 0.005;
export const ANSWER_DECAY_BEATS = 0.25;
export const ANSWER_GAIN = 1.4;
const START_LEAD_SECONDS = 0.1;
const ENTER_BEATS = 1;
const EXIT_DECAY_BEATS = 1;
const LEAD_SECONDS = 0.6;

export const BAND_EVENT_LABELS: Record<BandEvent, string> = {
  "accent-sighted": "Sighted",
  "accent-struck": "Hit you",
  "accent-crit": "You crit",
  "accent-crash": "Crash",
  "accent-hit": "You hit",
  "accent-miss": "You miss",
};
export const BAND_EVENT_GROUPS: BandEvent[][] = [
  ["accent-sighted", "accent-struck", "accent-crit", "accent-crash"],
  ["accent-hit", "accent-miss"],
];

export type PartPlay = { part: BandPart; cue: BandEvent | null; file: string; at: number; from: number; seconds: number | null; gain: number };
export type BandPress = { cue: BandEvent; at: number; lands: number; answers: PartPlay[]; crowded: BandPart[]; cut: PartPlay[] };
export type PartMove = { part: BandPart; move: Move };
export type BandTick = { moves: PartMove[]; plays: PartPlay[] };
export type BandParts = { now: () => number; roll: () => number; barSeconds: number };

export function stemFiles(): string[] {
  return BAND_PARTS.flatMap((part) => {
    const stem = BAND_STEMS[part];
    return stem.kind === "loop" ? [stem.file] : [...stem.files];
  });
}

export function answerLevel(play: PartPlay, t: number, beat: number): number {
  const into = t - play.at;
  if (play.seconds === null || into < 0) return into < 0 ? 0 : play.gain;
  if (into < ANSWER_ATTACK_SECONDS) return (play.gain * into) / ANSWER_ATTACK_SECONDS;
  if (into < play.seconds) return play.gain;
  return play.gain * Math.exp(-(into - play.seconds) / (beat * ANSWER_DECAY_BEATS));
}

export class BandSession {
  readonly plans: BarPlan<BandPart>[] = [];
  readonly presses: BandPress[] = [];
  readonly plays: PartPlay[] = [];
  readonly moves = Object.fromEntries(BAND_PARTS.map((p) => [p, [] as Move[]])) as Record<BandPart, Move[]>;
  readonly beat: number;
  readonly start: number;
  readonly lead = LEAD_SECONDS;
  private conductor: Conductor<BandPart, BandEvent>;
  private next = 0;
  private taken = new Map<BandPart, number>();
  private owed = new Set<BandPart>();

  constructor(private parts: BandParts) {
    this.beat = parts.barSeconds / BEATS_PER_BAR;
    this.start = parts.now() + START_LEAD_SECONDS;
    this.conductor = new Conductor(BAND, this.start, parts.barSeconds);
  }

  barStart(bar: number): number {
    return this.conductor.barStart(bar);
  }

  heatAt(t: number): number {
    return this.conductor.heatAt(t);
  }

  levelOf(part: BandPart, t: number): number {
    return levelAt(this.moves[part], 0, t);
  }

  playingAt(part: BandPart, t: number, lengthOf: (file: string) => number): PartPlay | undefined {
    return this.plays.find((p) => p.part === part && p.at <= t && t < p.at + (p.seconds ?? lengthOf(p.file)));
  }

  tick(): BandTick {
    const out: BandTick = { moves: [], plays: [] };
    while (this.barStart(this.next) - this.beat * ENTER_BEATS <= this.parts.now()) {
      const plan = this.conductor.plan(this.next++);
      this.plans.push(plan);
      for (const change of plan.changes) this.change(change.part, change.on, plan.start, out);
      for (const part of BAND_PARTS) if (plan.sounding.includes(part) || this.owed.has(part)) this.phrase(part, plan, out);
    }
    return out;
  }

  fire(cue: BandEvent): BandPress {
    const now = this.parts.now();
    const lands = cue === "accent-sighted" ? now : now + this.lead;
    this.conductor.hear(cue, lands);
    const answer = BAND_ANSWERS[cue];
    const slot = this.slotNear(lands, now);
    const press: BandPress = { cue, at: now, lands, answers: [], crowded: [], cut: [] };
    for (const part of answer.parts) this.answer(press, part, slot, answer.beats * this.beat);
    this.presses.push(press);
    return press;
  }

  private answer(press: BandPress, part: BandPart, at: number, seconds: number): void {
    const stem = BAND_STEMS[part];
    if (stem.kind !== "loop") throw new Error(`Part ${part} has no loop to answer from`);
    const busy = this.plays.find((p) => p.part === part && p.cue !== null && p.at <= at && at < p.at + p.seconds!);
    if (busy && BAND.weights[busy.cue!] >= BAND.weights[press.cue]) {
      press.crowded.push(part);
      return;
    }
    if (busy) {
      busy.seconds = at - busy.at;
      if (busy.seconds < ANSWER_ATTACK_SECONDS) busy.gain = 0;
      press.cut.push(busy);
    }
    const loopSeconds = this.parts.barSeconds * BARS_PER_LOOP;
    const from = (((at - this.start) % loopSeconds) + loopSeconds) % loopSeconds;
    const play = { part, cue: press.cue, file: stem.file, at, from, seconds, gain: stem.gain * ANSWER_GAIN };
    this.plays.push(play);
    press.answers.push(play);
  }

  private slotNear(t: number, now: number): number {
    const slot = this.beat / ANSWER_SLOTS_PER_BEAT;
    const nearest = this.start + Math.round((t - this.start) / slot) * slot;
    return nearest >= now ? nearest : nearest + slot;
  }

  private change(part: BandPart, on: boolean, at: number, out: BandTick): void {
    if (BAND_STEMS[part].kind === "phrase") {
      if (on) this.owed.add(part);
      return;
    }
    const move = this.moveOf(part, on, at);
    this.moves[part].push(move);
    out.moves.push({ part, move });
  }

  private phrase(part: BandPart, plan: BarPlan<BandPart>, out: BandTick): void {
    const stem = BAND_STEMS[part];
    if (stem.kind !== "phrase" || plan.bar % BARS_PER_LOOP !== stem.loopBar) return;
    const index = (this.taken.get(part) ?? Math.floor(this.parts.roll() * stem.files.length)) % stem.files.length;
    this.taken.set(part, index + 1);
    this.owed.delete(part);
    const play = { part, cue: null, file: stem.files[index], at: plan.start, from: 0, seconds: null, gain: stem.gain };
    this.plays.push(play);
    out.plays.push(play);
  }

  private moveOf(part: BandPart, on: boolean, at: number): Move {
    if (on) return { at: at - this.beat * ENTER_BEATS, target: BAND_STEMS[part].gain, tc: (this.beat * ENTER_BEATS) / 3 };
    return { at, target: 0, tc: this.beat * EXIT_DECAY_BEATS };
  }
}
