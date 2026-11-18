export const PACE_FRAMES = 600;
const SLOW_FRAME_MS = 50;

export type FramePaceSummary = { count: number; medianMs: number | null; p95Ms: number | null; over50: number };

export class FramePace {
  private readonly gaps = new Float32Array(PACE_FRAMES);
  private next = 0;
  private noted = 0;

  note(gapMs: number): void {
    this.gaps[this.next] = gapMs;
    this.next = (this.next + 1) % PACE_FRAMES;
    this.noted++;
  }

  summary(): FramePaceSummary {
    const count = Math.min(this.noted, PACE_FRAMES);
    if (count === 0) return { count: 0, medianMs: null, p95Ms: null, over50: 0 };
    const sorted = this.gaps.slice(0, count).sort();
    let over50 = 0;
    for (const gap of sorted) if (gap > SLOW_FRAME_MS) over50++;
    return { count, medianMs: percentile(sorted, 0.5), p95Ms: percentile(sorted, 0.95), over50 };
  }
}

function percentile(sorted: Float32Array, share: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
}
