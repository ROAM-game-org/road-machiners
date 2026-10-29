import { partDef } from '../data/parts';
import { makePart, newId } from '../sim/factory';
import { gridOf, mountCellsOf, mountSpots } from '../sim/grid';
import type { GridItem, Vehicle, World } from '../sim/types';

type PartItem = Extract<GridItem, { kind: 'part' }>;

export function mountParts(w: World, v: Vehicle, defIds: string[]): PartItem[] {
  const placed: GridItem[] = v.items.filter((i) => i.kind === 'part' && partDef(i.part.defId).kind === 'core');
  const mounted: PartItem[] = [];
  const grid = gridOf(v);
  for (const defId of defIds) {
    const part = makePart(w, defId, 0);
    const probe: PartItem = { id: newId(w, 'i'), x: 0, y: 0, rot: 0, kind: 'part', part };
    const spot = mountSpots(grid, placed, probe, mountCellsOf(defId))[0];
    if (!spot) throw new Error(`${v.chassisId} has no free mount for ${defId}`);
    const item: PartItem = { ...probe, ...spot };
    placed.push(item);
    mounted.push(item);
  }
  return mounted;
}
