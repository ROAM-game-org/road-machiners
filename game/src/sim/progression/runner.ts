import { chassisDef } from '../../data/chassis';
import { ECONOMY } from '../../data/goods';
import { NPCS } from '../../data/npcs';
import { partDef } from '../../data/parts';
import { RULES } from '../../data/rules';
import { haulerOf, playerTrucks, playerVehicle, truckFor } from '../damage';
import { TERRAIN } from '../../data/terrain';
import { acrossOf, alongOf, outpostFort, roadPoint, toRoad } from '../highway';
import { fightOrder, fightPoint, leadOf } from '../ai';
import { inCombat } from '../combat';
import { refitLoadout } from '../npc-loadout';
import { isStranded, vehicleStats } from '../stats';
import { tankLeaks } from '../supplies';
import { hostileToPlayer, playerCanAct, setAutoFire, setAutoRepair, setMoveOrder } from '../world';
import { basicsRepairCost, chassisPrice, chassisSwapRefusal, repairCost, supplyRoom, type Supply } from '../economy';
import { abandonRun, canAbandonRun, canWaitForRoad, nextOutpost, outpostPad, outpostTrucks, reachedOutpostAt, waitForRoad, type Outpost } from '../fury-road';
import { corePart, goodsCount, mountedParts } from '../grid';
import { storePart } from '../inventory';
import { haulerTakes, outpostBuyChassis, outpostBuyGood, outpostBuyPart, outpostBuySupply, outpostGoodPrice, outpostGoodRoom, outpostPartPrice, outpostRepairAll, outpostRepairBasics } from '../outposts';
import type { MoveOrder, NpcBrain, PartInstance, Vehicle, World } from '../types';
import { dist, type Vec } from '../vec';
import { playerSees } from '../vision';
import { isJunk, maxHp } from '../wear';
import { FURY_ROAD } from '../../data/modes';
import { bestTruck, keepsPace, breakOffPoint, KEEP_TARGET_REACH, pickTarget, shouldBreakOff, STANDOFF } from './escort-tactics';
import { aimGuns } from './aim';
import { bestPlan, gearBudget, gearPlans } from './gear';
import { mountBought, Orders, type BotTurn } from './orders';

export type RoadStyle = 'escort' | 'sprinter';

const PATCH_GOODS = 4;
const HAULER_SHARE = 0.15;
const BESIDE = { ahead: 3, across: 2 };
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
  const foe = fires ? chosenFoe(o) : null;
  if (foe) aimGuns(o, foe);
}

function drive(o: Orders, style: RoadStyle): void {
  const next = nextOutpost(o.world);
  if (style === 'escort') return escort(o);
  if (next) hopToward(o, next.pad);
  else if (o.me.order) o.run((w) => setMoveOrder(w, null));
}

function escort(o: Orders): void {
  const hauler = haulerOf(o.world);
  const foe = chosenFoe(o);
  if (!foe) return driveTo(o, escortSpot(o.world, hauler));
  if (shouldBreakOff(conditionOf(o.me))) driveTo(o, breakOffPoint(hauler.pos, foe.pos));
  else order(o, fighterOrder(o.world, o.me, foe));
}

function chosenFoe(o: Orders): Vehicle | null {
  const hauler = haulerOf(o.world);
  const foes = o.world.vehicles.filter((v) => v.id !== o.me.id && hostileToPlayer(o.world, v) && playerSees(o.world, v.pos));
  const current = Object.values(o.me.weaponOrders).find((w) => w.targetId && foes.some((f) => f.id === w.targetId))?.targetId ?? null;
  const id = pickTarget(foes.map((f) => ({ id: f.id, pos: f.pos })), hauler.pos, current, KEEP_TARGET_REACH);
  return foes.find((f) => f.id === id) ?? null;
}

function conditionOf(me: Vehicle): number {
  const vital = [...mountedParts(me, 'core'), ...mountedParts(me, 'engine')];
  return Math.min(...vital.map((p) => p.hp / maxHp(p)));
}

function beside(world: World, pad: Vec, hauler: Vehicle): Vec {
  const run = world.furyRoad!;
  const site = outpostFort(world.seed, run.window, run.window + 1);
  const angle = Math.atan2(pad.y - site.pos.y, pad.x - site.pos.x);
  const sides = [1, -1].map((s) => ({ x: pad.x - s * Math.sin(angle) * PARKED_BESIDE, y: pad.y + s * Math.cos(angle) * PARKED_BESIDE }));
  return dist(sides[0], hauler.pos) >= dist(sides[1], hauler.pos) ? sides[0] : sides[1];
}

function escortSpot(world: World, hauler: Vehicle): Vec {
  const run = world.furyRoad!;
  const pad = outpostPad(world, run.window + 1);
  if (hauler.order?.kind === 'stopAt' || run.outposts.find((p) => p.milestone === run.window + 1)?.paid) return beside(world, pad, hauler);
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
  const clearance = Math.max(STANDOFF, vehicleStats(world, me).radius + vehicleStats(world, foe).radius + RULES.yieldDistance);
  return fightOrder(world, fighter, foe, fightPoint(world, fighter, foe, clearance));
}

function asFighter(me: Vehicle): Vehicle {
  const brain: NpcBrain = { templateId: FIGHTER, driver: 'runner', traits: [...NPCS[FIGHTER].traits], personality: 'grim', goals: [], noticed: {}, tracks: {}, hurt: 0, attackers: {}, goal: null, home: me.pos, stepIndex: 0, memories: [] };
  return { ...me, brain };
}

function order(o: Orders, next: MoveOrder): void {
  if (JSON.stringify(o.me.order) !== JSON.stringify(next)) o.run((w) => setMoveOrder(w, next));
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
  if (style === 'sprinter') {
    refitGear(o, 1);
    return buyTruck(o, post, style);
  }
  buyTruck(o, post, style);
  haulerGear(o, gearBudget(o.world, o.me, 'fighter') * HAULER_SHARE);
  refitGear(o, 1 - HAULER_SHARE);
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

function buyTruck(o: Orders, post: Outpost, style: RoadStyle): void {
  const budget = gearBudget(o.world, o.me, 'fighter');
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
