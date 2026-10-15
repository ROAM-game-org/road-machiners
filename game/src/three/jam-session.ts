import { BEATS_PER_BAR, JAM, JAM_ANSWERS, JAM_MIX, JAM_PARTS, SCORE_BLOCKS, type BandEvent, type JamPart } from "../data/sounds";
import { Conductor, type BarPlan } from "../audio/designer";
import { BlockSession, DENSE_TURN, TURN_SECONDS, type BlockOutput, type BlockSong, type Part, type Played, type VoiceHandle } from "./block-session";
import { levelAt, type Move } from "./score-session";

export type JamSong = Omit<BlockSong, "file" | "stems"> & { parts: Record<JamPart, string> };
export type JamSwitches = { parts: "band" | "all"; answers: "band" | "off"; jumps: "ring" | "fade" };
export type TakeKind = "block" | "push" | "cymbal" | "answer";
export type Take = { kind: TakeKind; part: JamPart; cue: BandEvent | null; from: number; at: number; fadeIn: number; until: number; endFade: number; ring: number | null; gain: number };
export type JamPress = { cue: BandEvent; at: number; slot: number | null; answers: Take[]; crowded: JamPart[]; cut: Take[] };
export type JamOutput = { play(take: Take): void; end(take: Take): void; move(part: JamPart, move: Move): void; duck(moves: readonly Move[], from: number): void };

export const JAM_DEFAULTS: JamSwitches = { parts: "band", answers: "band", jumps: "fade" };
const RING_TIME_CONSTANTS = 7;
const SLOT_EPSILON = 1e-6;
const PUSHED: JamPart = "guitar";

export function onPartBus(take: Take): boolean {
  return take.kind === "block" || take.kind === "push";
}

export function ducked(take: Take): boolean {
  return take.kind === "block";
}

export function takeEnd(take: Take): number {
  return take.until + (take.ring === null ? take.endFade : take.ring * RING_TIME_CONSTANTS);
}

export function endStart(take: Take): number {
  return take.ring === null ? take.until - take.endFade : take.until;
}

export function takeLevel(take: Take, t: number): number {
  const rise = take.at - take.fadeIn;
  if (t < rise) return 0;
  const risen = Math.min(1, (t - rise) / (2 * take.fadeIn));
  return take.gain * Math.min(risen, endShape(take, t));
}

function endShape(take: Take, t: number): number {
  if (take.ring !== null) return t < take.until ? 1 : Math.exp(-(t - take.until) / take.ring);
  const start = endStart(take);
  if (t < start) return 1;
  return Math.max(0, 1 - (t - start) / (2 * take.endFade));
}

export class JamSession {
  readonly takes: Take[] = [];
  readonly presses: JamPress[] = [];
  readonly plans: BarPlan<JamPart>[] = [];
  readonly moves = Object.fromEntries(JAM_PARTS.map((p) => [p, [] as Move[]])) as Record<JamPart, Move[]>;
  readonly ducks: Move[] = [];
  readonly blocks: BlockSession;
  readonly beat: number;
  readonly barSeconds: number;
  private conductor: Conductor<JamPart, BandEvent> | null = null;
  private gridStart = 0;
  private nextBar = 0;
  private on = new Set<JamPart>();
  private pending: JamPress[] = [];

  constructor(
    private song: JamSong,
    private out: JamOutput,
    private roll: () => number,
    readonly switches: JamSwitches = { ...JAM_DEFAULTS },
  ) {
    const bars = song.barTimes;
    this.barSeconds = (bars[bars.length - 1] - bars[0]) / (bars.length - 1);
    this.beat = this.barSeconds / BEATS_PER_BAR;
    const blockSong: BlockSong = { ...song, file: song.parts.drums, stems: { drums: song.parts.drums, guitars: song.parts[PUSHED] } };
    this.blocks = new BlockSession(blockSong, this.blockOutput(), roll);
  }

  get inCombat(): boolean {
    return this.conductor !== null;
  }

  levelOf(part: JamPart, t: number): number {
    return levelAt(this.moves[part], 0, t);
  }

