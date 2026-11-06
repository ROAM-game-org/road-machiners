import { PARTS } from '../data/parts';
import { BODY_PARTS } from '../render/partLooks';
import { makePart } from '../sim/factory';
import { gridOf, isMounted, itemCells, placementError, type Grid } from '../sim/grid';
import { addVehicle, emptyWorld } from '../sim/testkit';
import type { GridItem } from '../sim/types';
import { faultsOf } from './truck-support-faults';

const JEEP_FRAME_NOSE = ['jeep unit 0 lightFrame  mounted @1,1 r1 stands on 75% with up to 10.0 cm of air at 0.88,0.74,0.72', 'jeep unit 0 lightFrame  mounted @2,1 r1 stands on 75% with up to 10.0 cm of air at 0.88,0.73,-0.67'];

const FLOATING_EDGE_CELLS: Record<string, string[]> = {
  'jeep|lightFrame': JEEP_FRAME_NOSE,
  'jeep|heavyFrame': JEEP_FRAME_NOSE,
  'loader|caltrops': ['loader unit 0 caltrops  mounted @6,13 r1 stands on 75% with up to Infinity cm of air at -3.07,-0.30,1.03', 'loader unit 0 caltrops  mounted @6,14 r1 stands on 75% with up to Infinity cm of air at -3.12,-0.30,1.03'],
  'courier|panniers': ['courier unit 0 panniers  mounted @1,2 r0 stands on 75% with up to 9.6 cm of air at 1.50,0.10,-0.33', 'courier unit 0 panniers  mounted @1,2 r1 stands on 75% with up to 9.6 cm of air at 1.50,0.10,-0.28', 'courier unit 0 panniers  mounted @4,2 r0 stands on 75% with up to 9.6 cm of air at 1.50,0.10,0.28', 'courier unit 0 panniers  mounted @4,2 r1 stands on 75% with up to 9.6 cm of air at 1.50,0.10,0.33'],
  'van|oilSpiller': ['van unit 0 oilSpiller  mounted @1,1 r0 stands on 76% with up to 5.2 cm of air at 2.52,0.37,-0.96', 'van unit 0 oilSpiller  mounted @2,1 r0 stands on 76% with up to 5.2 cm of air at 2.52,0.37,-0.51', 'van unit 0 oilSpiller  mounted @3,1 r0 stands on 76% with up to 5.2 cm of air at 2.52,0.37,-0.06', 'van unit 0 oilSpiller  mounted @4,1 r0 stands on 76% with up to 5.2 cm of air at 2.52,0.37,0.39', 'van unit 0 oilSpiller  mounted @5,1 r0 stands on 76% with up to 5.2 cm of air at 2.52,0.37,0.84'],
  'buggy|supplyLocker': ['buggy unit 0 supplyLocker  mounted @1,2 r1 stands on 75% with up to 34.0 cm of air at 1.32,-0.11,-0.52', 'buggy unit 0 supplyLocker  mounted @4,2 r1 stands on 75% with up to 34.0 cm of air at 1.32,-0.11,0.57'],
};

const EDGE_KINDS = new Set(['cargo', 'scanner', 'store', 'utility']);

export const EDGE_PART_IDS = Object.values(PARTS)
  .filter((def) => EDGE_KINDS.has(def.kind) && !BODY_PARTS.has(def.id))
  .map((def) => def.id);

function atEdge(grid: Grid, item: GridItem): boolean {
  const letter = grid.cells[item.y][item.x];
  return itemCells(item).some(({ x, y }) => [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => grid.cells[y + dy]?.[x + dx] !== letter)));
}

export function faultsOnEveryEdgeCell(chassisId: string, defId: string): { faults: string[]; known: string[] } {
  const faults: string[] = [];
  const w = emptyWorld();
  const base = addVehicle(w, 'scrapjaw', chassisId, [], { x: 40, y: 30 });
  const grid = gridOf(base);
  const probe: GridItem = { id: 'probe', kind: 'part', part: makePart(w, defId, 0), x: 0, y: 0, rot: 0 };
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      for (const rot of [0, 1] as const) {
        const item = { ...probe, x, y, rot };
        if (placementError(grid, base.items, item, null) !== null || !isMounted(chassisId, item) || !atEdge(grid, item)) continue;
        faults.push(...faultsOf({ ...base, items: [...base.items, item] }).map((f) => f.replace(/ v\d+ /, ' ')));
      }
    }
  }
  return { faults, known: FLOATING_EDGE_CELLS[`${chassisId}|${defId}`] ?? [] };
}
