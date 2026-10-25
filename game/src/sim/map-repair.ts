import { chassisDef } from '../data/chassis';
import { RULES } from '../data/rules';
import { STORY_WRECKS } from '../data/salvage';
import { atlasOf, type Atlas } from './atlas';
import { claimPartHeld } from './claims';
import { freeSpotNear, spotNear } from './free-spot';
import { clearOfDecks, clearOfSites, findRoadWreckSpot, isBakedObstacle, mapObstacles, overlapsAny, propReach, touchesObstacle } from './mapgen';
import { finishContract, type Contract } from './market';
import { reviseMemories } from './memory';
import { isRoadWreck, isStockGoal, isStoryWreck, liveClaims, oldSpotOf, oldSpotPicks, oldStockId, rollStock, type ClaimContract, type OldSpotPick } from './salvage';
import { modeRules } from './settings';
import { isFree } from './spawn';
import { hollowBays, hollowObstaclesFor, isHollowObstacle } from './hollow-layout';
import { isSunwardMember } from './sunward';
import { surveySites } from './survey';
import { isLootSpot, spotTable } from './territory';
import type { BakedMap } from './terrain';
import type { Job, NpcActivity, NpcBrain, NpcState, RefitPickup, Obstacle, Player, SalvageStock, StateData, SunwardFacts, SunwardHunt, SunwardNight, Vehicle, World } from './types';
import { dist, type Vec } from './vec';

export type SavedBroken = { id: string; turn: number };
export type SavedMapWorld = Omit<World, 'terrain' | 'broken'> & { broken: SavedBroken[] };

type Move = 'keep' | 'shift' | 'rebuild' | 'drop';
type Table<T> = { [K in keyof T]-?: Move };
type Ctx = { ratio: number; fromSize: number; toSize: number; playerId: string; self: string | null };
type Handlers<T, M extends Table<T>> = { [K in keyof T as M[K] extends 'shift' | 'drop' ? K : never]-?: (value: T[K], ctx: Ctx) => T[K] };

export const REBAKE_MOVE = {
  seed: 'keep',
  rngState: 'keep',
  marketRng: 'keep',
  nameRng: 'keep',
  searchRng: 'keep',
  turn: 'keep',
  nextId: 'keep',
  setup: 'keep',
  spawnTimer: 'keep',
  roadNews: 'keep',
  chaosHighway: 'keep',
  size: 'rebuild',
  mapHash: 'rebuild',
  terrain: 'rebuild',
  obstacles: 'rebuild',
  broken: 'rebuild',
  salvage: 'rebuild',
  vehicles: 'shift',
  player: 'shift',
  shops: 'shift',
  states: 'shift',
  sunward: 'shift',
  crimes: 'shift',
  events: 'drop',
  removed: 'drop',
  weather: 'drop',
  craters: 'drop',
  dustClouds: 'drop',
  smoke: 'drop',
  fields: 'drop',
  flares: 'drop',
  lines: 'drop',
} as const satisfies Table<World>;

const VEHICLE_MOVE = {
  id: 'keep',
  faction: 'keep',
  chassisId: 'keep',
  items: 'keep',
  pos: 'shift',
  heading: 'keep',
  bend: 'keep',
  speed: 'keep',
  stormExposure: 'drop',
  strandedTurns: 'keep',
  strandedAt: 'shift',
  stalledUntil: 'keep',
  order: 'shift',
  direct: 'keep',
  weaponOrders: 'drop',
  utilityOrders: 'drop',
  shutDown: 'keep',
  trail: 'drop',
  brain: 'shift',
  resources: 'keep',
  lastHitBy: 'keep',
  job: 'keep',
  defeat: 'keep',
} as const satisfies Table<Vehicle>;

const BRAIN_MOVE = {
  templateId: 'keep',
  driver: 'keep',
  traits: 'keep',
  personality: 'keep',
  goals: 'shift',
  noticed: 'keep',
  tracks: 'shift',
  hurt: 'keep',
  fullAt: 'keep',
  unfit: 'keep',
  attackers: 'keep',
  goal: 'drop',
  home: 'shift',
  stepIndex: 'keep',
  lastPos: 'drop',
  stalled: 'drop',
  stuck: 'drop',
  progress: 'drop',
  recovery: 'drop',
  recoveryGoal: 'drop',
  ramChoice: 'keep',
  ramTarget: 'keep',
  fightTurn: 'keep',
  targetSeen: 'shift',
  whim: 'keep',
  farRoute: 'drop',
  musteredAt: 'keep',
  memories: 'shift',
} as const satisfies Table<NpcBrain>;

