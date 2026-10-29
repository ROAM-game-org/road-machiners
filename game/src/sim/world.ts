
import { assignMoments, freshMoments, passMoments } from './moments';
import { advanceCrimes, learnCasesAtDesk } from './crime';
import { settleCrews } from './crews';
import { CHASSIS, isPaletteId, PAINT, PAINT_SLOTS } from '../data/chassis';
import { GOODS } from '../data/goods';
import { partDef } from '../data/parts';
import { REGION } from '../data/region';
import { MAX_RANK, PERKS, SKILL_IDS, XP_SOURCES } from '../data/skills';
import { CONDITION } from '../data/wear';
import { RULES } from '../data/rules';
import type { StartKit } from '../data/start';
import { findPart, haulerOf, playerTrucks, playerVehicle } from './damage';
import { makePart, makeVehicle, newId } from './factory';
import { gridOf, placementError } from './grid';
import { addGoods } from './inventory';
import { basicRefusal, isPerkId, pickedFromPair, skillLevel } from './progress';
import { fitStores, getResources } from './resources';
import { isOutpostSite } from './highway';
import { generateObstacles, touchesObstacle } from './mapgen';
import { atlasOf, icarusAtlas } from './atlas';
import type { BakedMap } from './terrain';
import { planNpcOrders, settleMeetings } from './ai';
import { assignUtilityOrders } from './npc-utility';
import { applyGodMode, freezeDriving, freezeFire } from './cheats';
import { assignAutoOrders, dropMagazine, fireWeapons, huntGaps, isHostile, noteEngagements, resolveDestroyed, settleAims } from './combat';
import { cutLine } from './harpoon';
import { advanceKnockout, advanceNpcKnockouts, checkDeath, checkKnockout, isKnockedOut } from './defeat';
import { advanceIntro, greetAtWell, wakeInTown } from './intro';
import { healPlayer } from './health';
import { discoverSites } from './locations';
import { findSurveySites } from './survey';
import { applyHazards } from './hazard';
import { consumeSupplies, fitAllStores, leakFuel } from './supplies';
import { scrapPatch } from './economy';
import { nameStream, spawnInitial, spawnNpcs } from './spawn';
import { clearPiles, initializeSalvage, renewSalvage, stockOldSpots } from './salvage';
import { spillDeadRows } from './spill';
import { fadeCraters } from './craters';
import { timed } from '../perf';
import { noteHurt, resolveNpcActivities } from './npc-activities';
import { watchStalls } from './npc-watchdog';
import { advanceStates } from './states';
import { forgetOld } from './memory';
import { lapseEncounter } from './encounters';
import { checkBeacon, dropStrandedTowers, followTower, isTowed, playerTow } from './tow';
import { endCallIfOut, raiseCalls } from './dialogue';
import { advancePatches } from './patch';
import { advanceAid, readyAid } from './aid';
import { readyHandover } from './parcel';
import type { GridItem, MoveOrder, Obstacle, PartInstance, Refusal, Rot, UtilityOrder, Vehicle, WeaponOrder, World, WorldSetup, XpSource } from './types';
import { defaultSetup, modeMap, modeRules, modeRulesOf, parseSetup, repairSetup } from './settings';
import { QUESTS, openRoadScene, type CarriedQuestVars } from './quests';
import { repairQuests, type SavedRevisions } from './quest-repair';
import { isNoteId } from '../data/locals';
import { advanceChaosHighway, outpostFactsAt, runStart, startRun } from './chaos-highway';
import { gatesShut } from './outpost-gates';
import { noteHaulerHits, planHaulerOrder, watchHaulerStall } from './hauler';
import { overdriveBlock, vehicleStats } from './stats';
import { playerSees, practiceContacts, refreshVision } from './vision';
import { noteEscape } from './escape';
import { advanceWeather } from './weather';
import { advanceRescues } from './rescue';
import { advanceContracts, advanceShops, initializeShops, marketStream, shopNear } from './market';
import { advanceProduction } from './production';
import { applyWear, carryHp } from './wear';
import { advanceDust } from './detect';
import { searchStream } from './search';
import { cookOffClaymores, settleClaymores } from './claymore';
import { activateUtilities, advanceLines, advanceUtilityEffects, settleShutdowns, tickCharges, utilityOrderError } from './utility';
import { caltropHits } from './hazards';
import { advanceJobs, startAutoRepair } from './jobs';
import { advanceEngineHeat } from './engine-heat';
import { nearestPad } from './sites';
import { openingObstacles, setUpOpening } from './opening';
import { startPose } from './start-pose';
import { clamp, dist, type Vec } from './vec';
import { startStanding } from "../data/npc-behavior";
import { driftStanding } from "./relations";
import { advanceSunward, freshSunward, HOLLOW_ID } from "./sunward";
import { hollowObstaclesFor } from "./hollow-layout";

