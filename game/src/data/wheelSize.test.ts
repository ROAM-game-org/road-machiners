import { describe, expect, it } from 'vitest';
import { CHASSIS } from './chassis';
import { PHYSICS } from './physics';
import SHAPES from './truck-shapes.json';

type Look = keyof typeof PHYSICS.bodies;
type Tire = { radius: number; halfWidth: number };

const SIDE_SHARE = 0.16;
const RADIUS_STEP = 0.01;
const WIDTH_STEP = 0.005;
const WIDTH_GROWTH = 0.75;

const STOCK_FLOOR: Record<Look, Tire> = {
  pickup: { radius: 0.45, halfWidth: 0.18 },
  hauler: { radius: 0.6, halfWidth: 0.25 },
  buggy: { radius: 0.5, halfWidth: 0.22 },
  wagon: { radius: 0.6, halfWidth: 0.25 },
  courier: { radius: 0.4, halfWidth: 0.16 },
  van: { radius: 0.45, halfWidth: 0.18 },
  longbed: { radius: 0.6, halfWidth: 0.25 },
  carrier: { radius: 0.65, halfWidth: 0.28 },
  tractor: { radius: 0.7, halfWidth: 0.3 },
  jeep: { radius: 0.45, halfWidth: 0.18 },
  convertible: { radius: 0.42, halfWidth: 0.17 },
  bus: { radius: 0.55, halfWidth: 0.22 },
  niva: { radius: 0.45, halfWidth: 0.18 },
  bukhanka: { radius: 0.55, halfWidth: 0.2 },
  lincoln: { radius: 0.42, halfWidth: 0.17 },
  semi: { radius: 0.65, halfWidth: 0.18 },
  loader: { radius: 0.8, halfWidth: 0.32 },
  sorokonoga: { radius: 0.55, halfWidth: 0.2 },
};

const SEMI_TIRE: Tire = { radius: 0.8, halfWidth: 0.21 };
const SOROKONOGA_TIRE: Tire = { radius: 0.55, halfWidth: 0.2 };
const RIGS: readonly string[] = ['semi', 'sorokonoga'];

function sideRadius(base: keyof typeof SHAPES): number {
  const boxes = SHAPES[base].boxes;
  const length = Math.max(...boxes.map((b) => b.x1)) - Math.min(...boxes.map((b) => b.x0));
  const height = Math.max(...boxes.map((b) => b.z1)) - Math.min(...boxes.map((b) => b.z0));
  return SIDE_SHARE * Math.sqrt(length * height);
}

function ruleTire(look: Look, base: keyof typeof SHAPES): Tire {
  const stock = STOCK_FLOOR[look];
  const radius = Math.max(stock.radius, Math.round(sideRadius(base) / RADIUS_STEP) * RADIUS_STEP);
  const halfWidth = stock.halfWidth * (1 + WIDTH_GROWTH * (radius / stock.radius - 1));
  return { radius, halfWidth };
}

const RULED = Object.entries(CHASSIS)
  .filter(([, def]) => !RIGS.includes(def.look))
  .map(([id, def]) => ({ id, look: def.look, base: `base_${id}` as keyof typeof SHAPES }));

describe('tire size rule', () => {
  it('covers every look but the rigs', () => {
    const looks = new Set(RULED.map((c) => c.look));
    expect([...looks].sort()).toEqual(Object.keys(PHYSICS.bodies).filter((l) => !RIGS.includes(l)).sort());
  });

  it.each(RULED)('$id rolls on the larger of its side share of the body and its stock tire', ({ look, base }) => {
    const rule = ruleTire(look, base);
    const body = PHYSICS.bodies[look];
    expect(Math.abs(body.wheelRadius - rule.radius)).toBeLessThanOrEqual(RADIUS_STEP / 2 + 1e-9);
    expect(Math.abs(body.wheelHalfWidth - rule.halfWidth)).toBeLessThanOrEqual(WIDTH_STEP / 2 + 1e-9);
  });

  it('keeps the semi on the tire its tandem spacing and photo height allow, since its trailer box is not what its tires carry', () => {
    expect(PHYSICS.bodies.semi.wheelRadius).toBe(SEMI_TIRE.radius);
    expect(PHYSICS.bodies.semi.wheelHalfWidth).toBe(SEMI_TIRE.halfWidth);
  });

  it('keeps the sorokonoga on the tire its driving numbers are tuned on, since a tractor-sized tire would change its ride and physics', () => {
    expect(PHYSICS.bodies.sorokonoga.wheelRadius).toBe(SOROKONOGA_TIRE.radius);
    expect(PHYSICS.bodies.sorokonoga.wheelHalfWidth).toBe(SOROKONOGA_TIRE.halfWidth);
    expect(PHYSICS.couplings.sorokonoga.rear.wheelRadius).toBe(SOROKONOGA_TIRE.radius);
  });
});