const ACTIVITY_MOVE = {
  kind: 'keep',
  targetId: 'keep',
  destination: 'shift',
  phase: 'keep',
  reason: 'keep',
  purchase: 'keep',
  shipment: 'keep',
  perceived: 'keep',
  worn: 'keep',
  demands: 'keep',
  until: 'keep',
  watchUntil: 'keep',
  leg: 'shift',
  claim: 'keep',
  left: 'keep',
  posted: 'keep',
  asked: 'keep',
  heard: 'shift',
} as const satisfies Table<NpcActivity>;

const PLAYER_MOVE = {
  vehicleId: 'keep',
  money: 'keep',
  standing: 'keep',
  deeds: 'keep',
  xp: 'keep',
  ranks: 'keep',
  xpToday: 'keep',
  xpDay: 'keep',
  repeats: 'keep',
  xpBySource: 'keep',
  perks: 'keep',
  paint: 'keep',
  health: 'keep',
  fuel: 'keep',
  supplies: 'keep',
  autoFire: 'keep',
  autoRepair: 'keep',
  townPatched: 'keep',
  engineHeat: 'keep',
  overdrive: 'keep',
  headlights: 'keep',
  discovered: 'keep',
  scavenged: 'keep',
  storage: 'keep',
  contracts: 'shift',
  pastContracts: 'keep',
  costBasis: 'keep',
  knockouts: 'keep',
  state: 'keep',
  knockoutTurns: 'keep',
  god: 'keep',
  fullLog: 'keep',
  frozen: 'keep',
  beacon: 'keep',
  call: 'keep',
  talked: 'keep',
  quests: 'keep',
  explored: 'shift',
  visible: 'drop',
  contacts: 'drop',
  clouds: 'drop',
  marked: 'keep',
  rumored: 'keep',
  notes: 'keep',
  hostilesSeen: 'keep',
  encounters: 'keep',
} as const satisfies Table<Player>;

const STATE_MOVE = {
  id: 'keep',
  kind: 'keep',
  holder: 'keep',
  other: 'keep',
  turnsLeft: 'keep',
  born: 'keep',
  data: 'shift',
} as const satisfies Table<NpcState>;

const SUNWARD_MOVE = { collapsed: 'keep', night: 'shift', lastHunt: 'keep' } as const satisfies Table<SunwardFacts>;

const NIGHT_MOVE = {
  dusk: 'keep',
  roster: 'keep',
  beaten: 'keep',
  calls: 'keep',
  hunt: 'shift',
  shouted: 'keep',
  offered: 'keep',
} as const satisfies Table<SunwardNight>;

const HUNT_MOVE = { party: 'keep', grounds: 'shift', prey: 'keep', over: 'keep', breaks: 'keep' } as const satisfies Table<SunwardHunt>;

function at(ctx: Ctx, p: Vec): Vec {
  return { x: p.x * ctx.ratio, y: p.y * ctx.ratio };
}

function applyMoves<T extends object, M extends Table<T>>(target: T, table: M, handlers: Handlers<T, M>, ctx: Ctx): void {
  const record = target as Record<string, unknown>;
  const run = handlers as unknown as Record<string, (value: unknown, ctx: Ctx) => unknown>;
  for (const [key, move] of Object.entries(table)) {
    if (move !== 'shift' && move !== 'drop') continue;
    const next = run[key](record[key], ctx);
    if (next === undefined) delete record[key];
    else record[key] = next;
  }
}

const VEHICLE_HANDLERS: Handlers<Vehicle, typeof VEHICLE_MOVE> = {
  pos: (pos, ctx) => at(ctx, pos),
  strandedAt: (anchor, ctx) => anchor && at(ctx, anchor),
  order: (order, ctx) => {
    if (order === null || ctx.self !== ctx.playerId) return null;
    return order.kind === 'brake' ? order : { ...order, dest: at(ctx, order.dest) };
  },
  stormExposure: () => ({}),
  weaponOrders: () => ({}),
  utilityOrders: () => ({}),
  trail: () => [],
  brain: (brain, ctx) => {
    if (brain === null) return null;
    applyMoves(brain, BRAIN_MOVE, BRAIN_HANDLERS, ctx);
    return brain;
  },
};

