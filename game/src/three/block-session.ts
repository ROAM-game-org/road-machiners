import { BEATS_PER_BAR, MIX, SCORE_BLOCKS } from "../data/sounds";
import { BlockSequencer, blocksOf, Fading, SoundDesigner, type Block, type Hit, type LineId, type Role, type Section } from "../audio/designer";
import type { AccentCue } from "./sound";

export type BlockSong = {
  file: string;
  stems: { drums: string; guitars: string };
  bpm: number;
  length: number;
  barTimes: number[];
  sections: Section[];
  end: number;
};
export type Part = "song" | "guitars";
export type VoiceHandle = { fadeOut(at: number, fade: number): void; cut(at: number): void };
export type BlockOutput = {
  voice(part: Part, offset: number, when: number, length: number, fade: number): VoiceHandle;
  fill(offset: number, at: number, length: number, level: number): void;
};
export type Played = { label: string; role: Role | "end"; bar: number; bars: number; start: number; end: number; voices: VoiceHandle[]; heat: number; odds: string; join: string; guitars: boolean };
export type Fired = { cue: AccentCue; at: number; result: string | null };
export type Push = { at: number; line: LineId; stab: boolean; fillBar: number };

export const TURN_SECONDS = 1;
export const HEAVY = new Set<AccentCue>(["accent-sighted", "accent-struck", "accent-crit", "accent-crash"]);
const PRIORITY: AccentCue[] = ["accent-crash", "accent-sighted", "accent-struck", "accent-crit", "accent-hit", "accent-miss"];
const DENSE_TURN: [AccentCue, number][] = [
  ["accent-hit", 10],
  ["accent-miss", 8],
  ["accent-struck", 3],
  ["accent-crit", 2],
  ["accent-crash", 2],
  ["accent-sighted", 1],
];
const FILL_ROLES = new Set<Role>(["verse", "wall"]);
const ODDS_SHOWN = 4;

type Fill = { bar: number; offset: number };

export class BlockSession {
  readonly played: Played[] = [];
  readonly fired: Fired[] = [];
  readonly pushes: Push[] = [];
  readonly heats: { at: number; value: number }[] = [];
  readonly beatSeconds: number;
  private heat = new Fading(MIX.score.heatHalfLifeSeconds);
  private sequencer: BlockSequencer | null = null;
  private designer: SoundDesigner | null = null;
  private blocks: Block[];
  private fills: Fill[];
  private fillOf = new Map<LineId, Fill>();
  private beats = new Map<number, Fired[]>();
  private nextAt = 0;
  private gridStart = 0;
  private guitarsWanted = false;

  constructor(
    private song: BlockSong,
    private out: BlockOutput,
    private roll: () => number,
  ) {
    this.beatSeconds = (song.barTimes[1] - song.barTimes[0]) / BEATS_PER_BAR;
    this.blocks = blocksOf(song.sections, SCORE_BLOCKS.arc.blockBars);
    this.fills = song.sections
      .filter((s) => FILL_ROLES.has(s.role))
      .flatMap((s) => Array.from({ length: s.bars / 2 }, (_, i) => s.from + 2 * i + 1))
      .map((bar) => ({ bar, offset: this.barTime(bar) + (BEATS_PER_BAR - 1) * this.beatSeconds }));
  }

  get inCombat(): boolean {
    return this.sequencer !== null;
  }

  get barsPlayed(): number {
    return this.sequencer?.barsPlayed ?? 0;
  }

  playingAt(t: number): Played | undefined {
    return this.played.find((p) => p.start <= t && t < p.end);
  }

  heatAt(t: number): number {
    const last = this.heats.filter((h) => h.at <= t).at(-1);
    if (!last) return 0;
    return last.value * 0.5 ** ((t - last.at) / MIX.score.heatHalfLifeSeconds);
  }

  start(now: number): void {
    const start = now + SCORE_BLOCKS.startLeadSeconds;
    this.heat = new Fading(MIX.score.heatHalfLifeSeconds);
    this.sequencer = new BlockSequencer(this.blocks, SCORE_BLOCKS.arc, this.roll);
    this.designer = new SoundDesigner({ start, beat: this.beatSeconds, beatsPerBar: BEATS_PER_BAR }, MIX.score, this.roll, start);
    this.gridStart = start;
    this.nextAt = this.schedule(this.sequencer.next(0), start, 0);
  }

  end(now: number): number {
    const at = this.beatLineAfter(now + SCORE_BLOCKS.startLeadSeconds);
    for (const p of this.played.filter((x) => x.end > at)) this.cut(p, at);
    this.sequencer = null;
    this.designer = null;
    this.beats.clear();
    this.guitarsWanted = false;
    const offset = this.barTime(this.song.end);
    const length = this.song.length - offset;
    const voices = [this.out.voice("song", offset, at, length, SCORE_BLOCKS.seamSeconds)];
    this.played.push({ label: "end", role: "end", bar: this.song.end, bars: 1, start: at, end: at + length, voices, heat: this.heat.read(at), odds: "", join: "end", guitars: false });
    return at;
  }

