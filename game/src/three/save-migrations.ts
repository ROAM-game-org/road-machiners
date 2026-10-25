
import { CORES_2_1, CORES_2_2, LAYOUTS_2_2 } from './save-layouts-2-2';
import { GOAL_REASONS_2_19, LINES_2_19, WARN_LINES_2_19 } from './save-text-2-19';
import { LAYOUTS_2_34 } from './save-layouts-2-34';

import { withBrakeRod_78_79, withCrewsAndHires_76_77, withFactions_70_71, withHattieMet_77_78, withPlannedGroups_73_74, withRunWait_72_73, withHeardCentres_81_82, withShortRoadScenes_90_91, withChaosHighwayIntro_91_92, withPastContracts_92_93, withoutVarga_79_80, withStapleRestock_83_84, withSunward_84_85, withHollowFort_85_86, withOfferedNight_86_87, withFollowHeadings_87_88, withKovacMounts_88_89, withTractorPivot_93_94, withProgressAnchor_65_66, withDutyLegs_59_60, withEncounters_64_65, withStandardPaint_94_95, withThreeColorPaint_95_96, withMutedPaint_96_97, withOddFronts_102_103, withoutFetchAndBounty_103_104 } from './save-steps-late';

export type SavedJson = Record<string, unknown>;

export const SAVE_MAJOR = 2;

const SIZES_2_1: Record<string, readonly [number, number]> = {
  shotgun: [1, 2],
  longRifle: [1, 2],
  flamer: [1, 2],
  pneumobolter: [2, 2],
  slugCannon: [1, 2],
  heavyMg: [1, 2],
  cannon: [2, 2],
  amRifle: [1, 3],
  autocannon: [2, 2],
  recoilless: [1, 3],
  battleRifle: [1, 3],
  gatling: [2, 2],
  rocketRack: [2, 2],
  sniperCannon: [2, 3],
  grenadeLauncher: [2, 2],
  tankGun: [2, 3],
  flechette: [2, 2],
  stockEngine: [2, 2],
  tunedEngine: [2, 2],
  flatFour: [2, 2],
  workhorseDiesel: [2, 2],
  racingV6: [2, 2],
  heavyDiesel: [2, 2],
  turbine: [2, 2],
  plates: [1, 3],
  cage: [1, 2],
  ram: [3, 1],
  scrapPanels: [1, 2],
  ceramicPlates: [1, 2],
  spacedArmor: [1, 4],
  reinforcedCage: [1, 3],
  plowRam: [3, 1],
  rack: [2, 1],
  trailerBox: [2, 2],
  flatbed: [2, 1],
  lightFrame: [2, 2],
  enclosedFrame: [2, 2],
  heavyFrame: [2, 2],
};

type Cell = { x: number; y: number };
type Item = SavedJson & { x: number; y: number; rot: number; part?: SavedJson & { defId: string }; good?: string };
type Spot = { x: number; y: number; rot: number };
type Player = SavedJson & { vehicleId: string; storage: SavedJson[]; money: number };

const GOOD_VALUES_2_1: Record<string, number> = {
  scrap: 19, salt: 26, meds: 70, grain: 21, textiles: 35, tools: 110, batteries: 76, electronics: 155, parts: 20, fuelDrums: 28, water: 18,
};

const key = (c: Cell) => `${c.x},${c.y}`;

function cellsAt(item: Item, spot: Spot): Cell[] {
  const [w, h] = (item.part && SIZES_2_1[item.part.defId]) || [1, 1];
  const [across, along] = spot.rot === 1 ? [h, w] : [w, h];
  return Array.from({ length: across * along }, (_, i) => ({ x: spot.x + (i % across), y: spot.y + Math.floor(i / across) }));
}

const cellsOf = (item: Item) => cellsAt(item, item);

function nearestSpot(item: Item, free: Set<string>): Spot | null {
  const anchors = [...free].map((k) => ({ x: Number(k.split(',')[0]), y: Number(k.split(',')[1]) }));
  const dist = (c: Cell) => (c.x - item.x) ** 2 + (c.y - item.y) ** 2;
  anchors.sort((p, q) => dist(p) - dist(q) || p.y - q.y || p.x - q.x);
  for (const anchor of anchors) {
    for (const rot of [item.rot, 1 - item.rot]) {
      const spot = { ...anchor, rot };
      if (cellsAt(item, spot).every((c) => free.has(key(c)))) return spot;
    }
  }
  return null;
}

const isWheel = (item: Item) => item.part?.defId.startsWith('wheel') ?? false;

function markedCells(layout: readonly string[], mark: string): Set<string> {
  return new Set(layout.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === mark ? [key({ x, y })] : []))));
}

function relaidCores(vehicle: SavedJson): Map<Item, Item> {
  const before = CORES_2_1[vehicle.chassisId as string];
  const after = CORES_2_2[vehicle.chassisId as string];
  const moved = new Map<Item, Item>();
  for (const item of vehicle.items as Item[]) {
    const index = before.findIndex((c) => c.defId === item.part?.defId && c.x === item.x && c.y === item.y);
    if (index < 0) continue;
    const next = after[index];
    moved.set(item, { ...item, x: next.x, y: next.y, rot: next.rot, part: { ...item.part!, defId: next.defId } });
  }
  return moved;
}

function refund(item: Item, player: Player | null): void {
  if (!player) return;
  if (item.part) player.storage.push(item.part);
  else player.money += GOOD_VALUES_2_1[item.good ?? ''] ?? 0;
}

function rehome(item: Item, free: Set<string>, player: Player | null): Item | null {
  const spot = nearestSpot(item, free);
  if (!spot) {
    refund(item, player);
    return null;
  }
  for (const c of cellsAt(item, spot)) free.delete(key(c));
  return { ...item, ...spot };
}

function relayVehicle(vehicle: SavedJson, player: Player | null): SavedJson {
  const layout = LAYOUTS_2_2[vehicle.chassisId as string];
  if (!layout) return vehicle;
  const moved = relaidCores(vehicle);
  const built = markedCells(layout, 'X');
  const others = (vehicle.items as Item[]).filter((item) => !moved.has(item));
  const stays = others.filter((item) => isWheel(item) || !cellsOf(item).some((c) => built.has(key(c))));
  const taken = new Set([...stays, ...moved.values()].flatMap((item) => cellsOf(item).map(key)));
  const free = new Set([...markedCells(layout, 'D')].filter((k) => !taken.has(k)));
  const items = (vehicle.items as Item[]).flatMap((item) => moved.get(item) ?? (stays.includes(item) ? [item] : []));
  const homed = others.filter((item) => !stays.includes(item)).map((item) => rehome(item, free, player));
  return { ...vehicle, items: [...items, ...homed.filter((item) => item !== null)], job: withoutRefit(vehicle.job) };
}

