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

const DROPPED_ROW = 1;
const STAYING_CORES: readonly { defId: string; x: number; y: number }[] = [{ defId: 'tankMid', x: 4, y: 4 }];

function staysPut(item: SavedJson): boolean {
  if (item.kind !== 'part') return false;
  const defId = (item.part as SavedJson).defId;
  return STAYING_CORES.some((core) => core.defId === defId && core.x === item.x && core.y === item.y);
}

function shifted(item: SavedJson): SavedJson {
  const y = item.y as number;
  if (y <= DROPPED_ROW || staysPut(item)) return item;
  return { ...item, y: y - 1 };
}

function startsOnDroppedRow(item: SavedJson): boolean {
  return item.y === DROPPED_ROW && !(item.kind === 'part' && (item.part as SavedJson).defId === 'wheelMid');
}

function withoutNivaRefit(v: SavedJson): SavedJson {
  const job = v.job as SavedJson | null | undefined;
  if (job?.kind !== 'refit') return v;
  console.warn(`Short Niva hood save step: ${String(v.id)} dropped its refit job, whose spots came from the old grid`);
  return { ...v, job: null };
}

function shortNiva(v: SavedJson): SavedJson {
  if (v.chassisId !== 'niva') return v;
  const items = (v.items as SavedJson[]).map(shifted);
  const settled = [...items.filter((it) => !startsOnDroppedRow(it)), ...items.filter(startsOnDroppedRow)];
  return withoutNivaRefit({ ...v, items: settled });
}

export function withShortNivaHood(world: SavedJson): SavedJson {
  const sheltered = (world.sheltered as SavedJson[]).map((s) => ({ ...s, vehicle: shortNiva(s.vehicle as SavedJson) }));
  return { ...world, vehicles: (world.vehicles as SavedJson[]).map(shortNiva), sheltered };
}


const RETIRED_CARGO: Readonly<Record<string, string>> = {
  flatbed: 'rack',
  trailerBox: 'haulingRack',
  lightFrame: 'haulingRack',
  enclosedFrame: 'haulingRack',
  heavyFrame: 'haulingRack',
};

const TURNED_LONG: ReadonlySet<string> = new Set(['flatbed', 'rack']);

function renamedPart(part: SavedJson): SavedJson {
  const defId = part.defId as string;
  return Object.hasOwn(RETIRED_CARGO, defId) ? { ...part, defId: RETIRED_CARGO[defId] } : part;
}

function renamed(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(renamed);
  if (node === null || typeof node !== 'object') return node;
  const record = node as SavedJson;
  const own = typeof record.defId === 'string' ? renamedPart(record) : record;
  return Object.fromEntries(Object.entries(own).map(([key, value]) => [key, renamed(value)]));
}

function flipped(spot: unknown): unknown {
  if (spot === null || typeof spot !== 'object') return spot;
  const record = spot as SavedJson;
  return { ...record, rot: record.rot === 1 ? 0 : 1 };
}

function turnedMoves(step: SavedJson, turned: ReadonlySet<string>): SavedJson {
  const moves = Array.isArray(step.moves) ? step.moves.map((m) => (turned.has((m as SavedJson).itemId as string) ? { ...(m as SavedJson), from: flipped((m as SavedJson).from), to: flipped((m as SavedJson).to) } : m)) : step.moves;
  return { ...step, moves };
}

function turnedJob(job: unknown, turned: ReadonlySet<string>): unknown {
  if (job === null || typeof job !== 'object' || (job as SavedJson).kind !== 'refit') return job;
  const refit = turnedMoves(job as SavedJson, turned);
  return Array.isArray(refit.queue) ? { ...refit, queue: refit.queue.map((q) => turnedMoves(q as SavedJson, turned)) } : refit;
}

function isTurned(item: SavedJson): boolean {
  return item.kind === 'part' && TURNED_LONG.has((item.part as SavedJson).defId as string);
}

function withTurnedHold(vehicle: unknown): unknown {
  if (vehicle === null || typeof vehicle !== 'object' || !Array.isArray((vehicle as SavedJson).items)) return vehicle;
  const truck = vehicle as SavedJson;
  const items = (truck.items as SavedJson[]).map((it) => (isTurned(it) ? (flipped(it) as SavedJson) : it));
  const turned = new Set((truck.items as SavedJson[]).filter(isTurned).map((it) => it.id as string));
  return 'job' in truck ? { ...truck, items, job: turnedJob(truck.job, turned) } : { ...truck, items };
}

export function withCargoCells(world: SavedJson): SavedJson {
  const vehicles = Array.isArray(world.vehicles) ? world.vehicles.map(withTurnedHold) : world.vehicles;
  const sheltered = Array.isArray(world.sheltered) ? world.sheltered.map((s) => ({ ...(s as SavedJson), vehicle: withTurnedHold((s as SavedJson).vehicle) })) : world.sheltered;
  return renamed({ ...world, vehicles, sheltered }) as SavedJson;
}
