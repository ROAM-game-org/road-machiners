import { describe, expect, it } from 'vitest';
import type { Vehicle } from '../../sim/types';
import { PAINT } from '../../data/chassis';
import { SLOW, bare, gunContacts, gunOverlaps, headPlan, loneHeadY, headY, mountedGuns } from '../../test/gun-clearance-kit';
import { UNPRICED_WEAPONS } from '../../data/weapons';
import { MOUNT_CELLS, baseGrid, itemCells, mountSpots, type Cell } from '../../sim/grid';
import { cellRect } from '../../sim/body';
import { makePart } from '../../sim/factory';
import { FIRST_HALF, checkGunsOnTemplates } from '../../test/gun-side-samples';
import { LANE_GAP, VehicleView } from './vehicle';

function sideBySidePair(chassisId: string): Vehicle {
  const { world, v } = bare(chassisId);
  const gun = (defId: string, id: string) => ({ id, kind: 'part' as const, x: 0, y: 0, rot: 0 as const, part: makePart(world, defId, 0) });
  const first = gun('shotgun', 'pair-a');
  for (const a of mountSpots(baseGrid(chassisId), v.items, first, MOUNT_CELLS.weapon as Cell[])) {
    const left = { ...first, ...a };
    const second = gun('slugCannon', 'pair-b');
    const b = mountSpots(baseGrid(chassisId), [left], second, MOUNT_CELLS.weapon as Cell[]).find((t) => t.rot === a.rot && t.y === a.y && Math.abs(t.x - a.x) === 1);
    if (!b) continue;
    v.items.push(left, { ...second, ...b });
    return v;
  }
  throw new Error(`No side-by-side pair on ${chassisId}`);
}

checkGunsOnTemplates(FIRST_HALF);

describe('guns on one truck at rest', () => {
  it('keep the reported pair, apart and at their lone heights', () => {
    const v = sideBySidePair('hauler');
    expect(mountedGuns(v).map((g) => g.part.defId)).toEqual(expect.arrayContaining(['shotgun', 'slugCannon']));
    expect(gunContacts(v, 'world')).toEqual([]);
    expect(gunOverlaps(v, 'world')).toEqual([]);
    for (const g of mountedGuns(v)) expect(headY(v, g.id, 'world')).toBeCloseTo(loneHeadY(v, g.id, 'world'), 3);
  }, SLOW);
});

describe('heads fit their lanes', () => {
  it('keeps every head inside the columns or rows of its footprint', () => {
    const problems: string[] = [];
    for (const chassisId of ['hauler', 'wagon']) {
      for (const defId of Object.keys(UNPRICED_WEAPONS)) {
        for (const rot of [0, 1] as const) {
          for (const tag of ['a', 'b', 'c']) {
            const { world, v } = bare(chassisId);
            const part = { ...makePart(world, defId, 0), id: `lane-${tag}-${defId}` };
            const probe = { id: 'gun', kind: 'part' as const, x: 0, y: 0, rot, part };
            const spot = mountSpots(baseGrid(chassisId), v.items, probe, MOUNT_CELLS.weapon as Cell[]).find((s) => s.rot === rot);
            if (!spot) continue;
            const gun = { ...probe, ...spot };
            v.items.push(gun);
            const view = new VehicleView(v, true, PAINT.standard, 'world');
            view.root.updateMatrixWorld(true);
            const plan = headPlan(view, gun.id);
            const lane = cellRect(chassisId, itemCells(gun));
            view.dispose();
            if (!plan) {
              problems.push(`${chassisId} ${defId} r${rot}: no head`);
              continue;
            }
            const [lo, hi] = rot % 2 === 0 ? [lane.z0, lane.z1] : [lane.x0, lane.x1];
            const [a, b] = rot % 2 === 0 ? [plan.z0, plan.z1] : [plan.x0, plan.x1];
            if (a < lo + LANE_GAP - 0.002 || b > hi - LANE_GAP + 0.002) problems.push(`${chassisId} ${defId} r${rot} ${tag}: head ${a.toFixed(3)}..${b.toFixed(3)} lane ${lo.toFixed(3)}..${hi.toFixed(3)}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  }, SLOW);
});
