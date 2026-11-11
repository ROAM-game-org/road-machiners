import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { axlesOf, isRig, unitBody } from '../sim/body';
import { makeVehicle } from '../sim/factory';
import { emptyWorld } from '../sim/testkit';
import { wheelLoads } from './units';

const rigIds = Object.keys(CHASSIS).filter(isRig);

function loadedRig(chassisId: string) {
  const w = emptyWorld();
  return makeVehicle(w, { faction: 'player', chassisId, parts: [{ defId: 'workhorseDiesel', wear: 0 }], spares: [], cargo: {}, pos: { x: 20, y: 20 }, heading: 0, brain: null });
}

describe('wheelLoads', () => {
  it.each(rigIds)('%s: every wheel of every unit carries weight', (id) => {
    const loads = wheelLoads(loadedRig(id));
    for (const unit of loads) for (const wheel of unit.wheels) expect(wheel).toBeGreaterThan(0);
  });

  it.each(rigIds)('%s: the wheels carry the whole rig', (id) => {
    const loads = wheelLoads(loadedRig(id));
    const carried = loads.flatMap((u) => u.wheels).reduce((sum, l) => sum + l, 0);
    const mass = loads.reduce((sum, u) => sum + u.mass, 0);
    expect(carried).toBeCloseTo(mass, 6);
  });

  it('puts the drive axle closer to the unit and the pivot load on its real axles', () => {
    const v = loadedRig('sorokonoga');
    const [front] = wheelLoads(v);
    const axles = axlesOf(unitBody('sorokonoga', 0));
    expect(axles.rear).toBeGreaterThan(-unitBody('sorokonoga', 0).wheelX);
    expect(front.wheels[2]).toBeGreaterThan(front.wheels[0]);
  });
});
