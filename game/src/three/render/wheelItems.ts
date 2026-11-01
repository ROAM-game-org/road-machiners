import { partDef } from '../../data/parts';
import { cellCenter, unitsOf } from '../../sim/body';
import type { GridItem, Vehicle } from '../../sim/types';

type PartItem = Extract<GridItem, { kind: 'part' }>;
type Mount = { x: number; z: number };

export function cornerWheels(v: Vehicle, mounts: Mount[], items: PartItem[]): PartItem[] {
  if (items.length !== mounts.length) throw new Error(`${v.id} has ${items.length} mounted wheels, expected ${mounts.length}`);
  return mounts.map((m) => {
    const inCorner = items.filter((it) => {
      const c = cellCenter(v.chassisId, it.x, it.y);
      return Math.sign(c.x) === Math.sign(m.x) && Math.sign(c.z) === Math.sign(m.z);
    });
    if (inCorner.length !== 1) throw new Error(`${v.id} has ${inCorner.length} wheel items in the corner of the wheel mount ${m.x},${m.z}, expected 1`);
    return inCorner[0];
  });
}

export function nearestWheels(v: Vehicle, mounts: { unit: number; m: Mount }[], items: PartItem[]): PartItem[] {
  const straight = (unit: number, x: number) => x + unitsOf(v.chassisId)[unit].offset;
  const itemAlong = (it: PartItem) => {
    const first = cellCenter(v.chassisId, it.x, it.y);
    const last = cellCenter(v.chassisId, it.x, it.y + partDef(it.part.defId).h - 1);
    return (straight(first.unit, first.x) + straight(last.unit, last.x)) / 2;
  };
  const picks = mounts.map(({ unit, m }) => {
    const side = items.filter((it) => Math.sign(cellCenter(v.chassisId, it.x, it.y).z) === Math.sign(m.z));
    if (side.length === 0) throw new Error(`${v.id} has no wheel item on the side of the wheel mount ${m.x},${m.z}`);
    const along = (it: PartItem) => Math.abs(itemAlong(it) - straight(unit, m.x));
    return side.reduce((best, it) => (along(it) < along(best) ? it : best));
  });
  const unused = items.filter((it) => !picks.includes(it));
  if (unused.length > 0) throw new Error(`${v.id} draws no wheel for its wheel items ${unused.map((it) => it.part.id).join(', ')}`);
  return picks;
}