export function seedStreams(seed: number): Pick<World, 'seed' | 'rngState' | 'marketRng' | 'nameRng' | 'searchRng'> {
  if (!Number.isInteger(seed)) throw new Error(`Seed must be an integer, got ${seed}`);
  return { seed, rngState: seed, marketRng: marketStream(seed), nameRng: nameStream(seed), searchRng: searchStream(seed) };
}

export function newWorld(seed: number, kit: StartKit, map: BakedMap, setup: WorldSetup, populate = true, start: { pos: Vec; heading: number } = kitStart(kit, seed, setup)): World {
  requireMapFits(map, setup);
  const size = map.terrain.size;
  const world: World = {
    ...seedStreams(seed),
    turn: 1,
    size,
    nextId: 0,
    vehicles: [],
    obstacles: [],
    broken: [],
    craters: [],
    salvage: [],
    shops: {},
    roadNews: [],
    terrain: map.terrain,
    mapHash: map.hash,
    setup: parseSetup(setup),
    player: {
      vehicleId: "",
      money: kit.money,
      standing: startStanding(),
      deeds: [],
      xp: 0,
      ranks: { driving: kit.ranks, perception: kit.ranks, machining: kit.ranks, toughness: kit.ranks, social: kit.ranks },
      xpToday: { driving: 0, perception: 0, machining: 0, toughness: 0, social: 0 },
      xpDay: 1,
      repeats: {},
      xpBySource: {
        roughTiles: 0, ram: 0, escape: 0,
        hit: 0, contact: 0, discover: 0,
        fieldJob: 0, patch: 0, search: 0,
        heat: 0, damage: 0, knockout: 0,
        profit: 0, deal: 0, call: 0, honk: 0, contract: 0, freeTow: 0, aid: 0,
      },
      perks: [],
      paint: { ...PAINT.standard },
      marked: [],
      rumored: [],
      encounters: { next: 0, pending: null, story: null },
      notes: [],
      health: startHealth(kit),
      fuel: kit.fuel,
      supplies: kit.supplies,
      autoFire: false,
      autoRepair: kit.autoRepair,
      townPatched: false,
      engineHeat: 0,
      overdrive: false,
      headlights: false,
      discovered: [],
      scavenged: [],
      storage: [],
      contracts: [],
      pastContracts: [],
      costBasis: { ...kit.costBasis },
      knockouts: 0,
      state: 'active',
      knockoutTurns: 0,
      beacon: false,
      call: null,
      talked: {},
      quests: { world: {}, local: {}, session: null, live: null, seen: {} },
      god: false,
      fullLog: false,
      frozen: false,
      explored: new Uint8Array(size * size),
      visible: [],
      contacts: [],
      clouds: [],
      hostilesSeen: [],
    },
    events: [],
    removed: [],
    spawnTimer: {},
    spawnQueue: [],
    weather: [],
    dustClouds: [],
    states: [],
    smoke: [],
    fields: [],
    flares: [],
    lines: [],
    chaosHighway: null,
    sunward: modeMap(setup.mode) === 'icarus' ? freshSunward() : null,
    moments: modeMap(setup.mode) === 'icarus' ? freshMoments() : null,
    crimes: [],
  };
  world.obstacles = generateObstacles(world, map, [...hollowObstaclesFor(world), ...openingObstacles(kit, start)]);
  const truck = makeVehicle(world, {
    faction: "player",
    chassisId: kit.chassis,
    parts: [
      ...(kit.placed ?? []).map(({ defId, ...at }) => ({ defId, wear: kit.wear, at })),
      ...kit.parts.map((defId) => ({ defId, wear: kit.wear })),
    ],
    spares: [],
    cargo: kit.cargo,
    pos: start.pos,
    heading: start.heading,
    brain: null,
  });
  const blocked = world.obstacles.filter(
    (o) => touchesObstacle(o, world.terrain, truck.pos, vehicleStats(world, truck).radius),
  );
  if (blocked.length > 0)
    throw new Error(
      `Player start overlaps ${blocked.map((o) => o.id).join(", ")}`,
    );
  wearCoreParts(world, truck, kit.wear);
  world.vehicles.push(truck);
  world.player.vehicleId = truck.id;
  setUpWorldStock(world, map, truck, kit, populate);
  refreshVision(world);
  world.events = [];
  return world;
}

