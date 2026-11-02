import type { SavedJson } from './save-migrations';

type Spot = { x: number; y: number; rot: number };
type Edge = { rows: number; right: number };

const RAMS: ReadonlySet<string> = new Set(['ram', 'plowRam', 'claymoreRam']);
const RAM_WIDTH = 4;
const ACCESSORY_WIDTHS: Readonly<Record<string, readonly [number, number]>> = { spikeCluster: [1, 1], spikeStrip: [1, 2] };

const EDGES_FOUR_CELL: Readonly<Record<string, Edge>> = {
  scout: { rows: 14, right: 4 },
  hauler: { rows: 16, right: 6 },
  buggy: { rows: 11, right: 4 },
  wagon: { rows: 16, right: 6 },
  courier: { rows: 11, right: 4 },
  van: { rows: 15, right: 5 },
  longbed: { rows: 18, right: 6 },
  carrier: { rows: 15, right: 6 },
  tractor: { rows: 16, right: 6 },
  jeep: { rows: 12, right: 4 },
  convertible: { rows: 15, right: 5 },
  bus: { rows: 21, right: 5 },
  loader: { rows: 16, right: 6 },
  niva: { rows: 12, right: 4 },
  bukhanka: { rows: 14, right: 5 },
  lincoln: { rows: 18, right: 5 },
  semi: { rows: 48, right: 7 },
  sorokonoga: { rows: 27, right: 5 },
};

function edgeOf(chassisId: string): Edge | null {
  return Object.hasOwn(EDGES_FOUR_CELL, chassisId) ? EDGES_FOUR_CELL[chassisId] : null;
}

function slid(edge: Edge, spot: Spot): Spot {
  const onEdge = spot.y === 0 || spot.y === edge.rows - 1;
  if (!onEdge) return spot;
  return { ...spot, x: Math.max(1, Math.min(spot.x, edge.right - RAM_WIDTH + 1)) };
}

function partDefsOf(node: unknown, out: Map<string, string>): Map<string, string> {
  if (Array.isArray(node)) node.forEach((n) => partDefsOf(n, out));
  else if (node !== null && typeof node === 'object') {
    const record = node as SavedJson;
    if (typeof record.id === 'string' && typeof record.defId === 'string') out.set(record.id, record.defId);
    Object.values(record).forEach((n) => partDefsOf(n, out));
  }
  return out;
}

function defOf(item: SavedJson): string | null {
  return item.kind === 'part' ? ((item.part as SavedJson).defId as string) : null;
}

function widthOf(item: SavedJson): number {
  const defId = defOf(item);
  if (defId === null) return 1;
  if (RAMS.has(defId)) return RAM_WIDTH;
  const dims = ACCESSORY_WIDTHS[defId];
  if (dims === undefined) return 1;
  return item.rot === 1 ? dims[1] : dims[0];
}

function overlaps(a: SavedJson, aX: number, b: SavedJson): boolean {
  const bDef = defOf(b);
  const accessory = bDef !== null && (RAMS.has(bDef) || bDef in ACCESSORY_WIDTHS);
  return accessory && b.y === a.y && aX < (b.x as number) + widthOf(b) && (b.x as number) < aX + RAM_WIDTH;
}

function slidRams(edge: Edge, items: readonly SavedJson[]): SavedJson[] {
  const out = [...items];
  const rams = out.map((it, i) => ({ it, i })).filter(({ it }) => RAMS.has(defOf(it) ?? '') && (it.y as number) < edge.rows);
  for (const { it, i } of rams.sort((a, b) => (a.it.x as number) - (b.it.x as number))) {
    const to = slid(edge, it as unknown as Spot);
    const clear = !out.some((other) => other !== out[i] && overlaps(it, to.x, other));
    if (clear) out[i] = { ...it, x: to.x };
  }
  return out;
}

function mapStep(edge: Edge, defs: ReadonlyMap<string, string>, moved: ReadonlyMap<string, SavedJson>, itemDefs: ReadonlyMap<string, string>, step: SavedJson): SavedJson {
  const moves = (step.moves as SavedJson[]).map((m) => {
    if (!RAMS.has(itemDefs.get(m.itemId as string) ?? '')) return m;
    const now = moved.get(m.itemId as string);
    const from = now && (now.y === (m.from as Spot).y) ? { ...(m.from as Spot), x: now.x as number } : m.from;
    return { ...m, from, to: slid(edge, m.to as Spot) };
  });
  const pickup = step.pickup as SavedJson | null;
  const pickupDef = pickup === null ? null : defs.get(pickup.partId as string) ?? null;
  const nextPickup = pickup !== null && RAMS.has(pickupDef ?? '') ? { ...pickup, to: slid(edge, pickup.to as Spot) } : pickup;
  return { ...step, moves, pickup: nextPickup };
}

function mapJob(edge: Edge, defs: ReadonlyMap<string, string>, before: readonly SavedJson[], after: readonly SavedJson[], job: SavedJson): SavedJson {
  if (job.kind !== 'refit') return job;
  const itemDefs = new Map(before.map((it) => [it.id as string, defOf(it) ?? ''] as const));
  const moved = new Map(after.filter((it, i) => it.x !== before[i].x).map((it) => [it.id as string, it] as const));
  for (const s of [job, ...(job.queue as SavedJson[])]) {
    const pickup = s.pickup as SavedJson | null;
    if (pickup) itemDefs.set(pickup.itemId as string, defs.get(pickup.partId as string) ?? '');
  }
  const head = mapStep(edge, defs, moved, itemDefs, job);
  return { ...job, moves: head.moves, pickup: head.pickup, queue: (job.queue as SavedJson[]).map((s) => mapStep(edge, defs, moved, itemDefs, s)) };
}

function slideVehicle(defs: ReadonlyMap<string, string>, v: SavedJson): SavedJson {
  const edge = edgeOf(v.chassisId as string);
  if (edge === null) return v;
  const before = v.items as SavedJson[];
  const items = slidRams(edge, before);
  const job = v.job === null || v.job === undefined ? v.job : mapJob(edge, defs, before, items, v.job as SavedJson);
  return { ...v, items, ...(job === undefined ? {} : { job }) };
}

export function withFourCellRams(world: SavedJson): SavedJson {
  const defs = partDefsOf(world, new Map());
  return { ...world, vehicles: (world.vehicles as SavedJson[]).map((v) => slideVehicle(defs, v)) };
}
