export type Ease = { stopMs: number; startMs: number; stopFolds: number };

export class PlayClock {
  private totalMs = 0;
  private thisFrameMs = 0;
  private heldNow = false;
  private rate = 0;
  private stopEaseMs: number;
  private readonly stop: StopCurve;

  constructor(private readonly ease: Ease) {
    if (!(ease.stopMs > 0 && ease.startMs > 0)) throw new Error(`The play clock needs positive ease times, got ${ease.stopMs} and ${ease.startMs} ms`);
    this.stop = new StopCurve(ease.stopFolds);
    this.stopEaseMs = ease.stopMs;
  }

  beginFrame(held: boolean): void {
    this.thisFrameMs = 0;
    this.heldNow = held;
  }

  isHeld(): boolean {
    return this.heldNow;
  }

  stopWithin(playMs: number): void {
    if (!(playMs >= 0)) throw new Error(`A stop needs a non-negative play time, got ${playMs} ms`);
    const left = this.stop.leftShare(this.rate);
    this.stopEaseMs = left > 0 ? playMs / left : this.ease.stopMs;
  }

  coast(realMs: number, wanted: boolean, speed: number): void {
    if (!(realMs >= 0)) throw new Error(`Real time only moves forward, got ${realMs} ms`);
    this.add(speed * (wanted ? this.speedUp(realMs) : this.slowDown(realMs)));
    if (wanted || this.rate === 0) this.stopEaseMs = this.ease.stopMs;
  }

  private speedUp(realMs: number): number {
    const from = this.rate;
    const easeMs = this.ease.startMs;
    this.rate = Math.min(1, from + realMs / easeMs);
    const easingMs = (this.rate - from) * easeMs;
    return (easeMs * (this.rate ** 2 - from ** 2)) / 2 + Math.max(0, realMs - easingMs) * this.rate;
  }

  private slowDown(realMs: number): number {
    if (this.rate === 0 || this.stopEaseMs === 0) return (this.rate = 0);
    const from = this.stop.positionAt(this.rate);
    const to = Math.min(1, from + realMs / this.stopEaseMs);
    this.rate = to === 1 ? 0 : this.stop.rateAt(to);
    return this.stopEaseMs * (this.stop.playedTo(to) - this.stop.playedTo(from));
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

class StopCurve {
  private readonly floor: number;

  constructor(private readonly folds: number) {
    if (!(folds > 0 && Number.isFinite(folds))) throw new Error(`A stop curve needs a positive number of e-folds, got ${folds}`);
    this.floor = Math.exp(-folds);
  }

  rateAt(position: number): number {
    return (Math.exp(-this.folds * position) - this.floor) / (1 - this.floor);
  }

  positionAt(rate: number): number {
    return Math.min(1, Math.max(0, -Math.log(rate * (1 - this.floor) + this.floor) / this.folds));
  }

  playedTo(position: number): number {
    return ((1 - Math.exp(-this.folds * position)) / this.folds - position * this.floor) / (1 - this.floor);
  }

  leftShare(rate: number): number {
    return this.playedTo(1) - this.playedTo(this.positionAt(rate));
  }
}

export function heldPlayMs(realMs: number, held: boolean, maxFrameMs: number): number {
  return held ? 0 : Math.min(Math.max(0, realMs), maxFrameMs);
}

export function easedStopMs(ease: Pick<Ease, "stopMs" | "stopFolds">): number {
  return ease.stopMs * new StopCurve(ease.stopFolds).playedTo(1);
}

export function easedStopSteps(ease: Pick<Ease, "stopMs" | "stopFolds">, stepsPerSecond: number): number {
  return Math.ceil((easedStopMs(ease) / 1000) * stepsPerSecond);
}