function startHealth(kit: StartKit): number {
  return kit.intro ? kit.intro.health : RULES.maxHealth;
}

function kitStart(kit: StartKit, seed: number, setup: WorldSetup): { pos: Vec; heading: number } {
  return kit.intro?.pose ?? startOf(seed, setup);
}

function requireMapFits(map: BakedMap, setup: WorldSetup): void {
  const atlas = atlasOf(map.terrain);
  if (atlas === icarusAtlas() && map.terrain.size !== REGION.size) throw new Error(`Map size ${map.terrain.size} does not match region size ${REGION.size}`);
  const rules = modeRulesOf(setup.mode);
  if ((rules.traffic || rules.rescue) && atlas.towns.length === 0) throw new Error(`Mode ${setup.mode} needs towns, and map ${map.hash} has none`);
}

function setUpWorldStock(world: World, map: BakedMap, truck: Vehicle, kit: StartKit, populate: boolean): void {
  const rules = modeRules(world);
  if (rules.run) startRun(world);
  if (rules.looting) initializeSalvage(world);
  setUpOpening(world, truck, kit.opening);
  world.player.storage = kit.storage.map((defId) => makePart(world, defId, kit.wear));
  if (populate && rules.traffic) spawnInitial(world);
  if (populate && rules.traffic) assignMoments(world);
  if (rules.traffic) initializeShops(world);
  stockOldSpots(world, map);
}

export function startOf(seed: number, setup: WorldSetup): { pos: Vec; heading: number } {
  return modeMap(setup.mode) === 'highway' ? runStart(seed, 0).player : startPose();
}

function wearCoreParts(world: World, truck: Vehicle, wear: number): void {
  for (const item of truck.items) if (item.kind === "part" && partDef(item.part.defId).kind === "core") item.part = makePart(world, item.part.defId, wear);
}

export function townStart(): { pos: Vec; heading: number } {
  const from = startPose().pos;
  const town = [...REGION.towns].sort((a, b) => dist(from, a.pos) - dist(from, b.pos))[0];
  const pos = nearestPad(town, from);
  return { pos, heading: Math.atan2(pos.y - town.pos.y, pos.x - town.pos.x) };
}

export function cloneWorld(world: World): World {
  const { terrain, obstacles, ...state } = world;
  return { ...structuredClone(state), obstacles: frozenObstacles(obstacles), terrain: Object.isFrozen(terrain) ? terrain : structuredClone(terrain) };
}

function frozenObstacles(obstacles: Obstacle[]): Obstacle[] {
  if (Object.isFrozen(obstacles)) return obstacles;
  for (const o of obstacles) {
    Object.freeze(o.pos);
    if ('hulk' in o && o.hulk) Object.freeze(o.hulk);
    Object.freeze(o);
  }
  return Object.freeze(obstacles) as Obstacle[];
}

export function update(world: World, fn: (draft: World) => void): World {
  const draft = cloneWorld(world);
  draft.events = [];
  draft.removed = [];
  fn(draft);
  settleAims(draft);
  settleOverdrive(draft);
  return draft;
}

function settleOverdrive(w: World): void {
  if (!w.player.overdrive || overdriveBlock(w, playerVehicle(w)) === null) return;
  w.player.overdrive = false;
  w.events.push({ t: 'info', note: { id: 'overdriveCutOut' } });
}

export type ActBlock = 'knockedOut' | 'towed' | 'onRadio';

export function actBlock(world: World): ActBlock | null {
  if (world.player.state !== 'active') return 'knockedOut';
  if (isTowed(world)) return 'towed';
  if (world.player.call) return 'onRadio';
  return null;
}

export function playerCanAct(world: World): boolean {
  return actBlock(world) === null;
}

export function requireActivePlayer(world: World): void {
  if (world.player.state !== 'active') throw new Error(`Player is ${world.player.state}`);
  if (isTowed(world)) throw new Error('Player is towed');
  if (world.player.call) throw new Error('A radio call is open');
}

export function waitsOnPlayer(world: World): boolean {
  return world.player.call !== null || world.player.quests.live !== null;
}

