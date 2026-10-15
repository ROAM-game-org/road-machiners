import { BAND, BAND_PARTS, MIX, SOUNDS, type BandEvent, type BandPart } from "../data/sounds";
import { Conductor, SoundDesigner, type BarPlan, type Offer } from "../audio/designer";
import { levelAt, type Move } from "./score-session";

export type LoopStem = { kind: "loop"; file: string; gain: number };
export type PhraseStem = { kind: "phrase"; files: readonly string[]; loopBar: number; gain: number };
export const BAND_STEMS: Record<BandPart, LoopStem | PhraseStem> = {
  drums: { kind: "loop", file: "tmp/band/jaw/drums.wav", gain: 1 },
  bass: { kind: "loop", file: "tmp/band/jaw/bass.wav", gain: 1 },
  wall: { kind: "loop", file: "tmp/band/jaw/wall.wav", gain: 1 },
  keys: { kind: "phrase", files: ["tmp/band/jaw/keys-1.wav", "tmp/band/jaw/keys-2.wav"], loopBar: 4, gain: 2 },
};

export function stemFiles(): string[] {
  return BAND_PARTS.flatMap((part) => {
    const stem = BAND_STEMS[part];
    return stem.kind === "loop" ? [stem.file] : [...stem.files];
  });
}
export const BARS_PER_LOOP = 8;
export const BEATS_PER_BAR = 4;
const START_LEAD_SECONDS = 0.1;
const ENTER_BEATS = 1;
const EXIT_DECAY_BEATS = 1;

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

export type Take = { file: string; peak: number };
export type Stab = { cue: BandEvent; file: string; at: number; gain: number; pan: number };
export type BandPress = { cue: BandEvent; at: number; lands: number; result: Offer["result"]; stab: Stab | null };
export type PartMove = { part: BandPart; move: Move };
export type PhrasePlay = { part: BandPart; file: string; at: number; gain: number };
export type BandTick = { moves: PartMove[]; phrases: PhrasePlay[] };
export type BandParts = { now: () => number; take: (cue: BandEvent) => Take; roll: () => number; barSeconds: number };

export function bandLead(peakOf: (cue: BandEvent, file: string) => number): number {
  const peaks = BAND_EVENT_GROUPS.flat().flatMap((cue) => SOUNDS[cue].files.map((file) => peakOf(cue, file)));
  return Math.max(...peaks) + MIX.score.offerAheadSeconds;
}

export class BandSession {
  readonly plans: BarPlan<BandPart>[] = [];
  readonly presses: BandPress[] = [];
  readonly moves = Object.fromEntries(BAND_PARTS.map((p) => [p, [] as Move[]])) as Record<BandPart, Move[]>;
  readonly phrases: PhrasePlay[] = [];
  private taken = new Map<BandPart, number>();
  readonly beat: number;
  readonly start: number;
  private conductor: Conductor<BandPart, BandEvent>;
  private designer: SoundDesigner;
  private next = 0;

  constructor(
    private parts: BandParts,
    readonly lead: number,
  ) {
    this.beat = parts.barSeconds / BEATS_PER_BAR;
    this.start = parts.now() + START_LEAD_SECONDS;
    this.conductor = new Conductor(BAND, this.start, parts.barSeconds);
    this.designer = new SoundDesigner({ start: this.start, beat: this.beat, beatsPerBar: BEATS_PER_BAR }, MIX.score, parts.roll, this.start);
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

  tick(): BandTick {
    const out: BandTick = { moves: [], phrases: [] };
    while (this.barStart(this.next) - this.beat * ENTER_BEATS <= this.parts.now()) {
      const plan = this.conductor.plan(this.next++);
      this.plans.push(plan);
      for (const change of plan.changes) this.change(change.part, change.on, plan.start, out);
      for (const part of plan.sounding) this.phrase(part, plan, out);
    }
    return out;
  }

  private change(part: BandPart, on: boolean, at: number, out: BandTick): void {
    if (BAND_STEMS[part].kind === "phrase") return;
    const move = this.moveOf(part, on, at);
    this.moves[part].push(move);
    out.moves.push({ part, move });
  }

  private phrase(part: BandPart, plan: BarPlan<BandPart>, out: BandTick): void {
    const stem = BAND_STEMS[part];
    if (stem.kind !== "phrase" || plan.bar % BARS_PER_LOOP !== stem.loopBar) return;
    const index = (this.taken.get(part) ?? Math.floor(this.parts.roll() * stem.files.length)) % stem.files.length;
    this.taken.set(part, index + 1);
    const play = { part, file: stem.files[index], at: plan.start, gain: stem.gain };
    this.phrases.push(play);
    out.phrases.push(play);
  }

  fire(cue: BandEvent): BandPress {
    const now = this.parts.now();
    const lands = cue === "accent-sighted" ? now : now + this.lead;
    this.conductor.hear(cue, lands);
    const take = this.parts.take(cue);
    const offer = this.designer.offer(cue, MIX.score.accents[cue], lands, take.peak, this.heatAt(now));
    const stab = offer.stab ? { cue, file: take.file, at: Math.max(now, offer.stab.time), gain: offer.stab.gain, pan: offer.stab.pan } : null;
    const press = { cue, at: now, lands, result: offer.result, stab };
    this.presses.push(press);
    return press;
  }

  phraseAt(part: BandPart, t: number, lengthOf: (file: string) => number): PhrasePlay | undefined {
    return this.phrases.find((p) => p.part === part && p.at <= t && t < p.at + lengthOf(p.file));
  }

  private moveOf(part: BandPart, on: boolean, at: number): Move {
    if (on) return { at: at - this.beat * ENTER_BEATS, target: BAND_STEMS[part].gain, tc: (this.beat * ENTER_BEATS) / 3 };
    return { at, target: 0, tc: this.beat * EXIT_DECAY_BEATS };
  }
}
