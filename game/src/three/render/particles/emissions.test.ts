import { describe, expect, it } from 'vitest';
import { Emissions } from './emissions';
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
    emissions.steam(at);
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

  it('adds a nozzle glow to a kept missile puff', () => {
    const { lit, glow, emissions } = setup();
    for (let i = 0; i < 40; i++) emissions.missile(at);
    expect(lit.alive()).toBeGreaterThan(0);
    expect(glow.alive()).toBe(lit.alive());
  });

  it('clamps hurt damage outside 0 to 1', () => {
    const { lit, emissions } = setup();
    emissions.hurt(at, -1);
    emissions.hurt(at, 7);
    expect(lit.alive()).toBe(2);
  });
});
