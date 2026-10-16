import { BEATS_PER_BAR, SCORE_BLOCKS } from "../data/sounds";
import { BlockSequencer, blocksOf, Fading, WHOLE_SECTIONS, type Block, type Role, type Section } from "../audio/designer";

export type BlockSong = {
  title: string;
  file: string;
  guitars: string;
  cymbals: { file: string; from: number; start: number; gain: number };
  bpm: number;
  length: number;
  barTimes: number[];
  barPower: { ss: number; gg: number; sg: number }[];
  barEntry: number[];
  guitarWall: number;
  sections: Section[];
  end: number;
};
export type Part = "song" | "guitars" | "cymbals";
export type VoiceHandle = { fadeOut(at: number, fade: number): void; cut(at: number): void };
export type BlockOutput = {
  voice(part: Part, offset: number, when: number, length: number, fade: number, level: number): VoiceHandle;
  lean(offset: number, at: number, length: number, songScale: number, guitarLevel: number): VoiceHandle;
};
export type Played = { label: string; role: Role | "end"; bar: number; bars: number; start: number; end: number; voices: VoiceHandle[]; heat: number; odds: string; join: string; level: number };
export type Lane = "guitars" | "cymbals";
export type Overlay = { lane: Lane; from: number; to: number; bar: number; handle: VoiceHandle };
export type BlockEvent = keyof typeof SCORE_BLOCKS.weights;
export type Fired = { kind: BlockEvent; at: number; heat: number; surprise: number; lanes: boolean };

export const TURN_SECONDS = 1;
export const LANES: Lane[] = ["guitars", "cymbals"];
export const BLOCK_EVENTS = Object.keys(SCORE_BLOCKS.weights) as BlockEvent[];
const DENSE_TURN: { kind: BlockEvent; most: number; chance: number }[] = [
  { kind: "hit", most: 10, chance: 1 },
  { kind: "miss", most: 8, chance: 1 },
  { kind: "struck", most: 3, chance: 1 },
  { kind: "crit", most: 2, chance: 0.5 },
  { kind: "crash", most: 1, chance: 0.05 },
  { kind: "sighted", most: 1, chance: 0.05 },
  { kind: "knockout", most: 1, chance: 0.05 },
];
const ODDS_SHOWN = 4;

type Spot = { block: Played; at: number; bar: number; beat: number; barSeconds: number };

export class BlockSession {
  readonly played: Played[] = [];
  readonly fired: Fired[] = [];
  readonly overlays: Overlay[] = [];
  readonly heats: { at: number; value: number }[] = [];
  readonly beatSeconds: number;
  cymbalGain: number = SCORE_BLOCKS.cymbalGain;
  private heat = new Fading(SCORE_BLOCKS.heatHalfLifeSeconds);
  private surprise = new Fading(SCORE_BLOCKS.surpriseHalfLifeSeconds);
  private familiar = new Map<BlockEvent, Fading>();
  private nudge: Partial<Record<Role, number>> = {};
  private peakHeat = 0;
  private sequencer: BlockSequencer | null = null;
  private blocks: Block[];
  private wanted = new Set<Lane>();
  private nextAt = 0;
  private targetPower: number;