export function autoRuns(world: World): boolean {
  const p = world.player;
  if (waitsOnPlayer(world)) return false;
  if (p.state === 'knockedOut' || isTowed(world)) return true;
  if (readyDeal(world)) return false;
  return waitsOnBeacon(world);
}

function readyDeal(world: World): boolean {
  return readyAid(world) !== null || readyHandover(world) !== null;
}

export function isAtRest(v: Vehicle): boolean {
  return v.speed <= RULES.parkedSpeed && (v.order === null || v.order.kind === 'brake');
}

function waitsOnBeacon(world: World): boolean {
  const p = world.player;
  const me = playerVehicle(world);
  return p.state === 'active' && p.beacon && isAtRest(me) && playerTow(world) === null;
}

export class Refused extends Error {
  constructor(readonly refusal: Refusal) {
    super(`Refused: ${refusal.id}`);
  }
}

export function playerCommand(world: World, fn: (draft: World) => void): World {
  requireActivePlayer(world);
  return update(world, fn);
}

export function setMoveOrder(world: World, order: MoveOrder | null): World {
  return playerCommand(world, (w) => {
    if (gatesShut(w)) throw new Refused({ id: 'gatesShut' });
    playerVehicle(w).order =
      order && order.kind !== "brake"
        ? {
            kind: order.kind,
            dest: {
              x: clamp(order.dest.x, 0, w.size),
              y: clamp(order.dest.y, 0, w.size),
            },
            ...heldPace(order.pace),
          }
        : order;
  });
}

function heldPace(pace: number | undefined): { pace?: number } {
  if (pace === undefined) return {};
  if (!Number.isFinite(pace) || pace <= RULES.parkedSpeed) throw new Error(`A move order pace must be above ${RULES.parkedSpeed}, got ${pace}`);
  return { pace };
}

export function endTurn(
  world: World,
  move: (w: World) => void,
): World {
  if (world.player.state === 'dead') throw new Error('The player is dead; no more turns run');
  if (world.player.call) throw new Error('A radio call is open; no turn runs until it ends');
  return timed('turn', () => update(world, (w) => {
    w.turn++;
    advanceWeather(w);
    planNpcOrders(w);
    planHaulerOrder(w);
    freezeDriving(w);
    advanceUtilityEffects(w);
    assignUtilityOrders(w);
    activateUtilities(w);
    const gaps = huntGaps(w);
    move(w);
    if (!shopNear(w)) w.player.townPatched = false;
    followTower(w);
    caltropHits(w);
    applyWear(w);
    spillDeadRows(w);
    advanceEngineHeat(w);
    advanceDust(w);
    advanceLines(w);
    clearPiles(w);
    renewSalvage(w);
    fadeCraters(w);
    advanceJobs(w);
    startAutoRepair(w);
    practiceContacts(w, refreshVision(w));
    findSurveySites(w);
    raiseCalls(w);
    assignAutoOrders(w);
    freezeFire(w);
    settleAims(w);
    tickCharges(w);
    fireWeapons(w);
    cookOffClaymores(w);
    consumeSupplies(w);
    applyHazards(w);
    spillDeadRows(w);
    scrapPatch(w);
    healPlayer(w);
    leakFuel(w);
    fitAllStores(w);
    applyGodMode(w);
    resolveDestroyed(w);
    settleCrews(w);
    noteHaulerHits(w);
    dropStrandedTowers(w);
    advanceContracts(w);
    advancePatches(w);
    advanceAid(w);
    advanceStates(w);
    advanceCrimes(w);
    advanceRescues(w);
    checkBeacon(w);
    forgetOld(w);
    driftStanding(w);
    lapseEncounter(w);
    resolveNpcActivities(w);
    learnCasesAtDesk(w);
    noteEngagements(w, gaps);
    discoverSites(w);
    checkDeath(w);
    wakeInTown(w, advanceKnockout(w));
    checkKnockout(w);
    advanceNpcKnockouts(w);
    advanceChaosHighway(w);
    openRoadScene(w);
    spawnNpcs(w);
    passMoments(w);
    advanceSunward(w);
    advanceIntro(w);
    greetAtWell(w);
    advanceShops(w);
    advanceProduction(w);
    practiceContacts(w, refreshVision(w));
    noteEscape(w);
    noteHurt(w);
    settleShutdowns(w);
    settleClaymores(w);
    settleMeetings(w);
    watchStalls(w);
    watchHaulerStall(w);
    endCallIfOut(w);
    raiseCalls(w);
  }));
}

