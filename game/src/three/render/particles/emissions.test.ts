import { describe, expect, it, vi } from 'vitest';
import { EMISSION_LOOK, Emissions } from './emissions';
import { Particles } from './particles';

const at = { x: 0, y: 1, z: 0 };

function setup() {
  const lit = new Particles(64, () => true);
  const glow = new Particles(64, () => true);
  return { lit, glow, emissions: new Emissions(lit, glow) };
}

describe('Emissions', () => {
  it('spawns one lit particle per truck puff', () => {
    const { lit, glow, emissions } = setup();
    emissions.exhaust(at, { x: -1, y: 0, z: 0 });
    emissions.steam(at, { x: 0, y: 0, z: 0 });
    emissions.douse(at);
    emissions.breakdown(at, { x: 4, y: 0, z: 0 });
    emissions.hurt(at, 0.5);
    emissions.dust(at);
    expect(lit.alive()).toBe(6);
    expect(glow.alive()).toBe(0);
  });

  it('spawns a smaller, slower exhaust puff for a smaller truck', () => {
    const big = setup();
    const small = setup();
    big.emissions.exhaust(at, { x: -1, y: 0, z: 0 });
    small.emissions.exhaust(at, { x: -1, y: 0, z: 0 }, 0.5);
    expect(small.lit.alive()).toBe(1);
  });

  it.each(['steam', 'breakdown'] as const)('rides %s from the engine with the truck and sizes it by the vent scale', (kind) => {
    const { lit, emissions } = setup();
    const spawn = vi.spyOn(lit, 'spawn');
    const motion = { x: 8, y: 0, z: -3 };
    for (let i = 0; i < 20; i++) emissions[kind](at, motion, 0.6);
    const jet = EMISSION_LOOK[`${kind}Jet`];
    for (const [, vel, , size] of spawn.mock.calls) {
      expect(Math.abs(vel.x - motion.x)).toBeLessThanOrEqual((0.6 * jet.side) / 2);
      expect(Math.abs(vel.z - motion.z)).toBeLessThanOrEqual((0.6 * jet.side) / 2);
      expect(vel.y).toBeLessThanOrEqual(0.6 * (jet.up.min + jet.up.spread));
      expect(size).toBeLessThanOrEqual(0.6 * 1.5);
    }
  });

  it('adds a nozzle glow to a kept missile puff', () => {
    const { lit, glow, emissions } = setup();
    for (let i = 0; i < 40; i++) emissions.missile(at);
    expect(lit.alive()).toBeGreaterThan(0);
    expect(glow.alive()).toBe(lit.alive());
  });

  it('sizes hurt smoke by the vent scale', () => {
    const { lit, emissions } = setup();
    const spawn = vi.spyOn(lit, 'spawn');
    for (let i = 0; i < 20; i++) emissions.hurt(at, 1, 0.6);
    const largest = (1 + EMISSION_LOOK.hurtGrowth) * (1 + EMISSION_LOOK.billowSpread / 2);
    for (const [, vel, , size] of spawn.mock.calls) {
      expect(size).toBeLessThanOrEqual(0.6 * largest);
      expect(vel.y).toBeLessThanOrEqual(0.6 * (EMISSION_LOOK.hurtJet.up.min + EMISSION_LOOK.hurtJet.up.spread));
    }
  });

  it('clamps hurt damage outside 0 to 1', () => {
    const { lit, emissions } = setup();
    emissions.hurt(at, -1);
    emissions.hurt(at, 7);
    expect(lit.alive()).toBe(2);
  });
});
