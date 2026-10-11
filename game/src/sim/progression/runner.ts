import { chassisDef } from '../../data/chassis';
import { ECONOMY } from '../../data/goods';
import { inCombat } from '../combat';
import { isStranded } from '../stats';
import { hostileToPlayer, playerCanAct, setAutoFire, setAutoRepair, setMoveOrder } from '../world';
import { basicsRepairCost, chassisPrice, chassisSwapRefusal, repairCost, supplyRoom, type Supply } from '../economy';
import { abandonRun, canAbandonRun, canWaitForRoad, nextOutpost, outpostTrucks, reachedOutpostAt, waitForRoad, type Outpost } from '../fury-road';
import { corePart, goodsCount, mountedParts } from '../grid';
import { canStowPart, installSpot, storePart } from '../inventory';
import { outpostBuyChassis, outpostBuyGood, outpostBuyPart, outpostBuySupply, outpostGoodPrice, outpostGoodRoom, outpostPartPrice, outpostRepairAll, outpostRepairBasics } from '../outposts';
import type { Vehicle, World } from '../types';
import { dist, type Vec } from '../vec';
import { playerSees } from '../vision';
import { isJunk } from '../wear';
import { aimGuns } from './aim';
import { bestPlan, gearBudget, gearPlans, probe, type Offer, type PartItem, type Plan as GearPlan } from './gear';

type Plan = GearPlan<Offer>;
import { mountBought, Orders, type BotTurn } from './orders';

const PATCH_GOODS = 4;
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
  if (foe && inCombat(o.world, o.me)) driveTo(o, foe.pos);
  else if (next) driveTo(o, next.pad);
  else if (o.me.order) o.run((w) => setMoveOrder(w, null));
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
  buyTruck(o, post);
  for (let plan = bestGear(o); plan; plan = bestGear(o)) buyGear(o, plan);
}

function buyTruck(o: Orders, post: Outpost): void {
  const budget = gearBudget(o.world, o.me, 'fighter');
  const current = chassisDef(o.me.chassisId).value;
  const offers = outpostTrucks(o.world, post)
    .filter((id) => chassisDef(id).value > current && chassisPrice(o.world, id) <= budget && chassisSwapRefusal(o.world, id) === null)
    .sort((a, b) => chassisDef(b).value - chassisDef(a).value);
  if (offers.length > 0) o.run((w) => outpostBuyChassis(w, offers[0]), 'gear');
}

function bestGear(o: Orders): Plan | null {
  const post = reachedOutpostAt(o.world);
  if (!post) return null;
  const offers = post.stock.filter((part) => canStowPart(o.me, part)).map((part) => ({ part, price: outpostPartPrice(o.world, part) }));
  const plans = gearPlans(o.world, o.me, offers, { job: 'fighter', skip: [], resale: () => 0 });
  return bestPlan(plans, gearBudget(o.world, o.me, 'fighter'));
}

function buyGear(o: Orders, plan: Plan): void {
  const replaced = plan.replaces;
  if (replaced) o.run((w) => storePart(w, replaced.id));
  o.run((w) => outpostBuyPart(w, plan.offer.part.id), 'gear');
  const held = o.me.items.find((it): it is PartItem => it.kind === 'part' && it.part.id === plan.offer.part.id);
  const spot = installSpot(o.me, held ?? probe(plan.offer.part));
  if (!spot) throw new Error(`No mount for the bought ${plan.offer.part.defId}`);
  mountBought(o, plan.offer.part.id, spot);
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
