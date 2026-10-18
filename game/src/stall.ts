export class Stalled extends Error {
  constructor(what: string, readonly ms: number) {
    super(`${what} got no answer for ${Math.round(ms / 1000)} s`);
    this.name = 'Stalled';
  }
}

export type Timers = { set(ms: number, run: () => void): unknown; clear(handle: unknown): void };

export const REAL_TIMERS: Timers = {
  set: (ms, run) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function checkedLimit(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) throw new Error(`A time limit must be a finite positive number, got ${ms}`);
  return ms;
}

export function withinMs<T>(work: Promise<T>, ms: number, what: string, timers: Timers = REAL_TIMERS): Promise<T> {
  checkedLimit(ms);
  return new Promise<T>((resolve, reject) => {
    const handle = timers.set(ms, () => reject(new Stalled(what, ms)));
    work.then(
      (value) => {
        timers.clear(handle);
        resolve(value);
      },
      (error) => {
        timers.clear(handle);
        reject(error);
      },
    );
  });
}
