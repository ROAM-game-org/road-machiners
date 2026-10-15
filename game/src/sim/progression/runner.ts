import { chassisDef } from '../../data/chassis';
import { FURY_ROAD } from '../../data/modes';
import { ECONOMY } from '../../data/goods';
import { NPCS } from '../../data/npcs';
import { partDef } from '../../data/parts';
import { RULES } from '../../data/rules';
import { haulerOf, playerTrucks, playerVehicle, truckFor } from '../damage';
import { TERRAIN } from '../../data/terrain';
import { acrossOf, alongOf, roadPoint, toRoad } from '../highway';
import { fightOrder, fightPoint, leadOf } from '../ai';
import { inCombat } from '../combat';
import { refitLoadout } from '../npc-loadout';
import { isStranded, vehicleStats } from '../stats';
import { tankLeaks } from '../supplies';
import { hostileToPlayer, playerCanAct, setAutoFire, setAutoRepair, setMoveOrder } from '../world';
import { basicsRepairCost, chassisPrice, chassisSwapRefusal, repairCost, supplyRoom, type Supply } from '../economy';
import { abandonRun, canAbandonRun, canDriveOn, driveOn, nextOutpost, outpostTrucks, reachedOutpostAt, type Outpost } from '../fury-road';
import { yardSpots } from '../outpost-gates';
import { corePart, goodsCount, mountedParts } from '../grid';
import { storePart } from '../inventory';
import { haulerTakes, outpostBuyChassis, outpostBuyGood, outpostBuyPart, outpostBuySupply, outpostGoodPrice, outpostGoodRoom, outpostPartPrice, outpostRepairAll, outpostRepairBasics } from '../outposts';
import type { MoveOrder, NpcBrain, PartInstance, Vehicle, World } from '../types';
import { dist, type Vec } from '../vec';
import { playerSees } from '../vision';
import { isJunk } from '../wear';
import { aimGuns } from './aim';
import { bestPlan, gearBudget, gearPlans } from './gear';
import { mountBought, Orders, type BotTurn } from './orders';

export type RoadStyle = 'escort' | 'sprinter';

const PATCH_GOODS = 4;
const HAULER_SHARE = 0.15;
const BESIDE = { ahead: 3, across: 2 };
const SAFE_HEAT = 1;
const FOE_REACH = 1;
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
  if (canDriveOn(o.world)) o.run(driveOn);
  if (!handleStranded(o)) drive(o, style);
}

function handleStranded(o: Orders): boolean {
  if (canAbandonRun(o.world) && !canPatchOn(o.world, o.me)) {
    o.run(abandonRun);
    return true;
  }
  if (!(isStranded(o.world, o.me) || tankLeaks(o.me)) || inCombat(o.world, o.me)) return false;
  park(o);
  return true;
}

function park(o: Orders): void {
  if (o.me.order?.kind !== 'brake') o.run((w) => setMoveOrder(w, { kind: 'brake' }));
}

function keepSwitches(o: Orders, style: RoadStyle): void {
  if (!o.world.player.autoRepair) o.run((w) => setAutoRepair(w, true));
  const fires = style === 'escort';
  if (o.world.player.autoFire !== fires) o.run((w) => setAutoFire(w, fires));
  const foe = fires ? nearestFoe(o.world, o.me) : null;
  if (foe) aimGuns(o, foe);
}

function drive(o: Orders, style: RoadStyle): void {
  const next = nextOutpost(o.world);
  if (style === 'escort') return escort(o);
  if (next) hopToward(o, next.spots.truck);
  else if (o.me.order) o.run((w) => setMoveOrder(w, null));
}

function escort(o: Orders): void {
  const hauler = haulerOf(o.world);
  const foe = foeNear(o.world, o.me, hauler);
  if (foe) order(o, fighterOrder(o.world, o.me, foe));
  else driveTo(o, escortSpot(o.world, hauler));
}

function foeNear(world: World, me: Vehicle, hauler: Vehicle): Vehicle | null {
  const foes = world.vehicles.filter((v) => v.id !== me.id && hostileToPlayer(world, v) && playerSees(world, v.pos) && dist(v.pos, hauler.pos) <= FOE_REACH * FURY_ROAD.pacing.near);
  return foes.sort((a, b) => dist(hauler.pos, a.pos) - dist(hauler.pos, b.pos))[0] ?? null;
}

function escortSpot(world: World, hauler: Vehicle): Vec {
  const run = world.furyRoad!;
  if (hauler.order?.kind === 'stopAt' || run.outposts.find((p) => p.milestone === run.window + 1)?.paid) return yardSpots(world, run.window + 1).truck;
  const at = toRoad(run.window, hauler.pos);
  return roadPoint(world.seed, run.window, alongOf(world.seed, at) + BESIDE.ahead, acrossOf(world.seed, at) + BESIDE.across);
}

function hopToward(o: Orders, pad: Vec): void {
  const now = o.me.order;
  if (now?.kind === 'stopAt' && dist(now.dest, o.me.pos) <= HOP && dist(now.dest, o.me.pos) > HOP * RECLICK_SHARE) return;
  driveTo(o, nextHop(o.world, o.me, pad));
}

