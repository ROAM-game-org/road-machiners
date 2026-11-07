import type { SavedJson } from './save-migrations';

type CoreSpot = { defId: string; x: number; y: number; rot: number };
type CoreMove = { from: Omit<CoreSpot, 'rot'>; to: CoreSpot };

const core = (defId: string, x: number, y: number, toId: string, toX: number, toY: number, rot = 0): CoreMove => ({ from: { defId, x, y }, to: { defId: toId, x: toX, y: toY, rot } });

const MOVED_CORES: Readonly<Record<string, readonly CoreMove[]>> = {
  scout: [core('cabPickup', 1, 6, 'cabBroad', 1, 6), core('tank', 4, 8, 'tank', 4, 9)],
  hauler: [core('cabPickup', 2, 6, 'cabBroad', 2, 6)],
  buggy: [core('cab', 4, 3, 'cab', 2, 5, 1)],
  wagon: [core('cabPickup', 3, 2, 'cabBroad', 2, 3)],
  courier: [core('cab', 3, 6, 'cab', 2, 6, 1)],
  van: [core('cabPickup', 1, 7, 'cabPickup', 2, 7)],
  longbed: [core('cabPickup', 2, 6, 'cabBroad', 2, 6)],
  carrier: [core('cabPickup', 2, 9, 'cabBroad', 2, 9)],
  tractor: [core('cabPickup', 3, 6, 'cabBroad', 2, 6)],
  jeep: [core('cab', 1, 4, 'cab', 2, 4, 1)],
  convertible: [core('cabHardtop', 3, 6, 'cabHardtop', 2, 6, 1)],
  loader: [core('cabPickup', 2, 3, 'cabBroad', 2, 7), core('transmissionHeavy', 3, 6, 'transmissionHeavy', 3, 3), core('tankHeavy', 2, 6, 'tankHeavy', 2, 3)],
  niva: [core('cab', 1, 4, 'cab', 2, 6, 1)],
};

function matches(item: SavedJson, from: CoreMove['from']): boolean {
  return item.kind === 'part' && (item.part as SavedJson).defId === from.defId && item.x === from.x && item.y === from.y;
}

function movedItem(item: SavedJson, moves: readonly CoreMove[]): SavedJson {
  const move = moves.find((m) => matches(item, m.from));
  if (!move) return item;
  return { ...item, x: move.to.x, y: move.to.y, rot: move.to.rot, part: { ...(item.part as SavedJson), defId: move.to.defId } };
}

function withoutRefit(v: SavedJson): SavedJson {
  const job = v.job as SavedJson | null | undefined;
  if (job?.kind !== 'refit') return v;
  console.warn(`Truck grids save step: ${String(v.id)} (${String(v.chassisId)}) dropped its refit job, whose spots came from the old grid`);
  return { ...v, job: null };
}

function movedTruck(v: SavedJson): SavedJson {
  const moves = MOVED_CORES[v.chassisId as string];
  if (!moves) return v;
  return withoutRefit({ ...v, items: (v.items as SavedJson[]).map((item) => movedItem(item, moves)) });
}

export function withTruckGrids(world: SavedJson): SavedJson {
  const sheltered = (world.sheltered as SavedJson[]).map((s) => ({ ...s, vehicle: movedTruck(s.vehicle as SavedJson) }));
  return { ...world, vehicles: (world.vehicles as SavedJson[]).map(movedTruck), sheltered };
}
