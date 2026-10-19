
import { describe, expect, it } from 'vitest';
import { PHYSICS } from '../../data/physics';
import { loadModels, socket, type ModelName } from './models';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

const TOLERANCE = 0.02;
const ARCH_CLEARANCE: Record<string, number> = { lincoln: 0.06, niva: 0.06, bukhanka: 0.06, semi: 0.06, scout: 0.27 };

describe('wheel arches of the reference photo bases', () => {
  it.each(['lincoln', 'niva', 'bukhanka', 'semi', 'scout'] as const)('%s: arches sit on the physics wheels', (id) => {
    const body = PHYSICS.bodies[id === 'scout' ? 'pickup' : id];
    const name = `base_${id}` as ModelName;
    const hub = body.wheelY - PHYSICS.truck.suspensionRest;
    const front = socket(name, 'arch_front');
    const rear = socket(name, 'arch_rear');
    const top = socket(name, 'arch_front_top');
    expect(Math.abs(front.x - body.wheelX)).toBeLessThan(TOLERANCE);
    expect(Math.abs(rear.x + body.wheelX)).toBeLessThan(TOLERANCE);
    expect(Math.abs(front.y - hub)).toBeLessThan(TOLERANCE);
    expect(Math.abs(rear.y - hub)).toBeLessThan(TOLERANCE);
    expect(Math.abs(Math.abs(front.z) - body.wheelZ)).toBeLessThan(TOLERANCE);
    expect(Math.abs(top.y - front.y - (body.wheelRadius + ARCH_CLEARANCE[id]))).toBeLessThan(TOLERANCE);
  });
});
