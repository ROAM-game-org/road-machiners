export type Ease = { stopMs: number; startMs: number };

export class PlayClock {
  private totalMs = 0;
  private thisFrameMs = 0;
  private rate = 0;
  private stopEaseMs: number;

  constructor(private readonly ease: Ease) {
    if (!(ease.stopMs > 0 && ease.startMs > 0)) throw new Error(`The play clock needs positive ease times, got ${ease.stopMs} and ${ease.startMs} ms`);
    this.stopEaseMs = ease.stopMs;
  }

  beginFrame(): void {
    this.thisFrameMs = 0;
  }

  stopWithin(playMs: number): void {
    if (!(playMs >= 0)) throw new Error(`A stop needs a non-negative play time, got ${playMs} ms`);
    this.stopEaseMs = this.rate > 0 ? (2 * playMs) / this.rate ** 2 : this.ease.stopMs;
  }

  coast(realMs: number, wanted: boolean, speed: number): void {
    if (!(realMs >= 0)) throw new Error(`Real time only moves forward, got ${realMs} ms`);
    const from = this.rate;
    const easeMs = wanted ? this.ease.startMs : this.stopEaseMs;
    this.rate = easedRate(from, realMs, easeMs, wanted);
    const easingMs = Math.abs(this.rate - from) * easeMs;
    const steadyMs = Math.max(0, realMs - easingMs) * this.rate;
    this.add(speed * (easeMs * Math.abs(easedShare(this.rate) - easedShare(from)) + steadyMs));
    if (wanted || this.rate === 0) this.stopEaseMs = this.ease.stopMs;
  }

  private add(ms: number): void {
    if (!(ms >= 0)) throw new Error(`Play time only moves forward, got ${ms} ms`);
    this.thisFrameMs += ms;
    this.totalMs += ms;
  }

  nowMs(): number {
    return this.totalMs;
  }

  frameMs(): number {
    return this.thisFrameMs;
  }

  isMoving(): boolean {
    return this.rate > 0;
  }
}

function easedRate(from: number, realMs: number, easeMs: number, wanted: boolean): number {
  if (easeMs === 0) return wanted ? 1 : 0;
  return wanted ? Math.min(1, from + realMs / easeMs) : Math.max(0, from - realMs / easeMs);
}

function easedShare(rate: number): number {
  return rate ** 2 / 2;
}

export function heldPlayMs(realMs: number, held: boolean, maxFrameMs: number): number {
  return held ? 0 : Math.min(Math.max(0, realMs), maxFrameMs);
}

export function easedStopMs(easeMs: number): number {
  return easeMs * easedShare(1);
}

export function easedStopSteps(easeMs: number, stepsPerSecond: number): number {
  return Math.ceil((easedStopMs(easeMs) / 1000) * stepsPerSecond);
}