export function setWeaponOrder(
  world: World,
  weaponId: string,
  order: WeaponOrder | null,
): World {
  return playerCommand(world, (w) => {
    const me = playerVehicle(w);
    if (!vehicleStats(w, me).weapons.some((m) => m.part.id === weaponId))
      throw new Error(`Player has no weapon ${weaponId}`);
    if (order === null) {
      delete me.weaponOrders[weaponId];
      return;
    }
    const target = w.vehicles.find((v) => v.id === order.targetId);
    if (!target || target.id === me.id)
      throw new Error(`Bad target ${order.targetId}`);
    if (!playerSees(w, target.pos))
      throw new Refused({ id: "unseen" });
    if (order.aim !== "body" && !findPart(target, order.aim))
      throw new Error(`Target has no part ${order.aim}`);
    me.weaponOrders[weaponId] = order;
  });
}

export function setUtilityOrder(world: World, partId: string, order: UtilityOrder | null): World {
  return playerCommand(world, (w) => {
    const me = playerVehicle(w);
    if (order === null) {
      delete me.utilityOrders[partId];
      return;
    }
    const error = utilityOrderError(w, me, partId, order);
    if (error) throw new Refused(error);
    me.utilityOrders[partId] = order;
  });
}

export function reloadWeapon(world: World, weaponId: string): World {
  return playerCommand(world, (w) => {
    const mw = vehicleStats(w, playerVehicle(w)).weapons.find((m) => m.part.id === weaponId);
    if (!mw) throw new Error(`Player has no weapon ${weaponId}`);
    dropMagazine(mw.part);
  });
}

export function cutPlayerLine(world: World, harpoonId: string): World {
  return playerCommand(world, (w) => {
    cutLine(w, playerVehicle(w), harpoonId);
  });
}

export function setDirect(world: World, on: boolean): World {
  return playerCommand(world, (w) => {
    const me = playerVehicle(w);
    me.direct = on;
    if (on && me.order && me.order.kind !== 'brake') delete me.order.pace;
  });
}

export function setAutoRepair(world: World, on: boolean): World {
  return update(world, (w) => {
    w.player.autoRepair = on;
  });
}

export function setOverdrive(world: World, on: boolean): World {
  return update(world, (w) => {
    const refusal = on ? basicRefusal(w, 'overdrive') : null;
    if (refusal) throw new Refused(refusal);
    if (on && overdriveBlock(w, playerVehicle(w)) !== null) {
      throw new Error(`Cannot overdrive: the engine is at or below ${RULES.overdriveMinEngineShare * 100}% of its max HP`);
    }
    w.player.overdrive = on;
  });
}

export function setHeadlights(world: World, on: boolean): World {
  return { ...world, player: { ...world.player, headlights: on } };
}

export function setAutoFire(world: World, on: boolean): World {
  return update(world, (w) => {
    w.player.autoFire = on;
  });
}

export function hostileToPlayer(world: World, v: Vehicle): boolean {
  return isHostile(world, playerVehicle(world), v);
}

export function threatToPlayer(world: World, v: Vehicle): boolean {
  return v.id !== world.player.vehicleId && v.brain !== null && !isKnockedOut(v) && hostileToPlayer(world, v);
}

export type CarriedPart = { defId: string; wear: number; hp: number; rebuilt: boolean };
export type CarriedItem = ({ kind: 'part'; part: CarriedPart } | { kind: 'good'; good: string }) & { x: number; y: number; rot: Rot };

export type CarriedPaint = Partial<Record<(typeof PAINT_SLOTS)[number], string>>;

export type Carried = {
  seed: number | null;
  money: number | null;
  xp: number | null;
  ranks: Partial<Record<string, number>>;
  xpBySource: Partial<Record<string, number>>;
  perks: string[];
  paint: CarriedPaint | null;
  discovered: string[];
  knockouts: number | null;
  autoFire: boolean | null;
  autoRepair: boolean | null;
  fuel: number | null;
  supplies: number | null;
  costBasis: Record<string, number>;
  truck: { chassisId: string; items: CarriedItem[] } | null;
  storage: CarriedPart[];
  setup: unknown;
  quests: CarriedQuestVars;
  notes: string[];
  revisions: SavedRevisions;
  run: CarriedRun | null;
  refunded: number;
};

