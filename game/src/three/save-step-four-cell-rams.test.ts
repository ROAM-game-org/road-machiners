import { describe, expect, it } from 'vitest';
import FORMAT_2_124 from './save-fixtures/format-2-124.json';
import { TINY_STEPS, type SavedJson } from './save-migrations';

type Spot = { x: number; y: number; rot: number };
type Item = Spot & { id: string; kind: string; part?: { id: string; defId: string; hp: number; wear: number } };
type Step = { moves: { itemId: string; from: Spot; to: Spot }[]; pickup: { itemId: string; partId: string; to: Spot } | null };
type Vehicle = { id: string; chassisId: string; items: Item[]; job: (Step & { kind?: string; queue: Step[] }) | null };
type Saved = { player: { vehicleId: string; storage: unknown[] }; vehicles: Vehicle[] };

const rams = TINY_STEPS.find((s) => s.name === 'withFourCellRams')!;
const ram = (id: string, x: number, y: number, defId = 'ram'): Item => ({ id, kind: 'part', x, y, rot: 0, part: { id: `p-${id}`, defId, hp: 50, wear: 0 } });
const truck = (chassisId: string, items: Item[], job: Vehicle['job'] = null): Vehicle => ({ id: 'v1', chassisId, items, job });
const run = (vehicle: Vehicle): Vehicle => {
  const world = { ...structuredClone(FORMAT_2_124), player: { vehicleId: 'v1', storage: [] }, vehicles: [structuredClone(vehicle)] };
  return (rams.step(world as unknown as SavedJson) as unknown as Saved).vehicles[0];
};
const at = (v: Vehicle, id: string) => v.items.find((it) => it.id === id)!;

describe('the four-cell ram step', () => {
  it('slides a scout ram at x=2 back to x=1 so its four cells lie on the nose', () => {
    expect(at(run(truck('scout', [ram('r', 2, 0)])), 'r').x).toBe(1);
  });

  it('slides a tail ram too, on the last row', () => {
    expect(at(run(truck('scout', [ram('r', 2, 13, 'plowRam')])), 'r').x).toBe(1);
  });

  it('keeps a ram that already fits', () => {
    const v = run(truck('hauler', [ram('r', 3, 0, 'claymoreRam')]));
    expect(at(v, 'r').x).toBe(3);
  });

  it('keeps a ram in storage below the chassis', () => {
    expect(at(run(truck('scout', [ram('r', 2, 20)])), 'r').x).toBe(2);
  });

  it('leaves a ram where it is when the slid ram would overlap another accessory', () => {
    const spike = { ...ram('s', 1, 0, 'spikeCluster') };
    expect(at(run(truck('scout', [ram('r', 2, 0), spike])), 'r').x).toBe(2);
  });

  it('moves the target of a queued refit with the ram', () => {
    const step: Step = { moves: [{ itemId: 'r', from: { x: 2, y: 0, rot: 0 }, to: { x: 2, y: 13, rot: 0 } }], pickup: null };
    const v = run(truck('scout', [ram('r', 2, 0)], { ...step, kind: 'refit', queue: [step] }));
    expect(v.job!.moves[0]).toEqual({ itemId: 'r', from: { x: 1, y: 0, rot: 0 }, to: { x: 1, y: 13, rot: 0 } });
    expect(v.job!.queue[0].moves[0].to.x).toBe(1);
  });

  it('refuses a chassis it does not know', () => {
    expect(() => run(truck('mystery', [ram('r', 1, 0)]))).toThrow(/mystery/);
  });

  it('leaves a loose ram inside the grid where it is', () => {
    expect(at(run(truck('scout', [ram('r', 2, 5)])), 'r').x).toBe(2);
  });

  it('changes nothing but the ram spots, and awards nothing', () => {
    const before = { ...structuredClone(FORMAT_2_124), vehicles: [truck('scout', [ram('r', 2, 0), ram('a', 2, 5, 'spikeCluster')])] };
    const after = rams.step(structuredClone(before) as unknown as SavedJson) as unknown as typeof before;
    expect(after.player).toEqual(before.player);
    expect(after.turn).toBe(before.turn);
    expect(after.vehicles[0].items.map((it) => it.id)).toEqual(['r', 'a']);
    expect(at(after.vehicles[0], 'a')).toEqual(at(before.vehicles[0], 'a'));
  });
});
