export type PacedMusic = "calm" | "quest" | "town" | "outpost" | "abandoned";

export type PaceTimes = { spellSeconds: number; restSeconds: number; restJitterSeconds: number };

type Phase = { holder: PacedMusic; resting: boolean; until: number };

export class MusicPace {
  private phase: Phase | null = null;
  private last = -Infinity;

  constructor(private times: PaceTimes, private random: () => number) {}

  get resting(): boolean {
    return this.phase?.resting ?? false;
  }

  advance(holder: PacedMusic | null, now: number): void {
    this.stamp(now);
    if (!holder) {
      this.phase = null;
      return;
    }
    if (this.phase?.holder !== holder) return this.startSpell(holder, now);
    if (now < this.phase.until) return;
    if (this.phase.resting) return this.startSpell(holder, now);
    this.phase = { holder, resting: true, until: now + this.restLength() };
  }

  wake(now: number): void {
    this.stamp(now);
    if (!this.phase) throw new Error("MusicPace.wake needs a holder");
    this.startSpell(this.phase.holder, now);
  }

  private stamp(now: number): void {
    if (!Number.isFinite(now)) throw new Error(`MusicPace clock must be finite, got ${now}`);
    if (now < this.last) throw new Error(`MusicPace clock ran backwards: ${now} after ${this.last}`);
    this.last = now;
  }

  private startSpell(holder: PacedMusic, now: number): void {
    this.phase = { holder, resting: false, until: now + this.times.spellSeconds };
  }

  private restLength(): number {
    return this.times.restSeconds + (2 * this.random() - 1) * this.times.restJitterSeconds;
  }
}
