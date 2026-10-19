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
export type Steer = Partial<Record<Role, number>>;

export type ArcTuning = {
  blockBars: number;
  hotHeat: number;
  coolHeat: number;
  phraseBars: number;
  jumpDb: number;
  jumpChords: number;
  hot: readonly Role[];
  cool: readonly Role[];
};

export type Jumps = Record<string, Record<string, readonly number[]>>;
export type SongJumps = { jumps: Jumps; quietExits: readonly number[] };

export type Choice = { section: number; role: Role; from: number; taken: boolean };

export const WHOLE_SECTIONS = new Set<Role>(["intro", "stop", "solo"]);
const ROLES: readonly Role[] = ["intro", "verse", "wall", "stop", "solo"];

export function blocksOf(sections: readonly Section[], blockBars: number): Block[] {
  return sections.flatMap((s, section) => {
    if (s.bars % blockBars !== 0) throw new Error(`Section at bar ${s.from} has ${s.bars} bars, not a multiple of ${blockBars}`);
    return Array.from({ length: s.bars / blockBars }, (_, i) => ({ role: s.role, bar: s.from + i * blockBars, bars: blockBars, section }));
  });
}

export class BlockSequencer {
  private current: Block | null = null;
  private total = 0;
  private lastPlayed = new Map<number, number>();
  private options: Choice[] = [];
  private goal: Set<Role> | null = null;
  private steered = false;
  private starts: Set<number>;
  private ways: Map<number, Block[]>;

  constructor(
    private blocks: readonly Block[],
    private tuning: ArcTuning,
    private song: SongJumps,
    private roll: () => number,
  ) {
    if (!blocks.some((b) => b.role === "intro")) throw new Error("Song has no intro section");
    this.starts = new Set(blocks.filter((b) => this.firstOf(b.section) === b).map((b) => b.bar));
    this.ways = new Map(blocks.map((b) => [b.bar, this.waysOut(b)]));
  }

  get barsPlayed(): number {
    return this.total;
  }

  get choices(): readonly Choice[] {
    return this.options;
  }

  get tookHeat(): boolean {
    return this.steered;
  }

  next(heat: number, nudge: Steer = {}): Block {
    this.options = [];
    const goal = this.steer(heat, nudge);
    const block = this.current ? this.pick(this.current, goal) : this.blocks.find((b) => b.role === "intro")!;
    this.lastPlayed.set(block.bar, this.total);
    this.total += block.bars;
    this.current = block;
    return block;
  }

  private steer(heat: number, nudge: Steer): Set<Role> {
    this.steered = !this.goal || (this.current !== null && this.endsPhrase(this.current));
    if (this.steered || !this.goal) this.goal = this.welcome(heat, nudge);
    return this.goal;
  }

  private welcome(heat: number, nudge: Steer): Set<Role> {
    const t = this.tuning;
    const roles = heat >= t.hotHeat ? t.hot : heat < t.coolHeat ? t.cool : ROLES;
    const nudged = (Object.entries(nudge) as [Role, number][]).filter(([, factor]) => factor > 1).map(([role]) => role);
    return new Set([...roles, ...nudged]);
  }

  private pick(current: Block, welcome: Set<Role>): Block {
    const natural = this.at(current.bar + current.bars);
    if (natural && natural.section === current.section && WHOLE_SECTIONS.has(current.role)) {
      this.options = [];
      return natural;
    }
    const candidates = this.ways.get(current.bar)!.filter((b) => b === natural || this.mayChangeRole(current, natural, b));
    if (candidates.length === 0) throw new Error(`No way out of the ${current.role} at bar ${current.bar}`);
    const chosen = this.closest(candidates, this.distances(welcome), natural);
    this.options = candidates.map((b) => ({ section: b.section, role: b.role, from: b.bar, taken: b === chosen }));
    return chosen;
  }

  private closest(candidates: Block[], distance: Map<number, number>, natural: Block | undefined): Block {
    const best = Math.min(...candidates.map((b) => distance.get(b.bar)!));
    const nearest = candidates.filter((b) => distance.get(b.bar) === best);
    const age = (b: Block) => this.lastPlayed.get(b.bar) ?? -Infinity;
    const oldest = Math.min(...nearest.map(age));
    const freshest = nearest.filter((b) => age(b) === oldest);
    if (natural && freshest.includes(natural)) return natural;
    return freshest[Math.floor(this.roll() * freshest.length)];
  }

  private mayChangeRole(current: Block, natural: Block | undefined, target: Block): boolean {
    if (target.role === current.role) return true;
    return !natural || natural.role !== current.role || this.endsPhrase(current);
  }

  private distances(welcome: Set<Role>): Map<number, number> {
    const distance = new Map(this.blocks.map((b) => [b.bar, welcome.has(b.role) ? 0 : Infinity]));
    for (let changed = true; changed; ) {
      changed = false;
      for (const b of this.blocks) {
        const via = Math.min(...this.ways.get(b.bar)!.map((w) => w.bars + distance.get(w.bar)!));
        if (via < distance.get(b.bar)!) {
          distance.set(b.bar, via);
          changed = true;
        }
      }
    }
    return distance;
  }

  private waysOut(block: Block): Block[] {
    const exit = block.bar + block.bars;
    const natural = this.at(exit);
    return [...(natural ? [natural] : []), ...this.blocks.filter((b) => b.bar !== exit && this.clean(exit, b.bar))];
  }

  private clean(exit: number, target: number): boolean {
    if (this.song.quietExits.includes(exit) && this.starts.has(target)) return true;
    const score = this.song.jumps[exit]?.[target];
    if (!score) throw new Error(`Song has no jump score from bar ${exit} to bar ${target}`);
    const [before, , chords] = score;
    return before <= this.tuning.jumpDb && chords >= this.tuning.jumpChords;
  }

  private endsPhrase(current: Block): boolean {
    const exit = current.bar + current.bars;
    return (exit - this.firstOf(current.section).bar) % this.tuning.phraseBars === 0 || this.at(exit)?.section !== current.section;
  }

  private at(bar: number): Block | undefined {
    return this.blocks.find((b) => b.bar === bar);
  }

  private firstOf(section: number): Block {
    return this.blocks.find((b) => b.section === section)!;
  }
}