export type CarriedRun = {
  from: number;
  earned: number;
  wrecks: number;
  trucksSold: string[];
  hauler: { items: CarriedItem[]; fuel: number | null; supplies: number | null };
};

const KNOWN_SITES = new Set([...REGION.towns, ...REGION.locations].map((s) => s.id).concat(HOLLOW_ID));

export function carriedWorld(carried: Carried, kit: StartKit, mapOf: (setup: WorldSetup, seed: number, window: number) => BakedMap, freshSeed: () => number): World {
  const setup = carried.setup === undefined ? defaultSetup('roaming') : repairSetup(carried.setup);
  const truckKit = carriedKit(carried, kit);
  const seed = pick(carried.seed, freshSeed());
  const run = runIn(setup, carried.run);
  const from = startOutpost(run);
  const world = newWorld(seed, { ...truckKit, opening: null, intro: null, autoRepair: true }, mapOf(setup, seed, from), setup, true, carriedStart(seed, setup, from));
  carryPlayer(world, carried);
  world.player.money += carried.refunded;
  carryPaint(world, carried.paint);
  carryQuests(world, carried);
  carryPlayerTruck(world, carried, carried.truck !== null && truckKit !== kit);
  if (run) carryRun(world, run);
  world.player.costBasis = heldBasis(world, carried.costBasis);
  for (const truck of playerTrucks(world)) fitStores(world, truck);
  refreshVision(world);
  world.events = [];
  return world;
}

function carriedStart(seed: number, setup: WorldSetup, from: number): { pos: Vec; heading: number } {
  return modeMap(setup.mode) === 'icarus' ? townStart() : runStart(seed, from).player;
}

function runIn(setup: WorldSetup, run: CarriedRun | null): CarriedRun | null {
  if (run !== null && !modeRulesOf(setup.mode).run) throw new Error(`The save holds a Chaos Highway run, but its setup reads as ${setup.mode}, so the run cannot be rescued`);
  return run;
}

function startOutpost(run: CarriedRun | null): number {
  return run === null ? 0 : run.from;
}

function carryPlayerTruck(world: World, carried: Carried, stay: boolean): void {
  const garage = carryTruck(world, playerVehicle(world), carried.truck?.items ?? [], stay);
  storeParts(world, [...carried.storage, ...garage]);
}

function carryRun(world: World, carried: CarriedRun): void {
  const run = world.chaosHighway;
  if (!run) throw new Error('A carried Chaos Highway run needs a world with a run');
  run.earned = carried.earned;
  run.wrecks = carried.wrecks;
  outpostFactsAt(world, carried.from).trucksSold = [...carried.trucksSold];
  const hauler = haulerOf(world);
  hauler.items = hauler.items.filter((it) => it.kind === 'part' && isCore(it.part.defId));
  storeParts(world, carryTruck(world, hauler, carried.hauler.items, true));
  const stores = getResources(world, hauler);
  stores.fuel = pick(carried.hauler.fuel, stores.fuel);
  stores.supplies = pick(carried.hauler.supplies, stores.supplies);
}

function carriedKit(carried: Carried, kit: StartKit): StartKit {
  const saved = carried.truck;
  if (!saved || !(saved.chassisId in CHASSIS)) return kit;
  return { ...kit, chassis: saved.chassisId, parts: [], placed: [], storage: [], cargo: {}, costBasis: {} };
}

function pick<T>(value: T | null | undefined, fallback: T): T {
  return value === null || value === undefined ? fallback : value;
}

function carryPlayer(world: World, c: Carried): void {
  const p = world.player;
  Object.assign(p, {
    money: pick(c.money, p.money),
    knockouts: pick(c.knockouts, p.knockouts),
    autoFire: pick(c.autoFire, p.autoFire),
    autoRepair: pick(c.autoRepair, p.autoRepair),
    fuel: pick(c.fuel, p.fuel),
    supplies: pick(c.supplies, p.supplies),
    discovered: [...new Set([...p.discovered, ...c.discovered.filter((id) => knownSite(world, id))])],
  });
  p.xp = Math.max(0, pick(c.xp, 0));
  for (const skill of SKILL_IDS) p.ranks[skill] = Math.min(MAX_RANK, Math.max(0, Math.floor(pick(c.ranks[skill], 0))));
  for (const source of Object.keys(XP_SOURCES) as XpSource[]) p.xpBySource[source] = pick(c.xpBySource[source], 0);
  carryPerks(world, c.perks);
}