  fire(cue: AccentCue, at: number): void {
    if (!this.inCombat) return;
    this.heat.add(at, MIX.score.accents[cue].weight);
    this.heats.push({ at, value: this.heat.read(at) });
    const event: Fired = { cue, at, result: null };
    this.fired.push(event);
    const beat = this.beatLineAfter(at);
    const bucket = this.beats.get(beat);
    if (bucket) bucket.push(event);
    else this.beats.set(beat, [event]);
  }

  denseTurn(start: number): void {
    for (const [cue, most] of DENSE_TURN) {
      const count = Math.floor(this.roll() * (most + 1));
      for (let i = 0; i < count; i++) this.fire(cue, start + this.roll() * TURN_SECONDS);
    }
  }

  tick(now: number): void {
    if (!this.sequencer || !this.designer) return;
    if (this.nextAt - now < SCORE_BLOCKS.aheadSeconds) {
      const h = this.heat.read(this.nextAt);
      this.nextAt = this.schedule(this.sequencer.next(h), this.nextAt, h);
    }
    this.answerDue(now);
    for (const h of this.designer.step(now, now + SCORE_BLOCKS.aheadSeconds, false, this.heat.read(now))) this.push(h, false, now);
  }

  private barTime(bar: number): number {
    return this.song.barTimes[bar - 1];
  }

  private joinOf(block: Block): string {
    const before = this.played.at(-1);
    if (!before || before.role === "end") return "start";
    return before.bar + before.bars === block.bar ? "follows" : "jump";
  }

  private schedule(block: Block, when: number, heatNow: number): number {
    const offset = this.barTime(block.bar);
    const length = this.barTime(block.bar + block.bars) - offset;
    const join = this.joinOf(block);
    const fade = join === "jump" ? SCORE_BLOCKS.jumpFadeSeconds : SCORE_BLOCKS.seamSeconds;
    if (join === "jump") for (const v of this.played.at(-1)!.voices) v.fadeOut(when, fade);
    const voices = [this.out.voice("song", offset, when, length, fade)];
    if (this.guitarsWanted) voices.push(this.out.voice("guitars", offset, when, length, fade));
    const label = `${block.role} ${block.bar}-${block.bar + block.bars - 1}`;
    this.played.push({ label, role: block.role, bar: block.bar, bars: block.bars, start: when, end: when + length, voices, heat: heatNow, odds: this.oddsText(), join, guitars: this.guitarsWanted });
    this.guitarsWanted = false;
    return when + length;
  }

  private cut(p: Played, at: number): void {
    for (const v of p.voices) v.cut(at);
    p.end = Math.max(p.start, Math.min(p.end, at));
  }

  private gridBlock(t: number): Played | undefined {
    const live = this.played.filter((p) => p.role !== "end");
    return live.find((p) => p.start <= t && t < p.end) ?? live.at(-1);
  }

  private beatLineAfter(t: number): number {
    const p = this.gridBlock(t);
    if (!p) throw new Error("An event came in with no block playing");
    const beat = (p.end - p.start) / (p.bars * BEATS_PER_BAR);
    return p.start + Math.ceil((t - p.start) / beat - 1e-6) * beat;
  }

  private answerDue(now: number): void {
    for (const [beat, events] of this.beats) {
      if (beat - now > SCORE_BLOCKS.aheadSeconds) continue;
      this.beats.delete(beat);
      const winner = events.reduce((best, e) => (PRIORITY.indexOf(e.cue) < PRIORITY.indexOf(best.cue) ? e : best));
      winner.at = beat;
      this.answer(winner, beat, now);
    }
  }

  private answer(winner: Fired, beat: number, now: number): void {
    if (HEAVY.has(winner.cue)) this.guitarsWanted = true;
    const offer = this.designer!.offer(winner.cue, MIX.score.accents[winner.cue], beat, 0, this.heat.read(beat));
    winner.result = offer.result;
    if (offer.stab) this.push(offer.stab, true, now);
  }

  private onSlot(t: number): number {
    const slot = this.beatSeconds / MIX.score.subdivision;
    return this.gridStart + Math.round((t - this.gridStart) / slot) * slot;
  }

  private push(h: Hit, stab: boolean, now: number): void {
    const at = Math.max(this.onSlot(h.time), now);
    if (stab) this.fillOf.set(h.line, this.pickFill(this.fillOf.get(h.line)));
    const fill = this.fillOf.get(h.line);
    if (!fill) throw new Error(`A ${h.line} tail came with no stab before it`);
    this.out.fill(fill.offset, at, this.beatSeconds, h.gain * SCORE_BLOCKS.fillGain[h.line]);
    this.pushes.push({ at, line: h.line, stab, fillBar: fill.bar });
  }

  private pickFill(last: Fill | undefined): Fill {
    const fresh = this.fills.filter((f) => f !== last);
    return fresh[Math.floor(this.roll() * fresh.length)];
  }

  private oddsText(): string {
    return this.sequencer!.choices
      .slice(0, ODDS_SHOWN)
      .map((c) => `${c.role} ${c.from} ${Math.round(c.chance * 100)}%`)
      .join(", ");
  }
}
