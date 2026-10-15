import { chassisDef } from '../../data/chassis';
import { ECONOMY } from '../../data/goods';
import { NPCS } from '../../data/npcs';
import { partDef } from '../../data/parts';
import { haulerOf, playerTrucks, playerVehicle } from '../damage';
import { TERRAIN } from '../../data/terrain';
import { alongOf, outpostFort, roadPoint, toRoad } from '../highway';
import { ENGINE_HEAT } from '../../data/wear';
import { canDouse, douseEngine } from '../engine-heat';
import { inCombat } from '../combat';
import { refitLoadout } from '../npc-loadout';
import { isStranded, vehicleStats, type MountedWeapon } from '../stats';
import { tankLeaks } from '../supplies';
import { playerCanAct, setAutoFire, setAutoRepair, setMoveOrder, setWeaponOrder } from '../world';
import { basicsRepairCost, chassisPrice, chassisSwapRefusal, repairCost, supplyRoom, type Supply } from '../economy';
import { abandonRun, canAbandonRun, canWaitForRoad, nextOutpost, onOutpostPad, outpostPad, outpostTrucks, reachedOutpostAt, waitForRoad, type Outpost } from '../fury-road';
import { isFree } from '../spawn';
import { RULES } from '../../data/rules';
import { startRepair } from '../jobs';
import { corePart, goodsCount, mountedParts } from '../grid';
import { storePart } from '../inventory';
import { outpostBuyChassis, outpostBuyGood, outpostBuyPart, outpostBuySupply, outpostGoodPrice, outpostGoodRoom, outpostPartPrice, outpostRepairAll, outpostRepairBasics } from '../outposts';
import type { MoveOrder, PartInstance, Vehicle, WeaponOrder, World } from '../types';
import { dist, type Vec } from '../vec';
import { isJunk } from '../wear';
import { FURY_ROAD } from '../../data/modes';
import { escortFoe, escortMove, gunTarget, hostilesSeen, unlessStuck, type Stall } from './escort-brain';
import { aimFor } from './aim';
import { armorHauler } from './escort-gear';
import { bestTruck, keepsPace } from './escort-tactics';
import { mountBought, Orders, type BotTurn } from './orders';

export type RoadStyle = 'escort' | 'sprinter';

const PATCH_GOODS = 4;
const PARKED_BESIDE = 2.2;
const SAFE_HEAT = 1;
const FIGHTER = 'merc';
const HOP = TERRAIN.vision.radius;
const RECLICK_SHARE = 0.5;
const SUPPLIES: readonly Supply[] = ['fuel', 'supplies'];

export function runnerOrders(world: World, style: RoadStyle): BotTurn {
  const o = new Orders(world);
  if (playerCanAct(o.world)) run(o, style);
  return { world: o.world, events: o.events, ledger: o.ledger, notes: o.notes };
}

function run(o: Orders, style: RoadStyle): void {
  keepSwitches(o, style);
  if (o.me.job) return;
  const post = reachedOutpostAt(o.world);
  if (post) restock(o, post, style);
  if (canWaitForRoad(o.world)) o.run(waitForRoad);
  if (!handleStranded(o)) drive(o, style);
}

const WEDGED = new Map<string, number>();

function givesUpOnRun(o: Orders): boolean {
  const key = `${o.world.seed}:${o.me.id}`;
  if (!canAbandonRun(o.world) || canPatchOn(o.world, o.me)) {
    WEDGED.delete(key);
    return false;
  }
  if (playerTrucks(o.world).some((truck) => isStranded(o.world, truck))) return true;
  const since = WEDGED.get(key) ?? o.world.turn;
  WEDGED.set(key, since);
  return o.world.turn - since >= FURY_ROAD.hauler.stallTurns;
}

function handleStranded(o: Orders): boolean {
  if (givesUpOnRun(o)) {
    o.run(abandonRun);
    return true;
  }
  if (!needsPatching(o) || inCombat(o.world, o.me)) return false;
  park(o);
  patchLeakingTank(o);
  return true;
}

function needsPatching(o: Orders): boolean {
  return isStranded(o.world, o.me) || tankLeaks(o.me) || brokenCore(o);
}

