
export type Grid = { start: number; beat: number; beatsPerBar: number };

export type LineId = "lead" | "secondary";

export type AccentPlan = { line: LineId; weight: number; bars: number; chance: number };

export type LineTuning = {
  gain: number;
  duck: number;
  calm: readonly string[];
  hot: readonly string[];
};

export type DesignerTuning = {
  subdivision: number;
  humanizeMs: number;
  gainJitter: number;
  hotHeat: number;
  pauseRepeats: number;
  fillChance: number;
  fillGain: number;
  secondaryPan: number;
  busyFactor: number;
  stabGapSeconds: number;
  lines: Record<LineId, LineTuning>;
};

export type Hit = { cue: string; time: number; gain: number; pan: number; line: LineId };
export type Offer = { result: "played" | "skipped" | "crowded"; stab: Hit | null };

type Phrase = { cue: string; plan: AccentPlan };
type Playing = { phrase: Phrase; pattern: string; start: number; stabbed: boolean };
type Line = { playing: Playing | null; last: Phrase | null; lastPattern: string; replays: number; lastStab: number };

const LINES: LineId[] = ["lead", "secondary"];

export class SoundDesigner {
  private lines: Record<LineId, Line>;
  private cursor: number;
  private pan: number;

  constructor(
    private grid: Grid,
    private tuning: DesignerTuning,
    private roll: () => number,
    now: number,
  ) {
    for (const id of LINES) this.checkPatterns(id);
    const line = (): Line => ({ playing: null, last: null, lastPattern: "", replays: 0, lastStab: -Infinity });
    this.lines = { lead: line(), secondary: line() };
    this.cursor = this.slotAtOrAfter(now);
    this.pan = (roll() < 0.5 ? -1 : 1) * tuning.secondaryPan;
  }

  offer(cue: string, plan: AccentPlan, at: number, peak: number, heat: number): Offer {
    const line = this.lines[plan.line];
    if (!this.sounds(plan, line)) return { result: "skipped", stab: null };
    if (Math.abs(at - line.lastStab) < this.tuning.stabGapSeconds) return { result: "crowded", stab: null };
    const dense = line.playing?.phrase.cue === cue || heat >= this.tuning.hotHeat;
    this.startTail(line, { cue, plan }, this.slotNearest(at), dense, true);
    line.replays = 0;
    line.lastStab = at;
    const stab = { ...this.hit(plan.line, cue, 0, this.tuning.lines[plan.line].gain), time: at - peak };
    return { result: "played", stab };
  }

  private sounds(plan: AccentPlan, line: Line): boolean {
    const busy = plan.line === "secondary" && line.playing ? 1 : 0;
    return this.roll() < plan.chance * Math.exp(-this.tuning.busyFactor * busy);
  }

  step(now: number, until: number, paused: boolean, heat: number): Hit[] {
    const hits: Hit[] = [];
    for (; this.slotTime(this.cursor) <= until; this.cursor++) {
      if (this.slotTime(this.cursor) < now) continue;
      for (const id of LINES) this.play(id, this.cursor, paused, heat, hits);
    }
    return hits;
  }

  private play(id: LineId, slot: number, paused: boolean, heat: number, hits: Hit[]): void {
    const line = this.lines[id];
    const p = line.playing;
    if (p && slot - p.start >= p.pattern.length) line.playing = null;
    if (this.replays(id, line, paused, slot)) this.replay(line, slot, heat);
    if (line.playing) this.hitAt(id, slot, hits);
  }

  private replays(id: LineId, line: Line, paused: boolean, slot: number): boolean {
    return !line.playing && id === "lead" && paused && slot % this.slotsPerBar() === 0;
  }

  private replay(line: Line, slot: number, heat: number): void {
    if (!line.last || line.replays >= this.tuning.pauseRepeats) return;
    line.replays++;
    this.startTail(line, line.last, slot, heat >= this.tuning.hotHeat, false);
  }

  private startTail(line: Line, phrase: Phrase, slot: number, dense: boolean, stabbed: boolean): void {
    const rhythms = this.tuning.lines[phrase.plan.line];
    const pool = dense ? rhythms.hot : rhythms.calm;
    let pattern = "";
    for (let b = 0; b < phrase.plan.bars; b++) pattern += this.pick(pool, line);
    line.playing = { phrase, pattern, start: slot, stabbed };
    line.last = phrase;
  }

  private pick(pool: readonly string[], line: Line): string {
    const choices = pool.length > 1 ? pool.filter((r) => r !== line.lastPattern) : pool;
    const r = choices[Math.floor(this.roll() * choices.length)];
    line.lastPattern = r;
    return r;
  }

  private hitAt(id: LineId, slot: number, hits: Hit[]): void {
    const p = this.lines[id].playing!;
    const i = slot - p.start;
    if (i < 0 || (i === 0 && p.stabbed)) return;
    const gain = this.tuning.lines[id].gain;
    if (p.pattern[i] === "x") hits.push(this.hit(id, p.phrase.cue, this.slotTime(slot), gain));
    else if (this.fills(id, i, p)) hits.push(this.hit(id, p.phrase.cue, this.slotTime(slot), gain * this.tuning.fillGain));
  }

  private fills(id: LineId, i: number, p: Playing): boolean {
    return id === "lead" && i === p.pattern.length - 1 && this.roll() < this.tuning.fillChance;
  }

  private hit(line: LineId, cue: string, time: number, gain: number): Hit {
    const t = this.tuning;
    return {
      cue,
      line,
      time: time + (this.roll() * t.humanizeMs) / 1000,
      gain: gain * (1 + (this.roll() * 2 - 1) * t.gainJitter),
      pan: line === "lead" ? 0 : this.pan,
    };
  }

