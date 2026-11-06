import type { GpuContext } from '../three/gpu-context';

type FakeGpu = GpuContext & { blackout(): void; recover(): void };

export function fakeGpu(): FakeGpu {
  const restored: (() => void)[] = [];
  let gone = false;
  let count = 0;
  const gpu = {
    lost: () => gone,
    epoch: () => count,
    onLost() {},
    onRestored: (fn: () => void) => restored.push(fn),
    blackout() { gone = true; count++; },
    recover() { gone = false; restored.forEach((fn) => fn()); },
  };
  return gpu as unknown as FakeGpu;
}

export type Readback = { honest(): boolean };

export const HONEST_READBACK: Readback = { honest: () => true };

export const REFUSED_READBACK: Readback = { honest: () => false };