function brokenCore(o: Orders): boolean {
  return (goodsCount(o.me).parts ?? 0) > 0 && mountedParts(o.me, 'core').some((p) => p.hp <= 0);
}

function tankHoled(o: Orders): boolean {
  return corePart(o.me, 'tank').hp <= 0 && (goodsCount(o.me).parts ?? 0) > 0;
}

function patchLeakingTank(o: Orders): void {
  const tank = corePart(o.me, 'tank');
  const canPatch = tank.hp <= 0 && !o.me.job && o.me.speed <= RULES.parkedSpeed && (goodsCount(o.me).parts ?? 0) > 0;
  if (canPatch) o.run((w) => startRepair(w, tank.id));
}

function park(o: Orders): void {
  if (o.me.order?.kind !== 'brake') o.run((w) => setMoveOrder(w, { kind: 'brake' }));
}

function keepSwitches(o: Orders, style: RoadStyle): void {
  const auto = style === 'sprinter' || !tankHoled(o);
  if (o.world.player.autoRepair !== auto) o.run((w) => setAutoRepair(w, auto));
  if (style === 'escort') coolEngine(o);
  const fires = style === 'escort';
  if (o.world.player.autoFire !== fires) o.run((w) => setAutoFire(w, fires));
}

function coolEngine(o: Orders): void {
  if (o.world.player.engineHeat >= ENGINE_HEAT.warnAt && canDouse(o.world)) o.run(douseEngine);
}

function drive(o: Orders, style: RoadStyle): void {
  const next = nextOutpost(o.world);
  if (style === 'escort') return escort(o);
  if (next) hopToward(o, next.pad);
  else if (o.me.order) o.run((w) => setMoveOrder(w, null));
}

function escort(o: Orders): void {
  const hauler = haulerOf(o.world);
  const foe = escortFoe(o.world, o.me);
  const stall = stallOf(o.world, o.me);
  const parking = !foe && haulerAtPad(o.world, hauler);
  const order = parking ? unlessStuck(o.world, o.me, stall, () => parkBeside(o.world, hauler)) : escortMove(o.world, o.me, foe, stall);
  if (!sameMove(o.me.order, order)) o.run((w) => setMoveOrder(w, order));
  if (foe) focusFire(o, foe);
}

function parkBeside(world: World, hauler: Vehicle): MoveOrder {
  return { kind: 'stopAt', dest: beside(world, outpostPad(world, world.furyRoad!.window + 1), hauler) };
}

function sameMove(a: MoveOrder | null, b: MoveOrder): boolean {
  return a?.kind === 'stopAt' && b.kind === 'stopAt' && a.dest.x === b.dest.x && a.dest.y === b.dest.y;
}

const STALLS = new Map<string, Stall>();

function stallOf(world: World, me: Vehicle): Stall {
  const key = `${world.seed}:${me.id}`;
  const known = STALLS.get(key);
  if (known) return known;
  const fresh: Stall = { turn: -1, at: { ...me.pos }, stalled: 0, recovery: 0, goal: null };
  STALLS.set(key, fresh);
  return fresh;
}

function focusFire(o: Orders, focus: Vehicle): void {
  o.run((w) => setAutoFire(w, false));
  const foes = hostilesSeen(o.world);
  for (const weapon of vehicleStats(o.world, o.me).weapons) {
    const order = gunOrder(o.world, weapon, gunTarget(o.world, o.me, weapon, focus, foes));
    if (sameOrder(o.me.weaponOrders[weapon.part.id] ?? null, order)) continue;
    o.run((w) => setWeaponOrder(w, weapon.part.id, order));
  }
}

function gunOrder(world: World, weapon: MountedWeapon, foe: Vehicle | null): WeaponOrder | null {
  return foe ? { targetId: foe.id, aim: aimFor(world, foe, weapon) } : null;
}

function sameOrder(a: WeaponOrder | null, b: WeaponOrder | null): boolean {
  if (a === null || b === null) return a === b;
  return a.targetId === b.targetId && a.aim === b.aim;
}

function haulerAtPad(world: World, hauler: Vehicle): boolean {
  const run = world.furyRoad!;
  const pad = outpostPad(world, run.window + 1);
  const toPad = hauler.order?.kind === 'stopAt' && dist(hauler.order.dest, pad) === 0;
  if (toPad || onOutpostPad(world, hauler.pos, run.window + 1)) return true;
  return run.outposts.find((p) => p.milestone === run.window + 1)?.paid === true;
}

