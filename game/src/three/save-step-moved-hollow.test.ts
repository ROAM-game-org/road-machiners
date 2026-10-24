import { describe, expect, it } from 'vitest';
import FORMAT_2_104 from './save-fixtures/format-2-104.json';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';
import { hollowBays } from '../sim/sunward';

type Saved = typeof FORMAT_2_104;
type Point = { x: number; y: number };

const step = (world: Saved): Saved => TINY_STEPS[104 - TINY_FROM].step(structuredClone(world) as unknown as SavedJson) as unknown as Saved;
const fixture = () => structuredClone(FORMAT_2_104);
const car = (w: Saved, id: string) => w.vehicles.find((v) => v.id === id)!;
const bayIndex = (p: Point) => hollowBays().findIndex((b) => Math.hypot(b.x - p.x, b.y - p.y) < 0.01);
const isBay = (p: Point) => bayIndex(p) >= 0;

describe('save migration 104 to 105, the Hollow moves off the roads', () => {
  it('sends every Sunward home to the bay of the same index at the new Hollow and moves no car', () => {
    const next = step(fixture());
    const old = fixture();
    expect(bayIndex(car(next, 'v31').brain!.home)).toBe(0);
    expect(bayIndex(car(next, 'v32').brain!.home)).toBe(10);
    expect(bayIndex(car(next, 'v33').brain!.home)).toBe(2);
    for (const id of ['v31', 'v32', 'v33']) expect(isBay(car(next, id).brain!.home)).toBe(true);
    expect(next.vehicles.map((v) => v.pos)).toEqual(old.vehicles.map((v) => v.pos));
  });

  it('points the goals that aim at an old bay to the new one and drops the route to it', () => {
    const next = step(fixture());
    const rider = car(next, 'v32') as Saved['vehicles'][number] & { farRoute?: unknown };
    expect(isBay(rider.brain!.goals[0].destination!)).toBe(true);
    expect(rider.farRoute).toBeUndefined();
    expect(car(next, 'v31').brain!.goals[0].destination).toEqual(car(next, 'v31').brain!.home);
    expect(car(next, 'v33').brain!.goals[0].destination).toEqual({ x: 350, y: 320 });
  });

  it('forgets the discovered Hollow only, and leaves other trucks and progress alone', () => {
    const next = step(fixture());
    expect(next.player.discovered).toEqual(['bowl', 'nose']);
    expect(next.player.money).toBe(777);
    expect(car(next, 'v50')).toEqual(car(fixture(), 'v50'));
  });

  it('throws on a Sunward car whose home is no bay of the Hollow before it moved', () => {
    const lost = fixture();
    car(lost, 'v31').brain!.home = { x: 10, y: 10 };
    expect(() => step(lost)).toThrow(/no bay of the Hollow before it moved/);
  });
});
