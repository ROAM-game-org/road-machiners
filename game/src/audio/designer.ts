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
export type RolePair = `${Role}>${Role}`;
export type Section = { role: Role; from: number; bars: number };
export type Block = { role: Role; bar: number; bars: number; section: number };

export type ArcTuning = {
  blockBars: number;
  hotHeat: number;
  coolHeat: number;
  memoryHalfLifeBars: number;
  memoryWeight: number;
  stay: number;
  phraseBars: number;
  next: Record<Role, Partial<Record<Role, number>>>;
  after: Partial<Record<RolePair, Partial<Record<Role, number>>>>;
  hot: Record<Role, number>;
  calm: Record<Role, number>;
  seamDb: number;
};

export type Seams = Record<string, Record<string, number>>;

export type Choice = { section: number; role: Role; from: number; chance: number };

export const WHOLE_SECTIONS = new Set<Role>(["intro", "stop", "solo"]);

export function blocksOf(sections: readonly Section[], blockBars: number): Block[] {
  return sections.flatMap((s, section) => {
    if (s.bars % blockBars !== 0) throw new Error(`Section at bar ${s.from} has ${s.bars} bars, not a multiple of ${blockBars}`);
    return Array.from({ length: s.bars / blockBars }, (_, i) => ({ role: s.role, bar: s.from + i * blockBars, bars: blockBars, section }));
  });
}

export class BlockSequencer {
  private current: Block | null = null;
  private previous: Block | null = null;
  private nudge: Partial<Record<Role, number>> = {};
  private total = 0;
  private memory: number[];
  private sections: number[];
  private weighed: Choice[] = [];

  constructor(
    private blocks: readonly Block[],
    private tuning: ArcTuning,
    private seams: Seams,
    private roll: () => number,
  ) {
    if (!blocks.some((b) => b.role === "intro")) throw new Error("Song has no intro section");
    this.sections = [...new Set(blocks.map((b) => b.section))];
    this.memory = this.sections.map(() => 0);
  }

  get barsPlayed(): number {
    return this.total;
  }

  get choices(): readonly Choice[] {
    return this.weighed;
  }

  next(heat: number, nudge: Partial<Record<Role, number>> = {}): Block {
    this.nudge = nudge;
    const block = this.current ? this.pick(this.current, heat) : this.firstOf(this.blocks.find((b) => b.role === "intro")!.section);
    this.remember(block);
    this.previous = this.current;
    this.current = block;
    return block;
  }

  private remember(block: Block): void {
    const fade = 0.5 ** (block.bars / this.tuning.memoryHalfLifeBars);
    this.memory = this.memory.map((m) => m * fade);
    this.memory[this.sections.indexOf(block.section)] += block.bars;
    this.total += block.bars;
  }

  private pick(current: Block, heat: number): Block {
    const goesOn = this.nextInSection(current);
    if (goesOn && (WHOLE_SECTIONS.has(current.role) || !this.endsPhrase(current))) {
      this.weighed = [];
      return goesOn;
    }
    this.weighed = this.weigh(current, heat);
    const section = this.draw(this.weighed);
    return this.landing(current, section);
  }

  private landing(current: Block, section: number): Block {
    return section === current.section ? (this.nextInSection(current) ?? this.firstOf(section)) : this.firstOf(section);
  }

  private seamFits(current: Block, section: number): boolean {
    const exit = current.bar + current.bars;
    const target = this.landing(current, section).bar;
    if (target === exit) return true;
    const db = this.seams[exit]?.[target];
    if (db === undefined) throw new Error(`Song has no seam from bar ${exit} to bar ${target}`);
    return db <= this.tuning.seamDb;
  }

  private endsPhrase(current: Block): boolean {
    return (current.bar + current.bars - this.firstOf(current.section).bar) % this.tuning.phraseBars === 0;
  }

  private weigh(current: Block, heat: number): Choice[] {
    const weights = this.sections.map((section) => this.weightOf(current, section, heat));
    const total = weights.reduce((sum, w) => sum + w, 0);
    if (total <= 0) throw new Error(`No way out of the ${current.role} at bar ${current.bar}`);
    return this.sections
      .map((section, i) => ({ section, role: this.firstOf(section).role, from: this.firstOf(section).bar, chance: weights[i] / total }))
      .filter((c) => c.chance > 0)
      .sort((a, b) => b.chance - a.chance);
  }

  private weightOf(current: Block, section: number, heat: number): number {
    if (!this.seamFits(current, section)) return 0;
    const t = this.tuning;
    const role = this.firstOf(section).role;
    const base = (t.next[current.role][role] ?? 0) / this.sections.filter((s) => this.firstOf(s).role === role).length;
    const stay = section === current.section ? t.stay : 1;
    const fresh = Math.exp(-t.memoryWeight * this.memory[this.sections.indexOf(section)]);
    return base * this.pairFactor(current, role) * this.mood(role, heat) * stay * fresh * (this.nudge[role] ?? 1);
  }

  private pairFactor(current: Block, role: Role): number {
    if (!this.previous) return 1;
    return this.tuning.after[`${this.previous.role}>${current.role}`]?.[role] ?? 1;
  }

  private mood(role: Role, heat: number): number {
    if (heat >= this.tuning.hotHeat) return this.tuning.hot[role];
    return heat < this.tuning.coolHeat ? this.tuning.calm[role] : 1;
  }

  private draw(choices: Choice[]): number {
    let r = this.roll();
    for (const c of choices) {
      r -= c.chance;
      if (r < 0) return c.section;
    }
    return choices[choices.length - 1].section;
  }

  private nextInSection(current: Block): Block | undefined {
    return this.blocks.find((b) => b.section === current.section && b.bar === current.bar + current.bars);
  }

  private firstOf(section: number): Block {
    return this.blocks.find((b) => b.section === section)!;
  }
}