  constructor(
    private song: BlockSong,
    private out: BlockOutput,
    private roll: () => number,
  ) {
    this.beatSeconds = (song.barTimes[1] - song.barTimes[0]) / BEATS_PER_BAR;
    this.blocks = blocksOf(song.sections, SCORE_BLOCKS.arc.blockBars);
    const powers = this.blocks.map((b) => this.power(b.bar, b.bars, 0)).sort((a, b) => a - b);
    this.targetPower = powers[Math.floor(powers.length / 2)];
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

  open(lane: Lane, at: number): boolean {
    return this.overlays.some((o) => o.lane === lane && o.from <= at && at < o.to);
  }

  heatAt(t: number): number {
    const last = this.heats.filter((h) => h.at <= t).at(-1);
    if (!last) return 0;
    return last.value * 0.5 ** ((t - last.at) / SCORE_BLOCKS.heatHalfLifeSeconds);
  }

  start(now: number): void {
    const start = now + SCORE_BLOCKS.startLeadSeconds;
    this.heat = new Fading(SCORE_BLOCKS.heatHalfLifeSeconds);
    this.surprise = new Fading(SCORE_BLOCKS.surpriseHalfLifeSeconds);
    this.familiar.clear();
    this.nudge = {};
    this.peakHeat = 0;
    this.sequencer = new BlockSequencer(this.blocks, SCORE_BLOCKS.arc, this.roll);
    this.nextAt = this.schedule(this.sequencer.next(0), start, 0);
  }

  end(now: number): number {
    const at = this.lineAfter(now + SCORE_BLOCKS.startLeadSeconds, 1);
    for (const p of this.played.filter((x) => x.end > at)) this.cut(p, at);
    this.sequencer = null;
    this.wanted.clear();
    for (const o of this.overlays.filter((x) => x.to > at)) {
      o.handle.cut(at);
      o.to = Math.max(o.from, at);
    }
    const offset = this.barTime(this.song.end);
    const length = this.song.length - offset;
    const level = this.levelOf(this.song.end, 1, false);
    const voices = [this.out.voice("song", offset, at, length, SCORE_BLOCKS.seamSeconds, level)];
    this.played.push({ label: "end", role: "end", bar: this.song.end, bars: 1, start: at, end: at + length, voices, heat: this.heat.read(at), odds: "", join: "end", level });
    return at;
  }

  fire(kind: BlockEvent, at: number): Fired | null {
    if (!this.inCombat) return null;
    const weight = SCORE_BLOCKS.weights[kind];
    this.heat.add(at, weight);
    this.heats.push({ at, value: this.heat.read(at) });
    this.peakHeat = Math.max(this.peakHeat, this.heat.read(at));
    this.surprise.add(at, weight / (1 + this.familiarity(kind).read(at)));
    this.familiarity(kind).add(at, 1);
    const surprise = this.surprise.read(at);
    const lanes = surprise >= SCORE_BLOCKS.surpriseLine;
    if (lanes) this.askLanes(at);
    this.addNudge(kind);
    const fired = { kind, at, heat: this.heat.read(at), surprise, lanes };
    this.fired.push(fired);
    return fired;
  }

  private askLanes(at: number): void {
    for (const lane of LANES) if (!this.open(lane, at)) this.wanted.add(lane);
  }

  private addNudge(kind: BlockEvent): void {
    for (const [role, factor] of Object.entries(SCORE_BLOCKS.nudges[kind] ?? {}) as [Role, number][]) this.nudge[role] = (this.nudge[role] ?? 1) * factor;
  }

  denseTurn(start: number): void {
    for (const { kind, most, chance } of DENSE_TURN) {
      if (this.roll() >= chance) continue;
      const count = 1 + Math.floor(this.roll() * most);
      for (let i = 0; i < count; i++) this.fire(kind, start + this.roll() * TURN_SECONDS);
    }
  }

  tick(now: number): void {
    if (!this.sequencer) return;
    if (this.nextAt - now < SCORE_BLOCKS.aheadSeconds) {
      const h = Math.max(this.peakHeat, this.heat.read(this.nextAt));
      this.nextAt = this.schedule(this.sequencer.next(h, this.nudge), this.nextAt, h);
      if (this.sequencer.choices.length > 0) {
        this.nudge = {};
        this.peakHeat = 0;
      }
    }
    for (const lane of LANES) this.startOverlay(lane, now);
  }

  private familiarity(kind: BlockEvent): Fading {
    let f = this.familiar.get(kind);
    if (!f) {
      f = new Fading(SCORE_BLOCKS.familiarHalfLifeSeconds);
      this.familiar.set(kind, f);
    }
    return f;
  }

  private power(bar: number, bars: number, push: number): number {
    let sum = 0;
    for (let i = bar - 1; i < bar - 1 + bars; i++) {
      const p = this.song.barPower[i];
      sum += p.ss + 2 * push * p.sg + push * push * p.gg;
    }
    return sum / bars;
  }

  private levelOf(bar: number, bars: number, pushed: boolean): number {
    const plain = this.power(bar, bars, 0);
    const heard = this.power(bar, bars, pushed ? SCORE_BLOCKS.guitarPush : 0);
    return Math.sqrt(Math.min(plain, this.targetPower) / heard);
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
    const entry = this.song.barEntry[block.bar - 1];
    if (join === "jump") for (const v of this.played.at(-1)!.voices) v.fadeOut(when + entry, fade);
    const level = this.levelOf(block.bar, block.bars, false);
    const voices = [this.out.voice("song", offset, when, length, fade, level)];
    const label = `${block.role} ${block.bar}-${block.bar + block.bars - 1}`;
    this.played.push({ label, role: block.role, bar: block.bar, bars: block.bars, start: when, end: when + length, voices, heat: heatNow, odds: this.oddsText(), join, level });
    return when + length;
  }

  private spotAt(lane: Lane, now: number): Spot | null {
    const at = this.lineAfter(now + SCORE_BLOCKS.eventLeadSeconds, lane === "cymbals" ? 1 : BEATS_PER_BAR);
    const block = this.played.find((p) => p.role !== "end" && p.start <= at + 1e-6 && at < p.end - 1e-6);
    if (!block) return null;
    const barSeconds = (block.end - block.start) / block.bars;
    const beats = Math.round((at - block.start) / this.beatSeconds);
    return { block, at, bar: block.bar + Math.floor(beats / BEATS_PER_BAR), beat: beats % BEATS_PER_BAR, barSeconds };
  }

  private startOverlay(lane: Lane, now: number): void {
    if (!this.wanted.has(lane)) return;
    const spot = this.spotAt(lane, now);
    if (!spot || this.open(lane, spot.at)) return;
    this.wanted.delete(lane);
    const length = (this.phraseEndBar(spot.bar) - spot.bar) * spot.barSeconds - spot.beat * this.beatSeconds;
    const handle = lane === "guitars" ? this.lean(spot, length) : this.cymbals(spot, length);
    this.overlays.push({ lane, from: spot.at, to: spot.at + length, bar: spot.bar, handle });
  }

  private lean(spot: Spot, length: number): VoiceHandle {
    const bars = this.phraseEndBar(spot.bar) - spot.bar;
    const plain = this.levelOf(spot.bar, bars, false);
    const source = this.guitarSource(spot.bar, bars);
    const leaned = source === spot.bar ? this.levelOf(spot.bar, bars, true) : this.borrowedLevel(spot.bar, source, bars);
    return this.out.lean(this.barTime(source), spot.at, length, leaned / plain, leaned);
  }

  private guitarSource(bar: number, bars: number): number {
    const section = this.sectionOf(bar);
    if (section.role !== "verse" || this.guitarShare(bar, bars) > -SCORE_BLOCKS.guitarAbsentDb) return bar;
    return this.song.guitarWall + ((bar - section.from) % SCORE_BLOCKS.arc.phraseBars);
  }

  private guitarShare(bar: number, bars: number): number {
    const span = this.song.barPower.slice(bar - 1, bar - 1 + bars);
    return 10 * Math.log10(span.reduce((s, p) => s + p.gg, 0) / span.reduce((s, p) => s + p.ss, 0));
  }

  private borrowedLevel(bar: number, source: number, bars: number): number {
    const mean = (from: number, key: "ss" | "gg") => this.song.barPower.slice(from - 1, from - 1 + bars).reduce((s, p) => s + p[key], 0) / bars;
    const plain = mean(bar, "ss");
    const heard = plain + SCORE_BLOCKS.guitarPush ** 2 * mean(source, "gg");
    return Math.sqrt(Math.min(plain, this.targetPower) / heard);
  }

  private cymbals(spot: Spot, length: number): VoiceHandle {
    const section = this.sectionOf(spot.bar);
    const source = this.song.cymbals.from + ((spot.bar - section.from) % SCORE_BLOCKS.arc.phraseBars);
    const offset = this.barTime(source) + spot.beat * this.beatSeconds - this.song.cymbals.start;
    return this.out.voice("cymbals", offset, spot.at, length, SCORE_BLOCKS.seamSeconds, this.song.cymbals.gain * this.cymbalGain);
  }

  private sectionOf(bar: number): Section {
    const s = this.song.sections.find((x) => x.from <= bar && bar < x.from + x.bars);
    if (!s) throw new Error(`Bar ${bar} is in no section`);
    return s;
  }

  private phraseEndBar(bar: number): number {
    const s = this.sectionOf(bar);
    const end = s.from + s.bars;
    if (WHOLE_SECTIONS.has(s.role)) return end;
    const phrase = SCORE_BLOCKS.arc.phraseBars;
    return Math.min(end, s.from + Math.ceil((bar - s.from + 1) / phrase) * phrase);
  }

  private cut(p: Played, at: number): void {
    for (const v of p.voices) v.cut(at);
    p.end = Math.max(p.start, Math.min(p.end, at));
  }

  private gridBlock(t: number): Played | undefined {
    const live = this.played.filter((p) => p.role !== "end");
    return live.find((p) => p.start <= t && t < p.end) ?? live.at(-1);
  }

  private lineAfter(t: number, beats: number): number {
    const p = this.gridBlock(t);
    if (!p) throw new Error("A grid line was asked for with no block playing");
    const step = this.beatSeconds * beats;
    return p.start + Math.ceil((t - p.start) / step - 1e-6) * step;
  }

  private oddsText(): string {
    return this.sequencer!.choices
      .slice(0, ODDS_SHOWN)
      .map((c) => `${c.role} ${c.from} ${Math.round(c.chance * 100)}%`)
      .join(", ");
  }
}
