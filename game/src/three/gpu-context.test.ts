import { describe, expect, it } from 'vitest';
import { CONTEXT_RESTORE_MS, GpuContext } from './gpu-context';
import { WebGLUnavailable } from './webgl';

function setup() {
  const handlers = new Map<string, () => void>();
  const canvas = { addEventListener: (name: string, fn: () => void) => handlers.set(name, fn) } as unknown as EventTarget;
  const gl = { lostNow: false, isContextLost() { return this.lostNow; } };
  const timers: { fn: () => void; ms: number; live: boolean }[] = [];
  const reports: unknown[] = [];
  const gpu = new GpuContext(canvas, gl, (e) => reports.push(e), {
    set: (fn, ms) => timers.push({ fn, ms, live: true }) - 1,
    clear: (h) => { timers[h as number].live = false; },
  });
  const fire = (name: string) => handlers.get(name)!();
  return { gpu, gl, fire, timers, reports };
}

describe('GpuContext', () => {
  it('counts losses and calls the listeners in order', () => {
    const { gpu, fire } = setup();
    const seen: string[] = [];
    gpu.onLost(() => seen.push(`lost ${gpu.epoch()}`));
    gpu.onRestored(() => seen.push(`restored ${gpu.epoch()}`));
    fire('webglcontextlost');
    fire('webglcontextrestored');
    fire('webglcontextlost');
    fire('webglcontextrestored');
    expect(seen).toEqual(['lost 1', 'restored 1', 'lost 2', 'restored 2']);
  });

  it('reports a context that is not restored once, as WebGLUnavailable', () => {
    const { gpu, fire, timers, reports } = setup();
    gpu.onLost(() => {});
    fire('webglcontextlost');
    expect(timers[0].ms).toBe(CONTEXT_RESTORE_MS);
    timers[0].fn();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toBeInstanceOf(WebGLUnavailable);
  });

  it('clears the deadline on a restore', () => {
    const { fire, timers } = setup();
    fire('webglcontextlost');
    fire('webglcontextrestored');
    expect(timers[0].live).toBe(false);
  });

  it('throws on a restore with no loss before it', () => {
    const { fire } = setup();
    expect(() => fire('webglcontextrestored')).toThrow();
  });

  it('follows the real context before any event arrives', () => {
    const { gpu, gl } = setup();
    expect(gpu.lost()).toBe(false);
    gl.lostNow = true;
    expect(gpu.lost()).toBe(true);
  });
});