const BRAIN_HANDLERS: Handlers<NpcBrain, typeof BRAIN_MOVE> = {
  goals: (goals, ctx) => goals.map((goal) => shiftActivity(goal, ctx)),
  tracks: (tracks, ctx) => Object.fromEntries(Object.entries(tracks).map(([id, track]) => [id, { ...track, at: at(ctx, track.at) }])),
  goal: () => null,
  home: (home, ctx) => at(ctx, home),
  lastPos: () => undefined,
  stalled: () => undefined,
  stuck: () => undefined,
  progress: () => undefined,
  recovery: () => undefined,
  recoveryGoal: () => undefined,
  targetSeen: (seen, ctx) => seen && { ...seen, pos: at(ctx, seen.pos) },
  farRoute: () => undefined,
  memories: (memories, ctx) => memories.map((m) => (m.fact.kind === 'sighting' || m.fact.kind === 'witnessed' ? { ...m, fact: { ...m.fact, at: at(ctx, m.fact.at) } } : m)),
};

const ACTIVITY_HANDLERS: Handlers<NpcActivity, typeof ACTIVITY_MOVE> = {
  destination: (destination, ctx) => destination && at(ctx, destination),
  leg: (leg, ctx) => leg && { ...leg, from: at(ctx, leg.from) },
  heard: (heard, ctx) => heard && at(ctx, heard),
};

function shiftActivity(goal: NpcActivity, ctx: Ctx): NpcActivity {
  const moved = { ...goal };
  applyMoves(moved, ACTIVITY_MOVE, ACTIVITY_HANDLERS, ctx);
  return moved;
}

const CONTRACT_SHIFT: { [K in Contract['kind']]: (c: Extract<Contract, { kind: K }>, ctx: Ctx) => Contract } = {
  haul: (c) => c,
  procure: (c) => c,
  survey: (c) => c,
  claim: (c, ctx) => ({ ...c, at: at(ctx, c.at), leads: c.leads.map((lead) => ({ ...lead, from: at(ctx, lead.from) })) }),
  escort: (c, ctx) => ({ ...c, seen: c.seen && { ...at(ctx, c.seen), turn: c.seen.turn } }),
  rescue: (c, ctx) => ({ ...c, area: at(ctx, c.area) }),
  search: (c, ctx) => ({ ...c, lead: { ...c.lead, at: at(ctx, c.lead.at) } }),
};

function shiftContract(c: Contract, ctx: Ctx): Contract {
  return (CONTRACT_SHIFT[c.kind] as (c: Contract, ctx: Ctx) => Contract)(c, ctx);
}

const STATE_SHIFT: { [K in StateData['kind']]: (d: Extract<StateData, { kind: K }>, ctx: Ctx) => StateData } = {
  tow: (d) => d,
  feud: (d) => d,
  towPromise: (d) => d,
  plea: (d) => d,
  escort: (d) => d,
  crew: (d) => d,
  hire: (d) => d,
  patch: (d) => d,
  strayFire: (d) => d,
  aid: (d) => d,
  lootWarning: (d) => d,
  none: (d) => d,
  offering: (d, ctx) => ({ ...d, core: at(ctx, d.core) }),
  drag: (d, ctx) => ({ ...d, drop: at(ctx, d.drop) }),
  bountyStop: (d) => d,
};

function shiftStateData(data: StateData, ctx: Ctx): StateData {
  return (STATE_SHIFT[data.kind] as (d: StateData, ctx: Ctx) => StateData)(data, ctx);
}

const STATE_HANDLERS: Handlers<NpcState, typeof STATE_MOVE> = {
  data: (data, ctx) => shiftStateData(data, ctx),
};

const HUNT_HANDLERS: Handlers<SunwardHunt, typeof HUNT_MOVE> = {
  grounds: (grounds, ctx) => grounds.map((ground) => at(ctx, ground)),
};

const NIGHT_HANDLERS: Handlers<SunwardNight, typeof NIGHT_MOVE> = {
  hunt: (hunt, ctx) => {
    if (hunt === null) return null;
    const moved = { ...hunt };
    applyMoves(moved, HUNT_MOVE, HUNT_HANDLERS, ctx);
    return moved;
  },
};

const SUNWARD_HANDLERS: Handlers<SunwardFacts, typeof SUNWARD_MOVE> = {
  night: (night, ctx) => {
    if (night === null) return null;
    const moved = { ...night };
    applyMoves(moved, NIGHT_MOVE, NIGHT_HANDLERS, ctx);
    return moved;
  },
};

