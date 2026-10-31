import { describe, expect, it } from 'vitest';
import FORMAT_2_107 from './save-fixtures/format-2-107.json';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

type Saved = typeof FORMAT_2_107;
type Point = { x: number; y: number };

const stepAt = (format: number, world: SavedJson): SavedJson => TINY_STEPS[format - TINY_FROM].step(structuredClone(world));
const toPreLaager = (world: Saved): SavedJson => stepAt(107, world as unknown as SavedJson);
const laagered = (world: Saved): Saved => stepAt(108, toPreLaager(world)) as unknown as Saved;
const fixture = () => structuredClone(FORMAT_2_107);
const car = (w: Saved, id: string) => w.vehicles.find((v) => v.id === id)!;
const LAAGER_BAYS = [
  { x: 311.635, y: 504.26 }, { x: 310.391, y: 506.074 }, { x: 314.681, y: 509.014 }, { x: 309.148, y: 507.889 }, { x: 313.437, y: 510.829 }, { x: 307.904, y: 509.704 },
  { x: 312.193, y: 512.644 }, { x: 306.66, y: 511.519 }, { x: 310.95, y: 514.458 }, { x: 305.417, y: 513.333 }, { x: 309.706, y: 516.273 },
];
const bayIndex = (p: Point) => LAAGER_BAYS.findIndex((b) => Math.hypot(b.x - p.x, b.y - p.y) < 0.01);

describe('save migration 108 to 109, the Hollow draws its cars up in a laager', () => {
  it('sends every Sunward home to the laager bay of the same index and moves no car', () => {
    const next = laagered(fixture());
    expect(bayIndex(car(next, 'v31').brain!.home)).toBe(0);
    expect(bayIndex(car(next, 'v32').brain!.home)).toBe(10);
    expect(bayIndex(car(next, 'v33').brain!.home)).toBe(2);
    const before = toPreLaager(fixture()) as unknown as Saved;
    expect(next.vehicles.map((v) => v.pos)).toEqual(before.vehicles.map((v) => v.pos));
  });

  it('points a goal that aims at a bay to the laager bay and leaves other goals and trucks alone', () => {
    const next = laagered(fixture());
    expect(car(next, 'v31').brain!.goals[0].destination).toEqual(car(next, 'v31').brain!.home);
    expect(bayIndex(car(next, 'v32').brain!.goals[0].destination!)).toBeGreaterThanOrEqual(0);
    expect(car(next, 'v33').brain!.goals[0].destination).toEqual({ x: 350, y: 320 });
    expect(car(next, 'v50')).toEqual(car(toPreLaager(fixture()) as unknown as Saved, 'v50'));
  });

  it('throws on a Sunward car whose home is no bay of the Hollow before its laager', () => {
    const lost = toPreLaager(fixture()) as unknown as Saved;
    car(lost, 'v31').brain!.home = { x: 10, y: 10 };
    expect(() => stepAt(108, lost as unknown as SavedJson)).toThrow(/no bay of the Hollow before its laager/);
  });
});
