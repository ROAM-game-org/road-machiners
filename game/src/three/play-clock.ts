export class PlayClock {
  private totalMs = 0;
  private thisFrameMs = 0;
  private rate = 0;
  private played = false;

  constructor(private readonly easeMs: number) {
    if (!(easeMs > 0)) throw new Error(`The play clock needs a positive ease time, got ${easeMs} ms`);
  }

  beginFrame(): void {
    this.thisFrameMs = 0;
    this.played = false;
  }

  advance(ms: number): void {
    this.add(ms);
    this.played = true;
    this.rate = 1;
  }

  coast(realMs: number, wanted: boolean, speed: number): void {
    if (this.played) return;
    const from = this.rate;
    const step = realMs / this.easeMs;
    this.rate = wanted ? Math.min(1, from + step) : Math.max(0, from - step);
    const easingMs = Math.abs(this.rate - from) * this.easeMs;
    const steadyMs = Math.max(0, realMs - easingMs) * this.rate;
    this.add(speed * (this.easeMs * Math.abs(easedShare(this.rate) - easedShare(from)) + steadyMs));
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

function easedShare(rate: number): number {
  return rate ** 3 - rate ** 4 / 2;
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