function resampled(explored: Uint8Array, from: number, to: number): Uint8Array {
  if (explored.length !== from * from) throw new Error(`Explored holds ${explored.length} tiles, not ${from} by ${from}`);
  if (from === to) return explored;
  const out = new Uint8Array(to * to);
  for (let y = 0; y < to; y++) {
    const row = Math.min(from - 1, Math.floor((y * from) / to)) * from;
    for (let x = 0; x < to; x++) out[y * to + x] = explored[row + Math.min(from - 1, Math.floor((x * from) / to))];
  }
  return out;
}

const PLAYER_HANDLERS: Handlers<Player, typeof PLAYER_MOVE> = {
  contracts: (contracts, ctx) => contracts.map((c) => shiftContract(c, ctx)),
  explored: (explored, ctx) => resampled(explored, ctx.fromSize, ctx.toSize),
  visible: () => [],
  contacts: () => [],
  clouds: () => [],
};

const WORLD_HANDLERS: Handlers<World, typeof REBAKE_MOVE> = {
  vehicles: (vehicles, ctx) => {
    for (const v of vehicles) applyMoves(v, VEHICLE_MOVE, VEHICLE_HANDLERS, { ...ctx, self: v.id });
    return vehicles;
  },
  player: (player, ctx) => {
    applyMoves(player, PLAYER_MOVE, PLAYER_HANDLERS, ctx);
    return player;
  },
  shops: (shops, ctx) => {
    for (const shop of Object.values(shops)) shop.contracts = shop.contracts.map((c) => shiftContract(c, ctx));
    return shops;
  },
  states: (states, ctx) => {
    for (const state of states) applyMoves(state, STATE_MOVE, STATE_HANDLERS, ctx);
    return states;
  },
  sunward: (sunward, ctx) => {
    if (sunward === null) return null;
    applyMoves(sunward, SUNWARD_MOVE, SUNWARD_HANDLERS, ctx);
    return sunward;
  },
  crimes: (crimes, ctx) => crimes.map((c) => ({ ...c, at: at(ctx, c.at), lead: { ...c.lead, at: at(ctx, c.lead.at) } })),
  events: () => [],
  removed: () => [],
  weather: () => [],
  craters: () => [],
  dustClouds: () => [],
  smoke: () => [],
  fields: () => [],
  flares: () => [],
  lines: () => [],
};

export function repairMap(saved: SavedMapWorld, map: BakedMap): World {
  const world: World = { ...structuredClone(saved), terrain: map.terrain, broken: [] };
  const ctx: Ctx = { ratio: map.terrain.size / saved.size, fromSize: saved.size, toSize: map.terrain.size, playerId: saved.player.vehicleId, self: null };
  const savedObstacles = world.obstacles;
  const savedSalvage = world.salvage;
  applyMoves(world, REBAKE_MOVE, WORLD_HANDLERS, ctx);
  world.size = ctx.toSize;
  world.mapHash = map.hash;
  const placed = rebuiltObstacles(world, savedObstacles, map, ctx);
  world.obstacles = placed.obstacles;
  const stocks = rebuiltSalvage(world, savedSalvage, placed.fate, map, ctx);
  world.salvage = stocks.salvage;
  purgeDropped(world, stocks.dropped, map);
  snapSunwardHomes(world);
  return world;
}

export function fitBake(world: World, map: BakedMap): void {
  const picks = new Map((modeRules(world).looting ? oldSpotPicks(map) : []).map((p) => [oldStockId(p), p]));
  const dropped = new Set(world.salvage.filter((s) => oldSpotOf(s) && sameProp(s, s.pos, picks.get(s.id)) === null).map((s) => s.id));
  world.salvage = world.salvage.filter((s) => !dropped.has(s.id));
  purgeDropped(world, dropped, map);
}

type Fate = Map<string, Obstacle | null>;

function rebuiltObstacles(world: World, saved: Obstacle[], map: BakedMap, ctx: Ctx): { obstacles: Obstacle[]; fate: Fate } {
  const atlas = atlasOf(map.terrain);
  const obstacles = [...mapObstacles(map), ...hollowObstaclesFor(world)];
  const fate: Fate = new Map();
  for (const o of saved.filter((x) => !isDerived(x))) {
    const placed = placedObstacle(world, obstacles, atlas, o, ctx);
    fate.set(o.id, placed);
    if (placed) obstacles.push(placed);
  }
  return { obstacles, fate };
}