function carryPaint(world: World, paint: CarriedPaint | null): void {
  if (paint === null) return;
  for (const slot of PAINT_SLOTS) {
    const id = paint[slot];
    if (isPaletteId(id)) world.player.paint[slot] = id;
  }
}

function knownSite(world: World, id: string): boolean {
  return KNOWN_SITES.has(id) || (world.chaosHighway !== null && isOutpostSite(id));
}

function carryQuests(world: World, carried: Carried): void {
  const known = carried.notes.filter(isNoteId).map((id) => ({ id, turn: world.turn }));
  const repair = repairQuests({ ...carried.quests, session: null }, known, carried.revisions, QUESTS);
  world.player.quests = { ...repair.quests, live: null };
  world.player.notes = repair.notes;
}

function carryPerks(world: World, perks: string[]): void {
  for (const perk of perks.filter(isPerkId)) {
    const { skill, level } = PERKS[perk];
    if (skillLevel(world, skill) >= level && !pickedFromPair(world, perk)) world.player.perks.push(perk);
  }
}

function heldBasis(world: World, basis: Record<string, number>): Record<string, number> {
  const held = (good: string) => playerTrucks(world).some((truck) => truck.items.some((it) => it.kind === 'good' && it.good === good));
  return Object.fromEntries(Object.entries(basis).filter(([good]) => held(good)));
}

type TruckCarry = { truck: Vehicle; stay: boolean; coresDone: Set<string> };

function carryTruck(world: World, truck: Vehicle, items: CarriedItem[], stay: boolean): CarriedPart[] {
  const into: TruckCarry = { truck, stay, coresDone: new Set() };
  const goods: Record<string, number> = {};
  const garage: CarriedPart[] = [];
  for (const item of items) {
    if (item.kind === 'good') goods[item.good] = pick(goods[item.good], 0) + 1;
    else if (!carryPartItem(world, into, item)) garage.push(item.part);
  }
  carryGoods(world, truck, goods, stay);
  return garage;
}

function carryPartItem(world: World, into: TruckCarry, item: CarriedItem & { kind: 'part' }): boolean {
  const { defId } = item.part;
  if (!isKnownPart(defId)) return true;
  if (!isCore(defId)) return into.stay && placePart(world, into.truck, item);
  carryCore(world, into, item.part);
  return true;
}

function storeParts(world: World, parts: CarriedPart[]): void {
  world.player.storage.push(...parts.filter((p) => isKnownPart(p.defId) && !isCore(p.defId)).map((p) => carryPart(world, p)));
}

function isKnownPart(defId: string): boolean {
  try {
    partDef(defId);
    return true;
  } catch {
    return false;
  }
}

function isCore(defId: string): boolean {
  return partDef(defId).kind === 'core';
}

function carryPart(world: World, c: CarriedPart): PartInstance {
  const wear = Math.min(CONDITION.maxWear + 1, Math.max(0, Math.round(c.wear)));
  const part = makePart(world, c.defId, Math.min(wear, CONDITION.maxWear));
  part.wear = wear;
  if (c.rebuilt) part.rebuilt = true;
  carryHp(part, c.hp);
  return part;
}

function carryCore(world: World, into: TruckCarry, c: CarriedPart): void {
  const core = into.truck.items.find((it) => it.kind === 'part' && it.part.defId === c.defId && !into.coresDone.has(it.id));
  if (!into.stay || core?.kind !== 'part') return;
  into.coresDone.add(core.id);
  const carried = carryPart(world, c);
  core.part.wear = Math.min(carried.wear, CONDITION.maxWear);
  carryHp(core.part, carried.hp);
}

function placePart(world: World, truck: Vehicle, item: CarriedItem & { kind: 'part' }): boolean {
  const placed: GridItem = { id: newId(world, 'i'), kind: 'part', part: carryPart(world, item.part), x: item.x, y: item.y, rot: item.rot };
  if (placementError(gridOf(truck), truck.items, placed, placed.id)) return false;
  truck.items.push(placed);
  return true;
}

function carryGoods(world: World, truck: Vehicle, goods: Record<string, number>, stay: boolean): void {
  for (const [good, units] of Object.entries(goods)) {
    if (good in GOODS) world.player.money += (units - (stay ? addGoods(world, truck, good, units) : 0)) * GOODS[good].value;
  }
}
