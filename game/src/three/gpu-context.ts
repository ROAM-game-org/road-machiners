import { WebGLUnavailable } from './webgl';

export const CONTEXT_RESTORE_MS = 10_000;

type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void };

export class GpuContext {
  private losses = 0;
  private down = false;
  private deadline: unknown = null;
  private readonly lostListeners: (() => void)[] = [];
  private readonly restoredListeners: (() => void)[] = [];

  constructor(
    canvas: EventTarget,
    private readonly gl: { isContextLost(): boolean },
    private readonly onUnrestored: (error: WebGLUnavailable) => void,
    private readonly timers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) },
  ) {
    canvas.addEventListener('webglcontextlost', () => this.lose());
    canvas.addEventListener('webglcontextrestored', () => this.restore());
  }

  lost(): boolean {
    return this.gl.isContextLost();
  }

  epoch(): number {
    return this.losses;
  }

  onLost(fn: () => void): void {
    this.lostListeners.push(fn);
  }

  onRestored(fn: () => void): void {
    this.restoredListeners.push(fn);
  }

  private lose(): void {
    this.losses++;
    this.down = true;
    this.clearDeadline();
    this.deadline = this.timers.set(() => {
      this.deadline = null;
      this.onUnrestored(new WebGLUnavailable('the WebGL context was lost and not restored'));
    }, CONTEXT_RESTORE_MS);
    for (const fn of this.lostListeners) fn();
  }

  private restore(): void {
    if (!this.down) throw new Error('webglcontextrestored arrived with no webglcontextlost before it');
    this.down = false;
    this.clearDeadline();
    this.timers.set(() => this.restoredListeners.forEach((fn) => fn()), 0);
  }

  private clearDeadline(): void {
    if (this.deadline !== null) this.timers.clear(this.deadline);
    this.deadline = null;
  }
}