function isDerived(o: Obstacle): boolean {
  return isBakedObstacle(o) || isHollowObstacle(o) || o.kind === 'site';
}

function placedObstacle(world: World, obstacles: Obstacle[], atlas: Atlas, o: Obstacle, ctx: Ctx): Obstacle | null {
  if (isStoryWreck(o)) return storyObstacle(o.id);
  const valid = (pos: Vec) => !overlapsAny(obstacles, pos, o.r) && clearOfSites(atlas, pos, o.r) && clearOfDecks(atlas, pos, o.r);
  return nudged(o, ctx, valid) ?? (isRoadWreck(o) ? relaidRoadWreck(world, obstacles, o) : null);
}

function relaidRoadWreck(world: World, obstacles: Obstacle[], o: Obstacle): Obstacle {
  return { id: o.id, ...findRoadWreckSpot(world, obstacles, () => true), kind: 'wreck' };
}

function storyObstacle(id: string): Obstacle | null {
  const wreck = STORY_WRECKS.find((w) => w.id === id);
  return wreck ? { id, pos: { ...wreck.pos }, r: wreck.r, kind: 'wreck', hulk: { chassisId: wreck.chassisId, yaw: wreck.yaw } } : null;
}

function nudged(o: Obstacle, ctx: Ctx, valid: (pos: Vec) => boolean): Obstacle | null {
  const pos = spotNear(at(ctx, o.pos), valid);
  return pos && { ...o, pos };
}

type Props = { picks: Map<string, OldSpotPick>; spots: Map<string, Obstacle> };

function rebuiltSalvage(world: World, saved: SalvageStock[], fate: Fate, map: BakedMap, ctx: Ctx): { salvage: SalvageStock[]; dropped: Set<string> } {
  const looting = modeRules(world).looting;
  const props: Props = {
    picks: new Map((looting ? oldSpotPicks(map) : []).map((p) => [oldStockId(p), p])),
    spots: new Map(world.obstacles.filter((o) => looting && isLootSpot(o)).map((o) => [o.id, o])),
  };
  const kept = saved.map((stock) => ({ stock, kept: keptStock(stock, props, fate, ctx) }));
  const salvage = kept.flatMap((k) => (k.kept ? [k.kept] : []));
  const dropped = new Set(kept.filter((k) => k.kept === null).map((k) => k.stock.id));
  return { salvage: [...salvage, ...rolledMissing(world, props, new Set(salvage.map((s) => s.id)))], dropped };
}

function rolledMissing(world: World, props: Props, held: Set<string>): SalvageStock[] {
  return [...props.spots.values()].filter((o) => !held.has(o.id)).map((o) => rollStock(world, spotTable(o), o.id, o.pos, propReach(o)));
}

function keptStock(stock: SalvageStock, props: Props, fate: Fate, ctx: Ctx): SalvageStock | null {
  const pos = at(ctx, stock.pos);
  if (oldSpotOf(stock)) return sameProp(stock, pos, props.picks.get(stock.id));
  const spot = props.spots.get(stock.id);
  if (spot) return sameProp(stock, pos, { pos: spot.pos, reach: propReach(spot) });
  return keptLoose(stock, pos, fate);
}

function keptLoose(stock: SalvageStock, pos: Vec, fate: Fate): SalvageStock | null {
  if (isBakedObstacle({ id: stock.id, pos, r: stock.radius, kind: 'rock' })) return null;
  if (isStoryWreck(stock)) return storyStock(stock);
  if (!fate.has(stock.id)) return { ...stock, pos };
  const obstacle = fate.get(stock.id);
  return obstacle ? { ...stock, pos: { ...obstacle.pos } } : null;
}

function sameProp(stock: SalvageStock, scaled: Vec, prop: { pos: Vec; reach: number } | undefined): SalvageStock | null {
  if (prop === undefined || dist(scaled, prop.pos) > prop.reach) return null;
  return { ...stock, pos: { ...prop.pos }, radius: prop.reach };
}

function storyStock(stock: SalvageStock): SalvageStock | null {
  const wreck = STORY_WRECKS.find((w) => w.id === stock.id);
  return wreck ? { ...stock, pos: { ...wreck.pos }, radius: wreck.r * RULES.wreckRadiusScale } : null;
}

function lapses(c: Contract, dropped: Set<string>): c is ClaimContract {
  return c.kind === 'claim' && dropped.has(c.stockId);
}

