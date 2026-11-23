export const PACE_FRAMES = 600;
export const PACE_SLICE_MS = 10_000;
export const PACE_SLICES = 30;
const SLOW_FRAME_MS = 50;

export type FramePaceSummary = { count: number; medianMs: number | null; p95Ms: number | null; over50: number };

export type PaceSlice = { ageS: number; frames: number; slowestMs: number; over50: number; programsBuilt: number; turnWaitMs: number };

export class FramePace {
  private readonly gaps = new Float32Array(PACE_FRAMES);
  private next = 0;
  private noted = 0;
  private readonly frames = new Uint32Array(PACE_SLICES);
  private readonly slowest = new Float32Array(PACE_SLICES);
  private readonly slow = new Uint32Array(PACE_SLICES);
  private readonly built = new Uint32Array(PACE_SLICES);
  private readonly waits = new Float32Array(PACE_SLICES);
  private current = -1;
  private lastPrograms = -1;

  note(gapMs: number, nowMs = 0, programs = 0): void {
    this.gaps[this.next] = gapMs;
    this.next = (this.next + 1) % PACE_FRAMES;
    this.noted++;
    const at = this.advance(nowMs);
    this.frames[at]++;
    if (gapMs > this.slowest[at]) this.slowest[at] = gapMs;
    if (gapMs > SLOW_FRAME_MS) this.slow[at]++;
    if (this.lastPrograms >= 0 && programs > this.lastPrograms) this.built[at] += programs - this.lastPrograms;
    this.lastPrograms = programs;
  }

  noteTurnWait(ms: number, nowMs: number): void {
    const at = this.advance(nowMs);
    if (ms > this.waits[at]) this.waits[at] = ms;
  }

  timeline(nowMs: number): PaceSlice[] {
    if (this.current < 0) return [];
    const now = Math.floor(nowMs / PACE_SLICE_MS);
    const slices: PaceSlice[] = [];
    for (let back = PACE_SLICES - 1; back >= 0; back--) {
      const index = this.current - back;
      if (index < 0) continue;
      const at = index % PACE_SLICES;
      if (this.frames[at] === 0 && this.waits[at] === 0 && this.built[at] === 0) continue;
      const ageS = Math.round(((now - index) * PACE_SLICE_MS) / 1000);
      if (ageS >= (PACE_SLICES * PACE_SLICE_MS) / 1000) continue;
      slices.push({
        ageS,
        frames: this.frames[at],
        slowestMs: Math.round(this.slowest[at]),
        over50: this.slow[at],
        programsBuilt: this.built[at],
        turnWaitMs: Math.round(this.waits[at]),
      });
    }
    return slices;
  }

  summary(): FramePaceSummary {
    const count = Math.min(this.noted, PACE_FRAMES);
    if (count === 0) return { count: 0, medianMs: null, p95Ms: null, over50: 0 };
    const sorted = this.gaps.slice(0, count).sort();
    let over50 = 0;
    for (const gap of sorted) if (gap > SLOW_FRAME_MS) over50++;
    return { count, medianMs: percentile(sorted, 0.5), p95Ms: percentile(sorted, 0.95), over50 };
  }

  private advance(nowMs: number): number {
    const index = Math.floor(nowMs / PACE_SLICE_MS);
    if (this.current < 0) {
      this.current = index;
      this.clear(index % PACE_SLICES);
    } else if (index > this.current) {
      const skipped = Math.min(index - this.current, PACE_SLICES);
      for (let step = 1; step <= skipped; step++) this.clear((this.current + step) % PACE_SLICES);
      this.current = index;
    }
    return this.current % PACE_SLICES;
  }

  private clear(at: number): void {
    this.frames[at] = 0;
    this.slowest[at] = 0;
    this.slow[at] = 0;
    this.built[at] = 0;
    this.waits[at] = 0;
  }
}

function percentile(sorted: Float32Array, share: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
}