  duckAt(t: number): number {
    return levelAt(this.ducks, 1, t);
  }

  heatAt(t: number): number {
    return this.blocks.heatAt(t);
  }

  playingAt(t: number): Played | undefined {
    return this.blocks.playingAt(t);
  }

  start(now: number): void {
    this.blocks.start(now);
    this.gridStart = this.blocks.played.at(-1)!.start;
    this.conductor = new Conductor(JAM, this.gridStart, this.barSeconds);
    this.nextBar = 0;
    this.on.clear();
    this.pending = [];
    this.tick(now);
  }

  end(now: number): void {
    const at = this.blocks.end(now);
    this.conductor = null;
    this.pending = [];
    for (const part of JAM_PARTS) if (!this.on.has(part)) this.turn(part, true, at, true);
  }

  fire(cue: BandEvent, now: number): JamPress | null {
    return this.fireAt(cue, now + SCORE_BLOCKS.eventLeadSeconds);
  }

  denseTurn(now: number): void {
    const start = now + SCORE_BLOCKS.eventLeadSeconds;
    for (const [cue, most] of DENSE_TURN) {
      const count = Math.floor(this.roll() * (most + 1));
      for (let i = 0; i < count; i++) this.fireAt(cue, start + this.roll() * TURN_SECONDS);
    }
  }

  private fireAt(cue: BandEvent, at: number): JamPress | null {
    if (!this.conductor) return null;
    this.blocks.fire(cue, at);
    this.conductor.hear(cue, at);
    const press: JamPress = { cue, at, slot: null, answers: [], crowded: [], cut: [] };
    this.presses.push(press);
    if (this.switches.answers === "band") this.pending.push(press);
    return press;
  }

  tick(now: number): void {
    if (!this.conductor) return;
    this.blocks.tick(now);
    const ahead = now + SCORE_BLOCKS.aheadSeconds;
    while (this.conductor.barStart(this.nextBar) - this.beat * JAM_MIX.enterBeats <= ahead) this.arrange(this.conductor.plan(this.nextBar++));
    this.pending = this.pending.filter((press) => !this.answered(press));
  }

  private arrange(plan: BarPlan<JamPart>): void {
    this.plans.push(plan);
    for (const part of JAM_PARTS) {
      const wanted = this.switches.parts === "all" || plan.sounding.includes(part);
      if (wanted !== this.on.has(part)) this.turn(part, wanted, plan.start, plan.bar === 0);
    }
  }

  private turn(part: JamPart, on: boolean, at: number, first: boolean): void {
    if (on) this.on.add(part);
    else this.on.delete(part);
    const move = this.moveOf(on, at, first);
    this.moves[part].push(move);
    this.out.move(part, move);
  }

  private moveOf(on: boolean, at: number, first: boolean): Move {
    if (!on) return { at, target: 0, tc: this.beat * JAM_MIX.exitBeats };
    if (first) return { at, target: 1, tc: JAM_MIX.firstEnterSeconds };
    const lead = this.beat * JAM_MIX.enterBeats;
    return { at: at - lead, target: 1, tc: lead / 3 };
  }

  private answered(press: JamPress): boolean {
    const slot = this.slotAfter(press.at);
    const block = this.blocks.played.find((p) => p.role !== "end" && p.start <= slot && slot < p.end);
    if (!block) return false;
    press.slot = slot;
    const answer = JAM_ANSWERS[press.cue];
    for (const part of answer.parts) this.answer(press, part, block, answer.beats * this.beat);
    return true;
  }

  private slotAfter(t: number): number {
    const slot = this.beat / JAM_MIX.answerSlotsPerBeat;
    return this.gridStart + Math.ceil((t - this.gridStart) / slot - SLOT_EPSILON) * slot;
  }