function fitSurveyPoints(contracts: Contract[], sites: Set<string>): void {
  for (const c of contracts) if (c.kind === 'survey') c.points = c.points.filter((p) => sites.has(p.site));
}

function cancelContracts(world: World, dropped: Set<string>, sites: Set<string>): Set<string> {
  fitSurveyPoints([...world.player.contracts, ...Object.values(world.shops).flatMap((s) => s.contracts)], sites);
  for (const shop of Object.values(world.shops)) shop.contracts = shop.contracts.filter((c) => c.kind !== 'survey' || c.points.length > 0);
  const cancelled = new Set<string>();
  for (const c of world.player.contracts.filter((x) => lapses(x, dropped) && claimPartHeld(world, x) !== 'player')) {
    cancelled.add(c.id);
    finishContract(world, c, 'lapsed');
  }
  for (const shop of Object.values(world.shops)) {
    for (const c of shop.contracts.filter((x) => lapses(x, dropped))) cancelled.add(c.id);
    shop.contracts = shop.contracts.filter((c) => !cancelled.has(c.id));
  }
  return cancelled;
}

function namesDropped(goal: NpcActivity, dropped: Set<string>, cancelled: Set<string>): boolean {
  if (goal.claim !== undefined && cancelled.has(goal.claim)) return true;
  return isStockGoal(goal) && [goal.targetId, ...(goal.left ?? [])].some((id) => id !== null && dropped.has(id));
}

function jobLapses(job: Job | null, dropped: Set<string>, cancelled: Set<string>, sites: Set<string>): boolean {
  if (job === null) return false;
  if (job.kind === 'search') return dropped.has(job.stockId);
  if (job.kind === 'survey') return cancelled.has(job.contractId) || !sites.has(job.site);
  return job.kind === 'refit' && pickupLapses(job.pickup, dropped);
}

function pickupLapses(pickup: RefitPickup | null, dropped: Set<string>): boolean {
  return pickup?.from === 'stock' && dropped.has(pickup.stockId);
}

function purgeDropped(world: World, dropped: Set<string>, map: BakedMap): void {
  const sites = new Set(surveySites(map).map((s) => s.id));
  const cancelled = cancelContracts(world, dropped, sites);
  for (const claim of liveClaims(world)) {
    const stock = world.salvage.find((s) => s.id === claim.stockId);
    if (stock) claim.at = { ...stock.pos };
  }
  world.player.scavenged = world.player.scavenged.filter((id) => !dropped.has(id));
  world.player.rumored = world.player.rumored.filter((id) => !dropped.has(id));
  world.states = world.states.filter((s) => s.data.kind !== 'lootWarning' || !dropped.has(s.data.targetId));
  for (const v of world.vehicles) {
    if (jobLapses(v.job, dropped, cancelled, sites)) v.job = null;
    if (!v.brain) continue;
    v.brain.goals = v.brain.goals.filter((goal) => !namesDropped(goal, dropped, cancelled));
    reviseMemories(v, (m) => (m.fact.kind === 'stripped' && dropped.has(m.fact.stock) ? null : m));
  }
}


function snapSunwardHomes(world: World): void {
  const bays = hollowBays();
  for (const v of world.vehicles.filter(isSunwardMember)) {
    const home = v.brain!.home;
    v.brain!.home = bays.reduce((best, bay) => (dist(bay, home) < dist(best, home) ? bay : best));
  }
}

export function settleTrucks(world: World): void {
  settleWhere(world, () => true);
}

export function settleOffHollow(world: World): void {
  const hollow = world.obstacles.filter(isHollowObstacle);
  settleWhere(world, (v) => hollow.some((o) => touchesObstacle(o, world.terrain, v.pos, chassisDef(v.chassisId).radius)));
}

function settleWhere(world: World, needs: (v: Vehicle) => boolean): void {
  const player = world.player.vehicleId;
  for (const v of [...world.vehicles.filter((x) => x.id !== player), ...world.vehicles.filter((x) => x.id === player)]) {
    const radius = chassisDef(v.chassisId).radius;
    if (!needs(v) || isFree(world, v.pos, radius, v.id)) continue;
    const spot = freeSpotNear(world, v.pos, radius, v.id);
    if (!spot) throw new Error(`No free spot near ${v.pos.x.toFixed(1)}, ${v.pos.y.toFixed(1)} for ${v.id} on map ${world.mapHash}`);
    v.pos = spot;
    if (v.strandedAt) v.strandedAt = { ...spot };
    v.speed = 0;
    v.order = null;
  }
}