function withoutRefit(job: unknown): unknown {
  return (job as SavedJson | null)?.kind === 'refit' ? null : job;
}

function packExplored_3_4(list: unknown[]): string {
  const bytes = new Uint8Array(Math.ceil(list.length / 8));
  list.forEach((value, i) => {
    if (value !== 0 && value !== 1) throw new Error(`Explored tile ${i} is ${String(value)}, not 0 or 1`);
    bytes[i >> 3] |= (value as number) << (i & 7);
  });
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const HANDOVER_TURNS_5_6 = 1;
const CAB_IDS_6_7 = ['cab', 'cabPickup', 'cabHardtop'];

function withGaveUp_6_7(vehicle: SavedJson): SavedJson {
  const defeat = vehicle.defeat as SavedJson | undefined;
  if (!defeat) return vehicle;
  const cab = (vehicle.items as Item[]).find((item) => CAB_IDS_6_7.includes(item.part?.defId ?? ''));
  return { ...vehicle, defeat: { ...defeat, gaveUp: defeat.phase === 'out' && ((cab?.part?.hp as number | undefined) ?? 0) > 0 } };
}

const RETIRED_STOCK_6_25: ReadonlySet<string> = new Set(['fallen-sun', 'orchard']);
const RETIRED_STOCK_25_61: ReadonlySet<string> = new Set(['glass-flats']);

function withoutRetiredStock(world: SavedJson, retired: ReadonlySet<string>): SavedJson {
  const idle = (v: SavedJson): SavedJson => (retired.has((v.job as SavedJson | null | undefined)?.stockId as string) ? { ...v, job: null } : v);
  const player = world.player as SavedJson;
  return {
    ...world,
    salvage: (world.salvage as SavedJson[]).filter((stock) => !retired.has(stock.id as string)),
    player: { ...player, scavenged: (player.scavenged as string[]).filter((id) => !retired.has(id)) },
    vehicles: (world.vehicles as SavedJson[]).map(idle),
  };
}

const XP_TO_REACH_9_10 = [0, 200, 600, 1200, 2000, 3000];

function pooledSkills_9_10(skills: Record<string, number>): { xp: number; ranks: Record<string, number> } {
  let xp = 0;
  const ranks: Record<string, number> = {};
  for (const [skill, total] of Object.entries(skills)) {
    let level = 0;
    while (level < XP_TO_REACH_9_10.length - 1 && total >= XP_TO_REACH_9_10[level + 1]) level++;
    ranks[skill] = level;
    xp += total - XP_TO_REACH_9_10[level];
  }
  return { xp, ranks };
}

const STORM_FADE_TURNS_16_17 = 30;

function withStormBorn_16_17(world: SavedJson): SavedJson {
  const born = (world.turn as number) - STORM_FADE_TURNS_16_17;
  const dated = (e: SavedJson): SavedJson => (e.kind === 'storm' ? { ...e, born } : e);
  return { ...world, weather: (world.weather as SavedJson[]).map(dated) };
}

const STORM_EDGE_17_18 = 25;
const STORM_FADE_TURNS_17_18 = 30;

function settledShare_17_18(turn: number, storm: SavedJson, pos: { x: number; y: number }): number {
  const centre = storm.pos as { x: number; y: number };
  const edge = Math.min(1, ((storm.radius as number) - Math.hypot(pos.x - centre.x, pos.y - centre.y)) / STORM_EDGE_17_18);
  if (edge <= 0) return 0;
  const strength = Math.min(1, (turn - (storm.born as number) + 1) / STORM_FADE_TURNS_17_18, (storm.turnsLeft as number) / STORM_FADE_TURNS_17_18);
  return edge * strength;
}

function withStormExposure_17_18(world: SavedJson): SavedJson {
  const storms = (world.weather as SavedJson[]).filter((e) => e.kind === 'storm');
  const exposed = (v: SavedJson): SavedJson => {
    const stormExposure: Record<string, number> = {};
    for (const s of storms) {
      const share = settledShare_17_18(world.turn as number, s, v.pos as { x: number; y: number });
      if (share > 0) stormExposure[s.id as string] = share;
    }
    return { ...v, stormExposure };
  };
  return { ...world, vehicles: (world.vehicles as SavedJson[]).map(exposed) };
}

function withMemories_11_12(world: SavedJson): SavedJson {
  const shops = world.shops as Record<string, SavedJson>;
  const turn = world.turn as number;
  const remembering = (v: SavedJson): SavedJson => {
    if (!v.brain) return v;
    const { lastTown, ...brain } = v.brain as SavedJson;
    const shop = typeof lastTown === 'string' ? shops[lastTown] : undefined;
    const memories = shop ? [{ turn, fact: { kind: 'prices', shop: lastTown, pressure: { ...(shop.pressure as SavedJson) } } }] : [];
    return { ...v, brain: { ...brain, memories } };
  };
  return { ...world, vehicles: (world.vehicles as SavedJson[]).map(remembering) };
}

function withPatchParts_13_14(world: SavedJson): SavedJson {
  const vehicles = world.vehicles as SavedJson[];
  const brokenIds = (id: string): string[] => {
    const client = vehicles.find((v) => v.id === id);
    const items = client ? (client.items as SavedJson[]) : [];
    return items.flatMap((item) => (item.kind === 'part' && (item.part as SavedJson).hp === 0 ? [(item.part as SavedJson).id as string] : []));
  };
  const recording = (s: SavedJson): SavedJson => {
    const data = s.data as SavedJson;
    return data.kind === 'patch' ? { ...s, data: { ...data, partIds: brokenIds(s.other as string) } } : s;
  };
  return { ...world, states: (world.states as SavedJson[]).map(recording) };
}

function withRouteStyle_18_19(world: SavedJson): SavedJson {
  const styled = (v: SavedJson): SavedJson => {
    const brain = v.brain as SavedJson | null;
    if (!brain?.farRoute) return v;
    return { ...v, brain: { ...brain, farRoute: { ...(brain.farRoute as SavedJson), offRoad: false } } };
  };
  return { ...world, vehicles: (world.vehicles as SavedJson[]).map(styled) };
}

function withoutGuards_19_20(world: SavedJson): SavedJson {
  const uncredited = (v: SavedJson): SavedJson => (typeof v.lastHitBy === 'string' && v.lastHitBy.startsWith('guard-') ? { ...v, lastHitBy: null } : v);
  const unnoted = (v: SavedJson): SavedJson => {
    if (!v.brain) return v;
    const { gunnedBy: _, ...brain } = v.brain as SavedJson;
    return { ...v, brain };
  };
  return { ...world, vehicles: (world.vehicles as SavedJson[]).map((v) => unnoted(uncredited(v))) };
}

function withFleePerceivedAndFightWorn_20_22(world: SavedJson): SavedJson {
  const turn = world.turn as number;
  const goal = (g: SavedJson): SavedJson => {
    if (g.kind === 'flee') return { ...g, perceived: turn };
    return g.kind === 'fight' ? { ...g, worn: { turn, condition: 1 } } : g;
  };
  const truck = (v: SavedJson): SavedJson => (v.brain ? { ...v, brain: { ...(v.brain as SavedJson), goals: ((v.brain as SavedJson).goals as SavedJson[]).map(goal) } } : v);
  return { ...world, vehicles: (world.vehicles as SavedJson[]).map(truck) };
}

function withLieUpSpot_41_42(world: SavedJson): SavedJson {
  const truck = (v: SavedJson): SavedJson => {
    if (!v.brain) return v;
    const pos = v.pos as SavedJson;
    const goal = (g: SavedJson): SavedJson => (g.kind === 'rearm' ? { ...g, destination: { x: pos.x, y: pos.y } } : g);
    return { ...v, brain: { ...(v.brain as SavedJson), goals: ((v.brain as SavedJson).goals as SavedJson[]).map(goal) } };
  };
  return { ...world, vehicles: (world.vehicles as SavedJson[]).map(truck) };
}

const FOOTPRINTS_2_34: Record<string, readonly [number, number]> = {
  shotgun: [1, 2], longRifle: [1, 2], flamer: [1, 2], pneumobolter: [2, 2], slugCannon: [1, 2], heavyMg: [1, 2], cannon: [2, 2], amRifle: [1, 3], autocannon: [2, 2],
  recoilless: [1, 3], battleRifle: [1, 3], gatling: [2, 2], rocketRack: [2, 2], sniperCannon: [2, 3], grenadeLauncher: [2, 2], tankGun: [2, 3], flechette: [2, 2], harpoon: [1, 2],
  patcherCrane: [1, 2], smokeMortar: [1, 2], scrapersKnife: [1, 2], emitter: [2, 2], stockEngine: [2, 2], tunedEngine: [2, 2], flatFour: [2, 2], workhorseDiesel: [2, 2],
  racingV6: [2, 2], heavyDiesel: [2, 2], turbine: [2, 2], plates: [1, 3], cage: [1, 2], ram: [3, 1], scrapPanels: [1, 2], ceramicPlates: [1, 2], spacedArmor: [1, 4],
  reinforcedCage: [1, 3], plowRam: [3, 1], claymoreRam: [3, 1], rack: [2, 1], trailerBox: [2, 2], flatbed: [2, 1], lightFrame: [2, 2], enclosedFrame: [2, 2], heavyFrame: [2, 2],
  cab: [1, 2], cabPickup: [3, 2], cabHardtop: [3, 2], transmission: [2, 2], transmissionMid: [2, 2], transmissionHeavy: [2, 2], wheel: [1, 2], wheelMid: [1, 2],
  wheelHeavy: [1, 2], tank: [1, 2], tankLong: [1, 2], tankMid: [1, 2], tankHeavy: [1, 2],
};

function footprintCells_42_43(item: SavedJson, defId: string | null): string[] {
  const [w, h] = defId === 'mg' ? [1, 2] : (defId && FOOTPRINTS_2_34[defId]) || [1, 1];
  const odd = (item.rot as number) % 2 === 1;
  const [cw, ch] = odd ? [h, w] : [w, h];
  const cells: string[] = [];
  for (let dy = 0; dy < ch; dy++) for (let dx = 0; dx < cw; dx++) cells.push(`${(item.x as number) + dx},${(item.y as number) + dy}`);
  return cells;
}

function withWideMg_42_43(world: SavedJson): SavedJson {
  const player = world.player as Player;
  const storage = [...player.storage];
  const widen = (v: SavedJson): SavedJson => {
    const layout = LAYOUTS_2_34[v.chassisId as string];
    const defOf = (item: SavedJson) => ((item.part as SavedJson | undefined)?.defId as string | undefined) ?? null;
    const items = v.items as SavedJson[];
    const taken = new Set(items.filter((item) => defOf(item) !== 'mg').flatMap((item) => footprintCells_42_43(item, defOf(item))));
    const letterAt = (cell: string) => {
      const [x, y] = cell.split(',').map(Number);
      return layout[y]?.[x];
    };
    const kept: SavedJson[] = [];
    for (const item of items) {
      if (defOf(item) !== 'mg') {
        kept.push(item);
        continue;
      }
      const first = letterAt(`${item.x},${item.y}`);
      const sits = (rot: number) => footprintCells_42_43({ ...item, rot }, 'mg').every((c) => !taken.has(c) && letterAt(c) === first);
      const fit = [item.rot as number, 1 - (item.rot as number)].find(sits);
      if (fit === undefined) {
        if (v.id === player.vehicleId) storage.push(item.part as SavedJson);
        continue;
      }
      footprintCells_42_43({ ...item, rot: fit }, 'mg').forEach((c) => taken.add(c));
      kept.push({ ...item, rot: fit });
    }
    return { ...v, items: kept };
  };
  const vehicles = (world.vehicles as SavedJson[]).map(widen);
  return { ...world, vehicles, player: { ...player, storage } };
}

function withTracks_22_24(world: SavedJson): SavedJson {
  const turn = world.turn as number;
  const places = new Map((world.vehicles as SavedJson[]).map((v) => [v.id as string, v.pos as SavedJson]));
  const fromNoticed = (noticed: Record<string, number>): Record<string, SavedJson> => {
    const tracks: Record<string, SavedJson> = {};
    for (const decision of ['contactHeard', 'hostileSeen']) {
      for (const [key, last] of Object.entries(noticed)) {
        const [kind, id] = key.split(':');
        const at = places.get(id);
        const seen = decision === 'hostileSeen';
        if (kind === decision && at) tracks[id] = { at: { ...at }, turn: last, sighted: seen, choice: 'keep', chosenInSight: seen, seenSince: null };
      }
    }
    return tracks;
  };
  const fromGoal = (tracks: Record<string, SavedJson>, g: SavedJson): void => {
    const at = places.get(g.targetId as string);
    if ((g.kind === 'fight' || g.kind === 'flee') && at) tracks[g.targetId as string] = { at: { ...at }, turn: (g.perceived as number | undefined) ?? turn, sighted: true, choice: g.kind, chosenInSight: true, seenSince: null };
  };
  const untimed = (g: SavedJson): SavedJson => {
    if (g.kind !== 'fight') return g;
    const { perceived: _, ...rest } = g;
    return rest;
  };
  const tracked = (v: SavedJson): SavedJson => {
    if (!v.brain) return v;
    const brain = v.brain as SavedJson;
    const noticed = brain.noticed as Record<string, number>;
    const goals = brain.goals as SavedJson[];
    const tracks = fromNoticed(noticed);
    for (const g of goals) fromGoal(tracks, g);
    const kept = Object.fromEntries(Object.entries(noticed).filter(([key]) => !key.startsWith('hostileSeen:') && !key.startsWith('contactHeard:')));
    return { ...v, brain: { ...brain, noticed: kept, goals: goals.map(untimed), tracks } };
  };
  return { ...world, vehicles: (world.vehicles as SavedJson[]).map(tracked) };
}

const FORTRESS_OBSTACLES_24_25 = new Set(
  ['bowl', 'nose', 'dustwell', 'green-pit', 'pump-station', 'granary', 'salvage-yard', 'south-lock', 'scrapjaw', 'kiln'].map((id) => `site-${id}`),
);

function isGoneObstacle_24_25(o: SavedJson): boolean {
  const id = o.id as string;
  return FORTRESS_OBSTACLES_24_25.has(id) || id.startsWith('bld-bowl-') || id.startsWith('bld-nose-')
    || id === 'pond-dustwell' || id === 'pond-green-pit' || id.startsWith('cw-salvage-yard-');
}

const SEARCH_SALT_25_26 = 0x73656172;
const NO_HIDDEN_25_26 = (): SavedJson => ({ goods: {}, parts: [], fuel: 0, supplies: 0 });

function withUtilities_25_26(world: SavedJson): SavedJson {
  const ordered = (v: SavedJson): SavedJson => ({ ...v, utilityOrders: {} });
  return {
    ...world,
    vehicles: (world.vehicles as SavedJson[]).map(ordered),
    smoke: [],
    fields: [],
    flares: [],
    lines: [],
    searchRng: { rngState: (world.seed as number) ^ SEARCH_SALT_25_26 },
  };
}

const LOOT_SITES_25_26 = new Set(['burnt-convoy', 'podfield', 'canyon-bridge', 'glass-flats', 'south-lock', 'ridge-wrecks', 'broken-wing']);
const LOOT_SPOT_25_26 = /^(farmhouse|barn|quonset|bunker|guardPost|armyTruck|armyCache|deckBay|shipCache)-\d+$/;
const ROAD_WRECK_25_26 = /^wreck\d+$/;

function isRolledStock_25_26(stock: SavedJson): boolean {
  const id = stock.id as string;
  return !stock.pile && (LOOT_SITES_25_26.has(id) || LOOT_SPOT_25_26.test(id) || ROAD_WRECK_25_26.test(id));
}

function withHiddenStock_25_26(world: SavedJson): SavedJson {
  const searched = new Set((world.player as SavedJson).scavenged as string[]);
  const hide = (stock: SavedJson): SavedJson => {
    if (searched.has(stock.id as string) || !isRolledStock_25_26(stock)) return { ...stock, hidden: NO_HIDDEN_25_26() };
    const hidden = { goods: stock.goods, parts: stock.parts, fuel: stock.fuel ?? 0, supplies: stock.supplies ?? 0 };
    return { ...stock, goods: {}, parts: [], fuel: 0, supplies: 0, hidden };
  };
  return { ...world, salvage: (world.salvage as SavedJson[]).map(hide) };
}

function withFulfilledFlag_26_27(world: SavedJson): SavedJson {
  const flagged = (c: SavedJson): SavedJson => (c.kind === 'bounty' ? { ...c, fulfilled: false } : c);
  const player = world.player as SavedJson;
  const shops = Object.fromEntries(
    Object.entries(world.shops as Record<string, SavedJson>).map(([id, shop]) => [id, { ...shop, contracts: (shop.contracts as SavedJson[]).map(flagged) }]),
  );
  return { ...world, player: { ...player, contracts: (player.contracts as SavedJson[]).map(flagged) }, shops };
}

const CENTS_PER_MONEY_29_30 = 100 / 3;

function scaled_29_30(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Saved ${what} is ${String(value)}, not a number`);
  return value * CENTS_PER_MONEY_29_30;
}

function cents_29_30(value: unknown, what: string): number {
  return Math.round(scaled_29_30(value, what));
}

function scaledRecord_29_30(record: SavedJson, what: string): SavedJson {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, scaled_29_30(v, `${what} ${k}`)]));
}

function contractCents_29_30(c: SavedJson): SavedJson {
  return { ...c, reward: cents_29_30(c.reward, `contract ${String(c.id)} reward`) };
}

function callVarsCents_29_30(vars: SavedJson): SavedJson {
  const centsVar = (v: SavedJson): SavedJson => {
    if (v.kind === 'money') return { ...v, amount: cents_29_30(v.amount, 'call money') };
    if (v.kind === 'deal') return { ...v, price: cents_29_30(v.price, 'call deal price') };
    if (v.kind === 'prices') {
      const goods = (v.goods as SavedJson[]).map((g) => ({ ...g, buy: cents_29_30(g.buy, 'call buy price'), sell: cents_29_30(g.sell, 'call sell price') }));
      return { ...v, goods };
    }
    return v;
  };
  return Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, centsVar(v as SavedJson)]));
}

function callCents_29_30(call: SavedJson): SavedJson {
  const line = call.line as SavedJson;
  return { ...call, vars: callVarsCents_29_30(call.vars as SavedJson), line: { ...line, vars: callVarsCents_29_30(line.vars as SavedJson) } };
}

function stateCents_29_30(state: SavedJson): SavedJson {
  const data = state.data as SavedJson;
  const what = `${String(data.kind)} state ${String(state.id)}`;
  if (data.kind === 'tow') return { ...state, data: { ...data, fee: cents_29_30(data.fee, `${what} fee`), waived: cents_29_30(data.waived, `${what} waived fee`) } };
  if (data.kind === 'towPromise' || data.kind === 'escort') return { ...state, data: { ...data, fee: cents_29_30(data.fee, `${what} fee`) } };
  if (data.kind === 'patch' || data.kind === 'aid') return { ...state, data: { ...data, price: cents_29_30(data.price, `${what} price`) } };
  return state;
}

function vehicleCents_29_30(v: SavedJson): SavedJson {
  const resources = v.resources as SavedJson | null;
  if (!resources) return v;
  return { ...v, resources: { ...resources, money: cents_29_30(resources.money, `vehicle ${String(v.id)} money`) } };
}

function withCents_29_30(world: SavedJson): SavedJson {
  const player = world.player as SavedJson;
  const call = player.call as SavedJson | null;
  return {
    ...world,
    player: {
      ...player,
      money: cents_29_30(player.money, 'player money'),
      costBasis: scaledRecord_29_30(player.costBasis as SavedJson, 'cost basis'),
      contracts: (player.contracts as SavedJson[]).map(contractCents_29_30),
      call: call ? callCents_29_30(call) : null,
    },
    shops: Object.fromEntries(
      Object.entries(world.shops as Record<string, SavedJson>).map(([id, shop]) => [id, { ...shop, contracts: (shop.contracts as SavedJson[]).map(contractCents_29_30) }]),
    ),
    vehicles: (world.vehicles as SavedJson[]).map(vehicleCents_29_30),
    salvage: (world.salvage as SavedJson[]).map((stock) => {
      const pile = stock.pile as SavedJson | undefined;
      return pile ? { ...stock, pile: { ...pile, basis: scaledRecord_29_30(pile.basis as SavedJson, `pile ${String(stock.id)} basis`) } } : stock;
    }),
    states: (world.states as SavedJson[]).map(stateCents_29_30),
  };
}

const RETIRED_SITES_36_37 = new Set(['burnt-convoy', 'podfield', 'ridge-wrecks', 'canyon-bridge', 'south-lock', 'broken-wing']);
const OUTPOST_GOODS_36_37: Record<string, string[]> = {
  dustwell: ['water', 'scrap', 'tools', 'meds'],
  'green-pit': ['water', 'grain', 'salt', 'textiles'],
};

function isRetired_36_37(id: unknown): boolean {
  return typeof id === 'string' && RETIRED_SITES_36_37.has(id);
}

function retiredObstacle_36_37(o: SavedJson): boolean {
  const id = o.id as string;
  for (const site of RETIRED_SITES_36_37) if (id === `site-${site}` || id.startsWith(`cw-${site}-`)) return true;
  return false;
}

function jobOnRetired_36_37(job: SavedJson | null | undefined): boolean {
  if (!job) return false;
  if (job.kind === 'search') return isRetired_36_37(job.stockId);
  const pickup = job.pickup as SavedJson | null | undefined;
  return job.kind === 'refit' && pickup?.from === 'stock' && isRetired_36_37(pickup.stockId);
}

function idleVehicle_36_37(v: SavedJson): SavedJson {
  const brain = v.brain as SavedJson | null | undefined;
  const job = jobOnRetired_36_37(v.job as SavedJson | null | undefined) ? { job: null } : {};
  return { ...v, ...job, ...(brain ? { brain: withoutRetiredMemory_36_37(brain) } : {}) };
}

function withOutposts_36_37(shops: Record<string, SavedJson>, turn: unknown): Record<string, SavedJson> {
  const added = Object.entries(OUTPOST_GOODS_36_37)
    .filter(([id]) => !(id in shops))
    .map(([id, goods]) => [id, { contracts: [], pressure: Object.fromEntries(goods.map((good) => [good, 0])), stock: [], restockAt: turn }]);
  return { ...shops, ...Object.fromEntries(added) };
}

function withoutRetiredSites_43_44(world: SavedJson): SavedJson {
  const keep = (id: string) => !isRetired_36_37(id);
  const player = world.player as SavedJson;
  return {
    ...world,
    salvage: (world.salvage as SavedJson[]).filter((stock) => keep(stock.id as string)),
    shops: withOutposts_36_37(world.shops as Record<string, SavedJson>, world.turn),
    obstacles: (world.obstacles as SavedJson[]).filter((o) => !retiredObstacle_36_37(o)),
    player: { ...player, scavenged: (player.scavenged as string[]).filter(keep), discovered: (player.discovered as string[]).filter(keep) },
    vehicles: (world.vehicles as SavedJson[]).map(idleVehicle_36_37),
  };
}

function withoutRetiredMemory_36_37(brain: SavedJson): SavedJson {
  const retired = (key: string) => isRetired_36_37(key) || isRetired_36_37(key.slice(key.indexOf(':') + 1));
  const goals = (brain.goals as SavedJson[]).filter((g) => !isRetired_36_37(g.targetId));
  const memories = (brain.memories as SavedJson[]).filter((m) => !isRetired_36_37((m.fact as SavedJson).stock));
  const noticed = Object.fromEntries(Object.entries(brain.noticed as Record<string, number>).filter(([key]) => !retired(key)));
  const unfit = ((brain.unfit as string[] | undefined) ?? []).filter((id) => !isRetired_36_37(id));
  return { ...brain, goals, memories, noticed, ...('unfit' in brain ? { unfit } : {}) };
}

const UNITS_2_19 = new Set(['part']);

function withGoalIds_34_35(v: SavedJson): SavedJson {
  const { name: _name, ...rest } = v;
  const brain = v.brain as SavedJson | null;
  if (!brain) return rest;
  const goals = (brain.goals as SavedJson[]).map((g) => ({ ...g, reason: GOAL_REASONS_2_19[g.reason as string] ?? 'legacy' }));
  return { ...rest, brain: { ...brain, goals } };
}

function withLineVars_34_35(vars: SavedJson): SavedJson | null {
  const out: SavedJson = {};
  for (const [key, v] of Object.entries(vars)) {
    const item = v as SavedJson;
    if (item.kind !== 'line') {
      out[key] = item;
      continue;
    }
    const line = WARN_LINES_2_19[item.text as string];
    if (!line) return null;
    out[key] = { kind: 'line', line };
  }
  return out;
}

function knownUnits_34_35(vars: SavedJson): boolean {
  return Object.values(vars).every((v) => (v as SavedJson).kind !== 'count' || UNITS_2_19.has((v as SavedJson).unit as string));
}

function callWithLineId_34_35(call: SavedJson | null): SavedJson | null {
  if (!call) return null;
  const said = call.line as SavedJson;
  const line = LINES_2_19[said.text as string];
  if (!line || !knownUnits_34_35(call.vars as SavedJson) || !knownUnits_34_35(said.vars as SavedJson)) return null;
  const vars = withLineVars_34_35(call.vars as SavedJson);
  const sayVars = withLineVars_34_35(said.vars as SavedJson);
  if (!vars || !sayVars) return null;
  return { ...call, vars, line: { line, vars: sayVars } };
}

const withoutTargetName_34_35 = (c: SavedJson): SavedJson => {
  const { targetName: _targetName, ...rest } = c;
  return rest;
};

function withTextIds_34_35(world: SavedJson): SavedJson {
  const player = world.player as SavedJson;
  const shops = Object.fromEntries(
    Object.entries(world.shops as Record<string, SavedJson>).map(([id, shop]) => [id, { ...shop, contracts: (shop.contracts as SavedJson[]).map(withoutTargetName_34_35) }]),
  );
  return {
    ...world,
    vehicles: (world.vehicles as SavedJson[]).map(withGoalIds_34_35),
    player: { ...player, call: callWithLineId_34_35(player.call as SavedJson | null), contracts: (player.contracts as SavedJson[]).map(withoutTargetName_34_35) },
    shops,
  };
}

const WAGON_SEVEN_34_35 = {
  obstacle: { id: 'story-wagon-seven', pos: { x: 171, y: 381 }, r: 0.8, kind: 'wreck', hulk: { chassisId: 'wagon', yaw: 2.2 } },
  stock: {
    id: 'story-wagon-seven',
    pos: { x: 171, y: 381 },
    radius: 0.8,
    goods: { scrap: 3, meds: 1, parts: 1 },
    parts: [{ id: 'story-wagon-seven-cannon', defId: 'cannon', hp: 48, wear: 2, gun: { cooldown: 0, ammo: 2, reloadWork: 0 } }],
    fuel: 10,
    supplies: 4,
    hidden: { goods: {}, parts: [], fuel: 0, supplies: 0 },
  },
};

function withNotesAndWagon_34_35(world: SavedJson): SavedJson {
  const has = (list: SavedJson[]) => list.some((x) => x.id === WAGON_SEVEN_34_35.obstacle.id);
  const obstacles = world.obstacles as SavedJson[];
  const salvage = world.salvage as SavedJson[];
  return {
    ...world,
    player: { ...(world.player as SavedJson), notes: [] },
    obstacles: has(obstacles) ? obstacles : [...obstacles, structuredClone(WAGON_SEVEN_34_35.obstacle)],
    salvage: has(salvage) ? salvage : [...salvage, structuredClone(WAGON_SEVEN_34_35.stock)],
  };
}

const PERSONALITIES_51_52 = ['talkative', 'tightLipped', 'gossip', 'braggart', 'suspicious', 'kind', 'grim', 'pious'] as const;

function personalityOf_51_52(vehicleId: string): string {
  const hash = [...vehicleId].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0, 0x811c9dc5);
  return PERSONALITIES_51_52[hash % PERSONALITIES_51_52.length];
}

function withPersonalities_51_52(world: SavedJson): SavedJson {
  const talking = (v: SavedJson): SavedJson => (v.brain ? { ...v, brain: { ...(v.brain as SavedJson), personality: personalityOf_51_52(v.id as string) } } : v);
  return { ...world, vehicles: (world.vehicles as SavedJson[]).map(talking) };
}

type Step = (world: SavedJson) => SavedJson;

function inOrder(steps: readonly Step[]): Step {
  return (world) => steps.reduce((w, step) => step(w), world);
}

function relaidTrucks_1_2(world: SavedJson): SavedJson {
  const player = { ...(world.player as Player), storage: [...(world.player as Player).storage] };
  const vehicles = (world.vehicles as SavedJson[]).map((v) => relayVehicle(v, v.id === player.vehicleId ? player : null));
  return { ...world, player, vehicles };
}

function withAidXpAndPackedExplored_2_4(world: SavedJson): SavedJson {
  const player = world.player as SavedJson;
  return { ...world, player: { ...player, xpBySource: { ...(player.xpBySource as SavedJson), aid: 0 }, explored: packExplored_3_4(player.explored as unknown[]) } };
}

function withContractWindows_4_5(world: SavedJson): SavedJson {
  const turn = world.turn as number;
  const windowed = (c: SavedJson): SavedJson => {
    const window = Math.max(1, (c.deadline as number) - turn);
    return c.kind === 'haul' ? { ...c, window, rush: false } : { ...c, window };
  };
  const player = world.player as SavedJson;
  const shops = Object.fromEntries(
    Object.entries(world.shops as Record<string, SavedJson>).map(([id, shop]) => [id, { ...shop, contracts: (shop.contracts as SavedJson[]).map(windowed) }]),
  );
  return { ...world, player: { ...player, contracts: (player.contracts as SavedJson[]).map(windowed) }, shops };
}

function withAidHandover_5_6(world: SavedJson): SavedJson {
  const handover = (s: SavedJson): SavedJson => {
    const data = s.data as SavedJson;
    return data.kind === 'aid' ? { ...s, data: { ...data, started: false, work: HANDOVER_TURNS_5_6, workLeft: HANDOVER_TURNS_5_6 } } : s;
  };
  return { ...world, states: (world.states as SavedJson[]).map(handover) };
}

function withPooledSkillsAndHeadlights_9_13(world: SavedJson): SavedJson {
  const { skills, ...player } = world.player as SavedJson;
  return { ...world, player: { ...player, ...pooledSkills_9_10(skills as Record<string, number>), headlights: false } };
}

const release_1_6 = inOrder([relaidTrucks_1_2, withAidXpAndPackedExplored_2_4, withContractWindows_4_5, withAidHandover_5_6]);

const release_6_25 = inOrder([
  (world) => ({ ...world, vehicles: (world.vehicles as SavedJson[]).map(withGaveUp_6_7) }),
  (world) => withoutRetiredStock(world, RETIRED_STOCK_6_25),
  withPooledSkillsAndHeadlights_9_13,
  withMemories_11_12,
  withPatchParts_13_14,
  (world) => ({ ...world, craters: [] }),
  withStormBorn_16_17,
  withStormExposure_17_18,
  withRouteStyle_18_19,
  withoutGuards_19_20,
  withFleePerceivedAndFightWorn_20_22,
  withTracks_22_24,
  (world) => ({ ...world, obstacles: (world.obstacles as SavedJson[]).filter((o) => !isGoneObstacle_24_25(o)) }),
]);

const SETUP_25_61 = { mode: 'roaming', settings: { damage: 1, fuelUse: 1, supplyUse: 1, enemyGearGrowth: 1 } };

function withoutLastTurn_31_33(world: SavedJson): SavedJson {
  const { events: _events, removed: _removed, ...rest } = world;
  const { visible: _visible, contacts: _contacts, clouds: _clouds, ...player } = world.player as SavedJson;
  const vehicles = (world.vehicles as SavedJson[]).map(({ trail: _trail, ...vehicle }) => vehicle);
  const broken = (world.broken as SavedJson[]).map((b) => ({ id: (b.obstacle as SavedJson).id, turn: b.turn }));
  return { ...rest, player, vehicles, broken };
}

function withFreshQuests_37_38(world: SavedJson): SavedJson {
  return { ...world, player: { ...(world.player as SavedJson), quests: { world: {}, local: {}, session: null } } };
}

const release_25_61 = inOrder([
  withUtilities_25_26,
  withHiddenStock_25_26,
  (world) => ({ ...world, player: { ...(world.player as SavedJson), frozen: false } }),
  withFulfilledFlag_26_27,
  (world) => withoutRetiredStock(world, RETIRED_STOCK_25_61),
  (world) => ({ ...world, setup: structuredClone(SETUP_25_61) }),
  withCents_29_30,
  withoutLastTurn_31_33,
  withTextIds_34_35,
  withNotesAndWagon_34_35,
  withFreshQuests_37_38,
  withLieUpSpot_41_42,
  withWideMg_42_43,
  withoutRetiredSites_43_44,
  (world) => ({ ...world, furyRoad: null }),
  withPersonalities_51_52,
  withDutyLegs_59_60,
]);

export type ReleaseStep = { from: number; to: number; step: Step };

export const RELEASE_STEPS: readonly ReleaseStep[] = [
  { from: 1, to: 6, step: release_1_6 },
  { from: 6, to: 25, step: release_6_25 },
  { from: 25, to: 61, step: release_25_61 },
  { from: 61, to: 62, step: withSceneHubsAtSceneStart_61_62 },
  { from: 62, to: 63, step: (world) => world },
];

export const TINY_FROM = 63;

export const TINY_STEPS: readonly Step[] = [
  withRescueContracts_63_64,
  withEncounters_64_65,
  withProgressAnchor_65_66,
  (world) => world,
  withoutBearingCall_67_68,
  withSearches_68_69,
  withParcelSearches_69_70,
  withFactions_70_71,
  withCountableDirections_71_72,
  withRunWait_72_73,
  withPlannedGroups_73_74,
  (world) => world,
  withClaimRivals_75_76,
  withCrewsAndHires_76_77,
  withHattieMet_77_78,
  withBrakeRod_78_79,
  withoutVarga_79_80,
  (world) => world,
  withHeardCentres_81_82,
  withShopGoods_82_83,
  withStapleRestock_83_84,
  withSunward_84_85,
  withHollowFort_85_86,
  withOfferedNight_86_87,
  withFollowHeadings_87_88,
  withKovacMounts_88_89,
  (world) => world, withShortRoadScenes_90_91, withChaosHighwayIntro_91_92,
  withPastContracts_92_93,
  withTractorPivot_93_94,
  withStandardPaint_94_95, withThreeColorPaint_95_96, withMutedPaint_96_97,
  withStrandedAnchors_97_98,
  (world) => world,
  (world) => world,
  withoutPricedHaulCalls_100_101,
  withCrimes_101_102,
  withOddFronts_102_103,
  withoutFetchAndBounty_103_104,
  withOfferingsRedated_104_105,
];

function withOfferingsRedated_104_105(world: SavedJson): SavedJson {
  const redate = (s: SavedJson): SavedJson => (s.kind === 'offering' ? { ...s, born: world.turn } : s);
  return { ...world, states: (world.states as SavedJson[]).map(redate) };
}

const MARSHALS_STANDING_101_102 = 0;

function withCrimes_101_102(world: SavedJson): SavedJson {
  const player = world.player as SavedJson;
  return { ...world, crimes: [], player: { ...player, standing: { ...(player.standing as SavedJson), marshals: MARSHALS_STANDING_101_102 } } };
}

function withStrandedAnchors_97_98(world: SavedJson): SavedJson {
  const anchored = (v: SavedJson): SavedJson => {
    if (!((v.strandedTurns as number | undefined) ?? 0)) return v;
    const pos = v.pos as { x: number; y: number };
    return { ...v, strandedAt: { x: pos.x, y: pos.y } };
  };
  return { ...world, vehicles: (world.vehicles as SavedJson[]).map(anchored) };
}

function withSearches_68_69(world: SavedJson): SavedJson {
  return world;
}
const withoutSearches_69_70 = (contracts: SavedJson[]): SavedJson[] => contracts.filter((c) => c.kind !== 'search');
function withoutFoundTalk_69_70(talked: Record<string, SavedJson>): Record<string, SavedJson> {
  return Object.fromEntries(Object.entries(talked).map(([npc, topics]) => [npc, Object.fromEntries(Object.entries(topics).filter(([topic]) => topic !== 'found'))]));
}
function withParcelSearches_69_70(world: SavedJson): SavedJson {
  const player = world.player as SavedJson;
  const call = player.call as SavedJson | null;
  const shops = Object.fromEntries(Object.entries(world.shops as Record<string, SavedJson>).map(([id, shop]) => [id, { ...shop, contracts: withoutSearches_69_70(shop.contracts as SavedJson[]) }]));
  return {
    ...world,
    shops,
    player: {
      ...player,
      contracts: withoutSearches_69_70(player.contracts as SavedJson[]),
      talked: withoutFoundTalk_69_70(player.talked as Record<string, SavedJson>),
      call: call?.topic === 'found' ? null : call,
    },
  };
}

function withRescueContracts_63_64(world: SavedJson): SavedJson {
  return world;
}

const CLAIM_KIND_67_68 = 'claim';

function withRival_75_76(contract: SavedJson): SavedJson {
  return contract.kind === CLAIM_KIND_67_68 ? { ...contract, rivalAt: contract.deadline, rival: null, leads: [] } : contract;
}

function withClaimRivals_75_76(world: SavedJson): SavedJson {
  const shops = Object.fromEntries(Object.entries(world.shops as Record<string, SavedJson>).map(([id, shop]) => [id, { ...shop, contracts: (shop.contracts as SavedJson[]).map(withRival_75_76) }]));
  const player = world.player as SavedJson;
  return { ...world, shops, player: { ...player, contracts: (player.contracts as SavedJson[]).map(withRival_75_76) } };
}

const PAGE_HUB_CHECKPOINTS_61_62: readonly (readonly [string, string, string])[] = [
  ['wagon_seven', 'start.hub', 'start'],
  ['wagon_bench', 'bench.hub', 'bench.report'],
];

function withSceneHubsAtSceneStart_61_62(world: SavedJson): SavedJson {
  return PAGE_HUB_CHECKPOINTS_61_62.reduce((w, [quest, from, to]) => moveQuestCheckpoint(w, quest, from, to), world);
}

const MAX_COUNT_71_72 = 3;

function countedPast_71_72(step: SavedJson): boolean {
  const at = step.at as SavedJson | undefined;
  return (step.do === 'turn' || step.do === 'leave') && at?.kind === 'fork' && (at.nth as number) > MAX_COUNT_71_72;
}

function countableSteps_71_72(steps: SavedJson[]): SavedJson[] {
  const cut = steps.findIndex(countedPast_71_72);
  const kept = cut < 0 ? steps : [...steps.slice(0, cut), { do: 'askAgain' }];
  return kept.map((step) => {
    if (step.do !== 'askAgain') return step;
    const { at: _at, ...plain } = step;
    return plain;
  });
}

function countableVars_71_72(vars: SavedJson): SavedJson {
  return Object.fromEntries(Object.entries(vars).map(([name, v]) => {
    const value = v as SavedJson;
    return [name, value.kind === 'directions' ? { ...value, steps: countableSteps_71_72(value.steps as SavedJson[]) } : value];
  }));
}

function withCountableDirections_71_72(world: SavedJson): SavedJson {
  const player = world.player as SavedJson;
  const call = player.call as SavedJson | null;
  if (!call) return world;
  const line = call.line as SavedJson;
  const next = { ...call, vars: countableVars_71_72(call.vars as SavedJson), line: { ...line, vars: countableVars_71_72(line.vars as SavedJson) } };
  return { ...world, player: { ...player, call: next } };
}

const BEARING_LINES_67_68: readonly string[] = ['townBearing', 'siteBearing', 'aWreckNobodyPicked', 'rolledPastSite'];

function withoutBearingCall_67_68(world: SavedJson): SavedJson {
  const player = world.player as SavedJson;
  const call = player.call as SavedJson | null;
  const said = (call?.line as SavedJson | undefined)?.line;
  return typeof said === 'string' && BEARING_LINES_67_68.includes(said) ? { ...world, player: { ...player, call: null } } : world;
}

const TOWN_GOODS_82_83: readonly string[] = ['grain', 'textiles', 'meds', 'parts', 'electronics', 'water', 'scrap', 'batteries', 'salt', 'tools', 'rations', 'fuelDrums'];

const STOCK_TARGETS_82_83: Record<string, Record<string, number>> = {
  bowl: Object.fromEntries(TOWN_GOODS_82_83.map((good) => [good, 120])),
  nose: { ...Object.fromEntries(TOWN_GOODS_82_83.filter((good) => good !== 'grain').map((good) => [good, 120])), relics: 0 },
  'salvage-yard': { scrap: 30, parts: 30, tools: 30, rations: 30, fuelDrums: 30, relics: 0 },
  granary: { rations: 38, grain: 30, salt: 30, water: 30, tools: 30, fuelDrums: 30 },
  'pump-station': { fuelDrums: 229, tools: 30, batteries: 30, rations: 30 },
  dustwell: { water: 30, tools: 30, meds: 30, rations: 30, fuelDrums: 30 },
  'green-pit': { water: 30, salt: 30, textiles: 30, rations: 30, fuelDrums: 30 },
};

const ELASTICITY_82_83 = 0.6;

function stockFromPressure_82_83(target: number, pressure: number | undefined): number {
  return Math.max(0, Math.round(target * (1 - (pressure ?? 0) / ELASTICITY_82_83)));
}

function tradesAt_82_83(shopId: string, good: string): boolean {
  return good in (STOCK_TARGETS_82_83[shopId] ?? {});
}

function haulStillRuns_82_83(contract: SavedJson): boolean {
  return contract.kind !== 'haul' || (tradesAt_82_83(contract.shop as string, contract.good as string) && tradesAt_82_83(contract.to as string, contract.good as string));
}

function shopWithGoods_82_83(shopId: string, shop: SavedJson): SavedJson {
  const { pressure = {}, ...rest } = shop as SavedJson & { pressure?: Record<string, number> };
  const targets = STOCK_TARGETS_82_83[shopId];
  if (!targets) throw new Error(`Save holds an unknown shop ${shopId}`);
  const goods = Object.fromEntries(Object.entries(targets).map(([good, target]) => [good, stockFromPressure_82_83(target, pressure[good])]));
  const contracts = (rest.contracts as SavedJson[]).filter(haulStillRuns_82_83);
  return { ...rest, contracts, goods, event: null, shortSince: {}, opened: {} };
}

function withoutHaulGoal_82_83(vehicle: SavedJson): SavedJson {
  const brain = vehicle.brain as SavedJson | null;
  if (!brain) return vehicle;
  const goals = (brain.goals as SavedJson[]).filter((goal) => goal.kind !== 'haul').map(({ load: _load, ...goal }) => goal);
  const job = vehicle.job as SavedJson | null | undefined;
  const hauling = job?.kind === 'business' && job.deal === 'haul';
  return { ...vehicle, job: hauling ? null : job, brain: { ...brain, goals } };
}

function withShopGoods_82_83(world: SavedJson): SavedJson {
  const shops = Object.fromEntries(Object.entries(world.shops as Record<string, SavedJson>).map(([id, shop]) => [id, shopWithGoods_82_83(id, shop)]));
  const vehicles = (world.vehicles as SavedJson[]).map(withoutHaulGoal_82_83);
  return { ...world, shops, vehicles, roadNews: [] };
}

function namesCargo_100_101(vars: SavedJson): boolean {
  const price = vars.price as SavedJson | undefined;
  const haul = vars.haul as { kind: string; goods: Record<string, number>; parts: string[] } | undefined;
  if (price?.kind !== 'money' || haul?.kind !== 'haul') return false;
  return Object.keys(haul.goods).length + haul.parts.length > 0;
}

function withoutPricedHaulCalls_100_101(world: SavedJson): SavedJson {
  const player = world.player as SavedJson;
  const call = player.call as SavedJson | null;
  const topics = ['demand', 'truce', 'mercy'];
  if (!call || !topics.includes(call.topic as string) || !namesCargo_100_101(call.vars as SavedJson)) return world;
  return { ...world, player: { ...player, call: null } };
}

type SavedQuests = { world: SavedJson; local: Record<string, SavedJson>; session: { quest: string; checkpoint: string; seed: number } | null };

function questsOf(world: SavedJson): SavedQuests {
  return (world.player as { quests: SavedQuests }).quests;
}

function withQuests(world: SavedJson, quests: SavedQuests): SavedJson {
  return { ...world, player: { ...(world.player as SavedJson), quests } };
}

function questVars(quests: SavedQuests, quest: string | null): SavedJson {
  return quest === null ? quests.world : (quests.local[quest] ?? {});
}

function withQuestVars(quests: SavedQuests, quest: string | null, vars: SavedJson): SavedQuests {
  if (quest === null) return { ...quests, world: vars };
  const { [quest]: _old, ...others } = quests.local;
  return { ...quests, local: Object.keys(vars).length > 0 ? { ...others, [quest]: vars } : others };
}

export function renameQuestVar(world: SavedJson, quest: string | null, from: string, to: string): SavedJson {
  const quests = questsOf(world);
  const { [from]: value, ...rest } = questVars(quests, quest);
  if (value === undefined) return world;
  if (to in rest) throw new Error(`Quest variable ${to} already holds a value, so ${from} cannot move there`);
  return withQuests(world, withQuestVars(quests, quest, { ...rest, [to]: value }));
}

export function dropQuestVar(world: SavedJson, quest: string | null, name: string): SavedJson {
  const quests = questsOf(world);
  const { [name]: _dropped, ...rest } = questVars(quests, quest);
  return withQuests(world, withQuestVars(quests, quest, rest));
}

export function moveQuestCheckpoint(world: SavedJson, quest: string, from: string, to: string): SavedJson {
  const quests = questsOf(world);
  const session = quests.session;
  if (session?.quest !== quest || session.checkpoint !== from) return world;
  return withQuests(world, { ...quests, session: { ...session, checkpoint: to } });
}

export function endQuestSession(world: SavedJson, quest: string): SavedJson {
  const quests = questsOf(world);
  return quests.session?.quest === quest ? withQuests(world, { ...quests, session: null }) : world;
}

export function dropQuest(world: SavedJson, quest: string): SavedJson {
  const quests = endQuestSession(world, quest);
  const { [quest]: _dropped, ...local } = questsOf(quests).local;
  return withQuests(quests, { ...questsOf(quests), local });
}