  private answer(press: JamPress, part: JamPart, block: Played, seconds: number): void {
    const at = press.slot!;
    const busy = this.takes.find((t) => t.kind === "answer" && t.part === part && t.at <= at && at < t.until);
    if (busy && JAM.weights[busy.cue!] >= JAM.weights[press.cue]) {
      press.crowded.push(part);
      return;
    }
    if (busy) this.takeOver(press, busy, at);
    const from = this.song.barTimes[block.bar - 1] + (at - block.start);
    const gain = Math.max(0, JAM_MIX.accent - this.levelOf(part, at)) * SCORE_BLOCKS.songGain * block.level;
    const take: Take = { kind: "answer", part, cue: press.cue, from, at, fadeIn: JAM_MIX.answerAttackSeconds, until: at + seconds, endFade: 0, ring: this.beat * JAM_MIX.answerDecayBeats, gain };
    this.add(take);
    press.answers.push(take);
  }

  private takeOver(press: JamPress, busy: Take, at: number): void {
    busy.until = at;
    if (at - busy.at < JAM_MIX.answerAttackSeconds) busy.gain = 0;
    press.cut.push(busy);
    this.out.end(busy);
  }

  private add(take: Take): void {
    this.takes.push(take);
    this.out.play(take);
  }

  private blockOutput(): BlockOutput {
    return {
      voice: (part, offset, when, length, fade, level) => this.voice(part, offset, when, length, fade, level),
      lean: (offset, at, length, songScale, guitarLevel) => this.lean(offset, at, length, songScale, guitarLevel),
    };
  }

  private lean(offset: number, at: number, length: number, songScale: number, guitarLevel: number): VoiceHandle {
    const seam = SCORE_BLOCKS.seamSeconds;
    const take: Take = { kind: "push", part: PUSHED, cue: null, from: offset, at, fadeIn: seam, until: at + length, endFade: seam, ring: null, gain: guitarLevel * SCORE_BLOCKS.songGain * SCORE_BLOCKS.guitarPush };
    this.add(take);
    this.setDuck(at - seam, songScale);
    this.setDuck(at + length - seam, 1);
    return {
      fadeOut: (t, f) => this.jumpEnd(take, t, f),
      cut: (t) => this.unduck(take, t),
    };
  }

  private setDuck(at: number, target: number): void {
    const move = { at, target, tc: SCORE_BLOCKS.seamSeconds / 3 };
    this.ducks.push(move);
    this.out.duck([move], at);
  }

  private unduck(take: Take, t: number): void {
    this.cut(take, t);
    const from = t - SCORE_BLOCKS.seamSeconds;
    const kept = this.ducks.filter((m) => m.at < from);
    this.ducks.splice(0, this.ducks.length, ...kept, { at: from, target: 1, tc: SCORE_BLOCKS.seamSeconds / 3 });
    this.out.duck(this.ducks.slice(kept.length), from);
  }

  private voice(part: Part, offset: number, when: number, length: number, fade: number, level: number): VoiceHandle {
    if (part === "guitars") throw new Error("The block session asked for a guitars voice, which only a lean plays");
    const kind: TakeKind = part === "song" ? "block" : "cymbal";
    const parts: readonly JamPart[] = part === "song" ? JAM_PARTS : ["drums"];
    const gain = level * SCORE_BLOCKS.songGain;
    const takes: Take[] = parts.map((p) => ({ kind, part: p, cue: null, from: offset, at: when, fadeIn: fade, until: when + length, endFade: SCORE_BLOCKS.seamSeconds, ring: null, gain }));
    for (const take of takes) this.add(take);
    return {
      fadeOut: (at, f) => takes.forEach((t) => this.jumpEnd(t, at, f)),
      cut: (at) => takes.forEach((t) => this.cut(t, at)),
    };
  }

  private jumpEnd(take: Take, at: number, fade: number): void {
    take.until = at;
    if (this.switches.jumps === "ring" && take.part !== "drums") take.ring = this.beat * JAM_MIX.ringBeats;
    else take.endFade = fade;
    this.out.end(take);
  }

  private cut(take: Take, at: number): void {
    if (at <= take.at - take.fadeIn) take.gain = 0;
    take.until = Math.max(take.at, at);
    take.endFade = SCORE_BLOCKS.seamSeconds;
    take.ring = null;
    this.out.end(take);
  }
}