function beside(world: World, pad: Vec, hauler: Vehicle): Vec {
  const run = world.furyRoad!;
  const site = outpostFort(world.seed, run.window, run.window + 1);
  const angle = Math.atan2(pad.y - site.pos.y, pad.x - site.pos.x);
  const spot = (along: number, across: number) => ({ x: pad.x + Math.cos(angle) * along - Math.sin(angle) * across, y: pad.y + Math.sin(angle) * along + Math.cos(angle) * across });
  const me = playerVehicle(world);
  const radius = vehicleStats(world, me).radius;
  const free = PAD_SPOTS.map(([along, across]) => spot(along, across)).filter((p) => onOutpostPad(world, p, run.window + 1) && isFree(world, p, radius, me.id));
  const far = (p: Vec) => dist(p, hauler.pos);
  return free.reduce<Vec | null>((best, p) => (!best || far(p) > far(best) ? p : best), null) ?? spot(0, PARKED_BESIDE);
}

const PAD_SPOTS: [number, number][] = [-2, -1, 0, 1, 2].flatMap((along) => [-3, -2, -1, 0, 1, 2, 3].map((across): [number, number] => [along, across]));

function hopToward(o: Orders, pad: Vec): void {
  const now = o.me.order;
  if (now?.kind === 'stopAt' && dist(now.dest, o.me.pos) <= HOP && dist(now.dest, o.me.pos) > HOP * RECLICK_SHARE) return;
  driveTo(o, nextHop(o.world, o.me, pad));
}

function nextHop(world: World, me: Vehicle, pad: Vec): Vec {
  const window = world.furyRoad?.window ?? 0;
  const along = alongOf(world.seed, toRoad(world.seed, window, me.pos)) + HOP;
  return along >= alongOf(world.seed, toRoad(world.seed, window, pad)) ? pad : roadPoint(world.seed, window, along, 0);
}

function canPatchOn(world: World, me: Vehicle): boolean {
  if (world.player.fuel <= 0) return false;
  const drive = [...mountedParts(me, 'engine').slice(0, 1), corePart(me, 'transmission')];
  return (goodsCount(me).parts ?? 0) > 0 && drive.length === 2 && drive.every((part) => !isJunk(part));
}

function parkedTrucks(world: World): Vehicle[] {
  return playerTrucks(world).filter((truck) => reachedOutpostAt(world, truck) !== null);
}

function restock(o: Orders, post: Outpost, style: RoadStyle): void {
  const haulerShare = haulerBillShare(o.world);
  for (const truck of parkedTrucks(o.world)) {
    repair(o, truck);
    for (const kind of SUPPLIES) topUp(o, kind, truck);
  }
  if (!inCombat(o.world, o.me)) restockGear(o, post, style, haulerShare);
  buyPatchGoods(o);
}

function restockGear(o: Orders, post: Outpost, style: RoadStyle, haulerShare: number): void {
  if (style === 'sprinter') {
    refitGear(o, style);
    return buyTruck(o, post, style);
  }
  restockEscort(o, post, style, haulerShare);
}

function runBudget(world: World): number {
  return world.player.money;
}

function haulerBillShare(world: World): number {
  const hauler = repairCost(world, haulerOf(world));
  const total = hauler + repairCost(world, playerVehicle(world));
  return total > 0 ? hauler / total : 0;
}

function restockEscort(o: Orders, post: Outpost, style: RoadStyle, haulerShare: number): void {
  refitGear(o, style);
  armorHauler(o, haulerShare);
  buyTruck(o, post, style);
}

