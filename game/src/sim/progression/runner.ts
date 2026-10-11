import { chassisDef } from '../../data/chassis';
import { ECONOMY } from '../../data/goods';
import { NPCS } from '../../data/npcs';
import { RULES } from '../../data/rules';
import { TERRAIN } from '../../data/terrain';
import { alongOf, roadPoint, toRoad } from '../highway';
import { fightOrder, fightPoint, leadOf } from '../ai';
import { inCombat } from '../combat';
import { refitLoadout } from '../npc-loadout';
import { isStranded, vehicleStats } from '../stats';
import { hostileToPlayer, playerCanAct, setAutoFire, setAutoRepair, setMoveOrder } from '../world';
import { basicsRepairCost, chassisPrice, chassisSwapRefusal, repairCost, supplyRoom, type Supply } from '../economy';
import { abandonRun, canAbandonRun, canWaitForRoad, nextOutpost, outpostTrucks, reachedOutpostAt, waitForRoad, type Outpost } from '../fury-road';
import { corePart, goodsCount, mountedParts } from '../grid';
import { storePart } from '../inventory';
import { outpostBuyChassis, outpostBuyGood, outpostBuyPart, outpostBuySupply, outpostGoodPrice, outpostGoodRoom, outpostPartPrice, outpostRepairAll, outpostRepairBasics } from '../outposts';
import type { MoveOrder, NpcBrain, PartInstance, Vehicle, World } from '../types';
import { dist, type Vec } from '../vec';
import { playerSees } from '../vision';
import { isJunk } from '../wear';
import { aimGuns } from './aim';
import { gearBudget } from './gear';
import { mountBought, Orders, type BotTurn } from './orders';

const PATCH_GOODS = 4;
const FIGHTER = 'merc';
const HOP = TERRAIN.vision.radius;
const RECLICK_SHARE = 0.5;
const SUPPLIES: readonly Supply[] = ['fuel', 'supplies'];

export function runnerOrders(world: World): BotTurn {
  const o = new Orders(world);
  if (playerCanAct(o.world)) run(o);
  return { world: o.world, events: o.events, ledger: o.ledger, notes: o.notes };
}

function run(o: Orders): void {
  keepSwitches(o);
  if (o.me.job) return;
  const post = reachedOutpostAt(o.world);
  if (post) restock(o, post);
  if (canWaitForRoad(o.world)) o.run(waitForRoad);
  if (!handleStranded(o)) drive(o);
}

function handleStranded(o: Orders): boolean {
  if (canAbandonRun(o.world) && !canPatchOn(o.world, o.me)) {
    o.run(abandonRun);
    return true;
  }
  if (!isStranded(o.world, o.me) || inCombat(o.world, o.me)) return false;
  park(o);
  return true;
}

function park(o: Orders): void {
  if (o.me.order?.kind !== 'brake') o.run((w) => setMoveOrder(w, { kind: 'brake' }));
}

function keepSwitches(o: Orders): void {
  if (!o.world.player.autoRepair) o.run((w) => setAutoRepair(w, true));
  if (!o.world.player.autoFire) o.run((w) => setAutoFire(w, true));
  const foe = nearestFoe(o.world, o.me);
  if (foe) aimGuns(o, foe);
}

function drive(o: Orders): void {
  const foe = nearestFoe(o.world, o.me);
  const next = nextOutpost(o.world);
  if (foe && inCombat(o.world, o.me)) order(o, fighterOrder(o.world, o.me, foe));
  else if (next) hopToward(o, next.pad);
  else if (o.me.order) o.run((w) => setMoveOrder(w, null));
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

function restock(o: Orders, post: Outpost): void {
  repair(o);
  for (const kind of SUPPLIES) topUp(o, kind);
  buyPatchGoods(o);
  if (inCombat(o.world, o.me)) return;
  refitGear(o, post);
  buyTruck(o, post);
}

function refitGear(o: Orders, post: Outpost): void {
  const forSale = post.stock.filter((part) => !isJunk(part));
  const money = gearBudget(o.world, o.me, 'fighter');
  const owned = new Set(o.me.items.map((it) => it.id));
  const added = (v: Vehicle) => v.items.flatMap((it) => (it.kind === 'part' && !owned.has(it.id) ? [it] : []));
  const allowed = (v: Vehicle) => buysFor(added(v), forSale) !== null && cost(o, buysFor(added(v), forSale)!) <= money;
  const target = refitLoadout(o.world, { rngState: o.world.rngState }, o.me, { priorities: NPCS[FIGHTER].loadout.priorities, money, allowed });
  const kept = new Set(target.items.map((it) => it.id));
  for (const it of o.me.items.filter((it) => it.kind === 'part' && !kept.has(it.id))) o.run((w) => storePart(w, it.id), 'gear');
  const buys = buysFor(added(target), forSale)!;
  added(target).forEach((it, i) => {
    o.run((w) => outpostBuyPart(w, buys[i].id), 'gear');
    mountBought(o, buys[i].id, { x: it.x, y: it.y, rot: it.rot });
  });
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
    .filter((id) => chassisDef(id).value > current && chassisPrice(o.world, id) <= budget && chassisSwapRefusal(o.world, id) === null)
    .sort((a, b) => chassisDef(b).value - chassisDef(a).value);
  if (offers.length > 0) o.run((w) => outpostBuyChassis(w, offers[0]), 'gear');
}


function repair(o: Orders): void {
  const all = repairCost(o.world);
  const basics = basicsRepairCost(o.world);
  if (all > 0 && all <= o.world.player.money) o.run(outpostRepairAll, 'repairs');
  else if (basics > 0 && basics <= o.world.player.money) o.run(outpostRepairBasics, 'repairs');
}

function topUp(o: Orders, kind: Supply): void {
  const n = Math.min(supplyRoom(o.world, kind), Math.floor(o.world.player.money / ECONOMY.supplyPrice[kind]));
  if (n > 0) o.run((w) => outpostBuySupply(w, kind, n), kind);
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