  private checkPatterns(id: LineId): void {
    const l = this.tuning.lines[id];
    for (const r of [...l.calm, ...l.hot])
      if (!/^[x.]+$/.test(r) || r.length !== this.slotsPerBar()) throw new Error(`Bad ${id} rhythm "${r}": need ${this.slotsPerBar()} of x and .`);
    if (l.calm.length === 0 || l.hot.length === 0) throw new Error(`Line ${id} needs calm and hot rhythms`);
  }

  private slotsPerBar(): number {
    return this.tuning.subdivision * this.grid.beatsPerBar;
  }

  private slotLength(): number {
    return this.grid.beat / this.tuning.subdivision;
  }

  private slotNearest(at: number): number {
    return Math.round((at - this.grid.start) / this.slotLength());
  }

  private slotAtOrAfter(at: number): number {
    return Math.ceil((at - this.grid.start) / this.slotLength() - 1e-9);
  }

  private slotTime(slot: number): number {
    return this.grid.start + slot * this.slotLength();
  }
}

export class Fading {
  private value = 0;
  private at = -Infinity;

  constructor(private halfLifeSeconds: number) {}

  read(time: number): number {
    if (this.value === 0) return 0;
    return this.value * 0.5 ** ((time - this.at) / this.halfLifeSeconds);
  }

  add(time: number, amount: number): void {
    this.value = this.read(time) + amount;
    this.at = time;
  }
}

export type Role = "intro" | "verse" | "wall" | "stop" | "solo";
export type Section = { role: Role; from: number; bars: number };
export type Block = { role: Role; bar: number; bars: number; section: number };

export type ArcTuning = {
  blockBars: number;
  verseBars: number;
  wallBars: number;
  soloBars: number;
  stopEveryBars: number;
  soloAfterBars: number;
  hotHeat: number;
  coolHeat: number;
};

export function blocksOf(sections: readonly Section[], blockBars: number): Block[] {
  return sections.flatMap((s, section) => {
    if (s.bars % blockBars !== 0) throw new Error(`Section at bar ${s.from} has ${s.bars} bars, not a multiple of ${blockBars}`);
    return Array.from({ length: s.bars / blockBars }, (_, i) => ({ role: s.role, bar: s.from + i * blockBars, bars: blockBars, section }));
  });
}

export class BlockSequencer {
  private current: Block | null = null;
  private inRole = 0;
  private sinceStop = 0;
  private total = 0;
  private soloed = false;
  private lastSection = new Map<Role, number>();

  constructor(
    private blocks: readonly Block[],
    private tuning: ArcTuning,
    private roll: () => number,
  ) {
    for (const role of ["intro", "verse", "wall", "stop"] as const)
      if (!blocks.some((b) => b.role === role)) throw new Error(`Song has no ${role} section`);
  }

  get barsSinceStop(): number {
    return this.sinceStop;
  }

  get barsPlayed(): number {
    return this.total;
  }

  next(heat: number): Block {
    const role = this.current ? this.nextRole(this.current, heat) : "intro";
    const block = this.blockFor(role);
    this.count(block);
    this.current = block;
    return block;
  }

  private count(block: Block): void {
    this.inRole = this.current?.role === block.role ? this.inRole + block.bars : block.bars;
    this.total += block.bars;
    this.sinceStop = block.role === "stop" ? 0 : this.sinceStop + (block.role === "intro" ? 0 : block.bars);
    this.soloed ||= block.role === "solo";
  }

  private nextRole(current: Block, heat: number): Role {
    const rules: Record<Role, () => Role> = {
      intro: () => this.afterBreak(heat),
      stop: () => this.afterBreak(heat),
      solo: () => (this.inRole < this.tuning.soloBars ? "solo" : "wall"),
      verse: () => this.afterVerse(heat),
      wall: () => this.afterWall(heat),
    };
    return rules[current.role]();
  }

  private afterBreak(heat: number): Role {
    return heat >= this.tuning.hotHeat ? "wall" : "verse";
  }

  private afterVerse(heat: number): Role {
    if (this.stopDue()) return "stop";
    return this.verseDone(heat) ? "wall" : "verse";
  }

  private afterWall(heat: number): Role {
    const done = this.wallDone(heat);
    if (done && this.soloDue()) return "solo";
    if (this.stopDue()) return "stop";
    return done ? "verse" : "wall";
  }

  private stopDue(): boolean {
    return this.sinceStop >= this.tuning.stopEveryBars;
  }

  private wallDone(heat: number): boolean {
    return this.inRole >= this.tuning.wallBars && heat < this.tuning.coolHeat;
  }

  private verseDone(heat: number): boolean {
    return heat >= this.tuning.hotHeat || this.inRole >= this.tuning.verseBars;
  }

  private soloDue(): boolean {
    return !this.soloed && this.total >= this.tuning.soloAfterBars && this.blocks.some((b) => b.role === "solo");
  }

  private blockFor(role: Role): Block {
    const following = this.current && this.blocks.find((b) => b.bar === this.current!.bar + this.current!.bars);
    if (following && following.role === role) return following;
    const sections = [...new Set(this.blocks.filter((b) => b.role === role).map((b) => b.section))];
    const fresh = sections.length > 1 ? sections.filter((s) => s !== this.lastSection.get(role)) : sections;
    const section = fresh[Math.floor(this.roll() * fresh.length)];
    this.lastSection.set(role, section);
    return this.blocks.find((b) => b.section === section)!;
  }
}
