import { PARTS } from '../data/parts';
import { BODY_PARTS } from '../render/partLooks';
import { makePart } from '../sim/factory';
import { gridOf, isMounted, itemCells, placementError, type Grid } from '../sim/grid';
import { addVehicle, emptyWorld } from '../sim/testkit';
import type { GridItem } from '../sim/types';
import { faultsOf } from './truck-support-faults';

const FLOATING_EDGE_CELLS: Record<string, string[]> = {
  'convertible|sprout': ['convertible unit 0 sprout  mounted @4,10 r0 stands on 87% with up to 7.7 cm of air at -1.66,0.16,0.24'],
  'jeep|trailerBox': ['jeep unit 0 trailerBox  mounted @2,5 r1 stands on 75% with up to 5.4 cm of air at -0.33,0.82,0.66'],
  'loader|caltrops': ['loader unit 0 caltrops  mounted @6,14 r1 stands on 75% with up to Infinity cm of air at -3.12,-0.30,1.03'],
  'longbed|panniers': ['longbed unit 0 panniers  mounted @5,7 r1 stands on 89% with up to 25.2 cm of air at 0.70,1.29,0.90'],
  'longbed|sprout': ['longbed unit 0 sprout  mounted @5,7 r1 stands on 88% with up to 9.2 cm of air at 0.71,1.33,0.78'],
  'wagon|caltrops': ['wagon unit 0 caltrops  mounted @3,1 r1 stands on 89% with up to 5.0 cm of air at 2.97,0.31,-0.16'],
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