function refitGear(o: Orders, style: RoadStyle): void {
  const forSale = reachedOutpostAt(o.world)!.stock.filter((part) => !isJunk(part));
  const money = runBudget(o.world);
  const owned = new Set(o.me.items.map((it) => it.id));
  const added = (v: Vehicle) => v.items.flatMap((it) => (it.kind === 'part' && !owned.has(it.id) ? [it] : []));
  const paced = (v: Vehicle) => style === 'sprinter' || keepsPace(vehicleStats(o.world, v).maxSpeed, FURY_ROAD.hauler.hurry);
  const allowed = (v: Vehicle) => added(v).every(sturdy) && paced(v) && buysFor(added(v), forSale) !== null && cost(o, buysFor(added(v), forSale)!) <= money;
  const target = refitLoadout(o.world, { rngState: o.world.rngState }, o.me, { priorities: NPCS[FIGHTER].loadout.priorities, money, allowed, paysFuel: false });
  const kept = new Set(target.items.map((it) => it.id));
  for (const it of o.me.items.filter((it) => it.kind === 'part' && !kept.has(it.id))) o.run((w) => storePart(w, it.id), 'gear');
  const buys = buysFor(added(target), forSale)!;
  added(target).forEach((it, i) => {
    o.run((w) => outpostBuyPart(w, buys[i].id), 'gear');
    mountBought(o, buys[i].id, { x: it.x, y: it.y, rot: it.rot });
  });
}

function sturdy(item: { part: PartInstance }): boolean {
  const def = partDef(item.part.defId);
  return def.kind !== 'engine' || def.heat <= SAFE_HEAT;
}

function buysFor(items: { part: PartInstance }[], forSale: PartInstance[]): PartInstance[] | null {
  const left = [...forSale];
  const buys: PartInstance[] = [];
  for (const it of items) {
    const i = left.findIndex((p) => p.defId === it.part.defId);
    if (i < 0) return null;
    buys.push(...left.splice(i, 1));
  }
  return buys;
}

function cost(o: Orders, parts: PartInstance[]): number {
  return parts.reduce((sum, p) => sum + outpostPartPrice(o.world, p), 0);
}

function buyTruck(o: Orders, post: Outpost, style: RoadStyle): void {
  const budget = runBudget(o.world);
  const current = chassisDef(o.me.chassisId).value;
  const offers = outpostTrucks(o.world, post).filter((id) => chassisDef(id).value > current && chassisSwapRefusal(o.world, id) === null && keepsKit(o, id, style)).map((id) => ({ id, value: chassisDef(id).value, price: chassisPrice(o.world, id) }));
  const best = bestTruck(offers, current, budget);
  if (best) o.run((w) => outpostBuyChassis(w, best), 'gear');
}

function keepsKit(o: Orders, chassisId: string, style: RoadStyle): boolean {
  const after = outpostBuyChassis(o.world, chassisId);
  const me = playerVehicle(after);
  const mountedCount = (v: Vehicle) => mountedParts(v).filter((p) => partDef(p.defId).kind !== 'core').length;
  return !isStranded(after, me) && mountedCount(me) === mountedCount(o.me) && (style === 'sprinter' || keepsPace(vehicleStats(after, me).maxSpeed, FURY_ROAD.hauler.hurry));
}


function repair(o: Orders, truck: Vehicle): void {
  const all = repairCost(o.world, truck);
  const basics = basicsRepairCost(o.world, truck);
  if (all > 0 && all <= o.world.player.money) o.run((w) => outpostRepairAll(w, truck.id), 'repairs');
  else if (basics > 0 && basics <= o.world.player.money) o.run((w) => outpostRepairBasics(w, truck.id), 'repairs');
}

function topUp(o: Orders, kind: Supply, truck: Vehicle): void {
  const n = Math.min(supplyRoom(o.world, kind, truck), Math.floor(o.world.player.money / ECONOMY.supplyPrice[kind]));
  if (n > 0) o.run((w) => outpostBuySupply(w, kind, n, truck.id), kind);
}

function buyPatchGoods(o: Orders): void {
  const want = PATCH_GOODS - (goodsCount(o.me).parts ?? 0);
  const n = Math.min(want, outpostGoodRoom(o.me), Math.floor(o.world.player.money / outpostGoodPrice()));
  if (n > 0) o.run((w) => outpostBuyGood(w, n), 'goodsBought');
}

function driveTo(o: Orders, dest: Vec): void {
  const order = o.me.order;
  if (order?.kind === 'stopAt' && order.dest.x === dest.x && order.dest.y === dest.y) return;
  o.run((w) => setMoveOrder(w, { kind: 'stopAt', dest }));
}