function nextHop(world: World, me: Vehicle, pad: Vec): Vec {
  const window = world.furyRoad?.window ?? 0;
  const along = alongOf(world.seed, toRoad(window, me.pos)) + HOP;
  return along >= alongOf(world.seed, toRoad(window, pad)) ? pad : roadPoint(world.seed, window, along, 0);
}

function fighterOrder(world: World, me: Vehicle, foe: Vehicle): MoveOrder {
  const fighter = asFighter(me);
  if (vehicleStats(world, me).weapons.length === 0) return { kind: 'stopAt', dest: leadOf(foe) };
  const clearance = vehicleStats(world, me).radius + vehicleStats(world, foe).radius + RULES.yieldDistance;
  return fightOrder(world, fighter, foe, fightPoint(world, fighter, foe, clearance));
}

function asFighter(me: Vehicle): Vehicle {
  const brain: NpcBrain = { templateId: FIGHTER, driver: 'runner', traits: [...NPCS[FIGHTER].traits], personality: 'grim', goals: [], noticed: {}, tracks: {}, hurt: 0, attackers: {}, goal: null, home: me.pos, stepIndex: 0, memories: [] };
  return { ...me, brain };
}

function order(o: Orders, next: MoveOrder): void {
  if (JSON.stringify(o.me.order) !== JSON.stringify(next)) o.run((w) => setMoveOrder(w, next));
}

function nearestFoe(world: World, me: Vehicle): Vehicle | null {
  const foes = world.vehicles.filter((v) => v.id !== me.id && hostileToPlayer(world, v) && playerSees(world, v.pos));
  return foes.sort((a, b) => dist(me.pos, a.pos) - dist(me.pos, b.pos))[0] ?? null;
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
  for (const truck of parkedTrucks(o.world)) {
    repair(o, truck);
    for (const kind of SUPPLIES) topUp(o, kind, truck);
  }
  buyPatchGoods(o);
  if (inCombat(o.world, o.me)) return;
  const share = style === 'escort' ? HAULER_SHARE : 0;
  if (share > 0) haulerGear(o, gearBudget(o.world, o.me, 'fighter') * share);
  refitGear(o, 1 - share);
  buyTruck(o, post);
}

function haulerGear(o: Orders, budget: number): void {
  const hauler = haulerOf(o.world);
  let left = budget;
  for (let plan = nextHaulerBuy(o, hauler, left); plan; plan = nextHaulerBuy(o, hauler, left)) {
    if (plan.replaces) o.run((w) => storePart(w, plan.replaces!.id, hauler.id), 'gear');
    o.run((w) => outpostBuyPart(w, plan.offer.part.id, hauler.id), 'gear');
    mountBought(o, plan.offer.part.id, plan.spot, hauler.id);
    left -= plan.offer.price;
  }
}

function nextHaulerBuy(o: Orders, hauler: Vehicle, budget: number) {
  const post = reachedOutpostAt(o.world, hauler);
  if (!post) return null;
  const offers = post.stock.filter((part) => !isJunk(part) && haulerTakes(part)).map((part) => ({ part, price: outpostPartPrice(o.world, part, hauler.id) }));
  const buyer = { job: 'hauler' as const, skip: [], resale: () => 0 };
  return bestPlan(gearPlans(o.world, truckFor(o.world, hauler.id), offers, buyer), Math.min(budget, o.world.player.money));
}

function refitGear(o: Orders, share: number): void {
  const forSale = reachedOutpostAt(o.world)!.stock.filter((part) => !isJunk(part));
  const money = gearBudget(o.world, o.me, 'fighter') * share;
  const owned = new Set(o.me.items.map((it) => it.id));
  const added = (v: Vehicle) => v.items.flatMap((it) => (it.kind === 'part' && !owned.has(it.id) ? [it] : []));
  const allowed = (v: Vehicle) => added(v).every(sturdy) && buysFor(added(v), forSale) !== null && cost(o, buysFor(added(v), forSale)!) <= money;
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

function buyTruck(o: Orders, post: Outpost): void {
  const budget = gearBudget(o.world, o.me, 'fighter');
  const current = chassisDef(o.me.chassisId).value;
  const offers = outpostTrucks(o.world, post)
    .filter((id) => chassisDef(id).value > current && chassisPrice(o.world, id) <= budget && chassisSwapRefusal(o.world, id) === null && keepsKit(o, id))
    .sort((a, b) => chassisDef(b).value - chassisDef(a).value);
  if (offers.length > 0) o.run((w) => outpostBuyChassis(w, offers[0]), 'gear');
}

function keepsKit(o: Orders, chassisId: string): boolean {
  const after = outpostBuyChassis(o.world, chassisId);
  const me = playerVehicle(after);
  const mountedCount = (v: Vehicle) => mountedParts(v).filter((p) => partDef(p.defId).kind !== 'core').length;
  return !isStranded(after, me) && mountedCount(me) === mountedCount(o.me);
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
