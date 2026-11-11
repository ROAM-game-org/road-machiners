import { CHAOS_HIGHWAY } from '../data/modes';
import { ECONOMY, GOODS } from '../data/goods';
import { playerVehicle, truckFor } from './damage';
import { haulerRefusal } from './garage';
import { getResources } from './resources';
import { applyPaint, spread, takeSellablePart, basicParts, basicsRepairCost, allParts, garageParts, garageRepair, partRepairCost, partTradePrice, pay, receiveBoughtPart, supplyCharge, swapChassis, repairCost, supplyRoom, type Supply } from './economy';
import { outpostFactsAt, outpostTrucks, reachedOutpostAt, type Outpost } from './chaos-highway';
import { addGoods, cargoRoom, removeGoods } from './inventory';
import { goodsCount } from './grid';
import type { TruckPaint } from '../data/chassis';
import type { PartInstance, Vehicle, World } from './types';
import { playerCommand, Refused } from './world';
import { chargeM, payoutM, requireWholeM } from './money';

const REPAIR_GOOD = 'parts';

export function requireOutpost(world: World, truckId?: string): Outpost {
  const post = reachedOutpostAt(world, truckFor(world, truckId));
  if (!post) throw new Error('Not parked at a reached outpost');
  return post;
}

export function outpostRepairAll(world: World, truckId?: string): World {
  return playerCommand(world, (w) => {
    requireOutpost(w, truckId);
    const truck = truckFor(w, truckId);
    repairFor(w, repairCost(w, truck), garageParts(w, truck));
  });
}

export function outpostRepairBasics(world: World, truckId?: string): World {
  return playerCommand(world, (w) => {
    requireOutpost(w, truckId);
    const truck = truckFor(w, truckId);
    repairFor(w, basicsRepairCost(w, truck), basicParts(w, truck));
  });
}

export function outpostRepairPart(world: World, partId: string, truckId?: string): World {
  return playerCommand(world, (w) => {
    requireOutpost(w, truckId);
    const part = allParts(truckFor(w, truckId)).find((p) => p.id === partId);
    if (!part) throw new Error(`No truck part ${partId}`);
    pay(w, partRepairCost(w, part));
    garageRepair(part);
  });
}

function repairFor(world: World, cost: number, parts: PartInstance[]): void {
  pay(world, cost);
  for (const part of parts) garageRepair(part);
}

export function outpostBuySupply(world: World, kind: Supply, n: number, truckId?: string): World {
  return playerCommand(world, (w) => {
    requireOutpost(w, truckId);
    const truck = truckFor(w, truckId);
    if (!Number.isInteger(n) || n <= 0 || n > supplyRoom(w, kind, truck)) throw new Error(`Cannot buy ${n} ${kind}`);
    pay(w, supplyCharge(kind, n));
    getResources(w, truck)[kind] += n;
  });
}

export function outpostPartPrice(world: World, part: PartInstance, truckId?: string): number {
  return partTradePrice(world, truckFor(world, truckId), part, 'buy');
}

export function outpostBuyPart(world: World, partId: string, truckId?: string): World {
  return playerCommand(world, (w) => {
    const post = requireOutpost(w, truckId);
    const truck = truckFor(w, truckId);
    const part = post.stock.find((p) => p.id === partId);
    if (!part) throw new Error(`Outpost ${post.milestone} has no part ${partId}`);
    const refused = haulerRefusal(w, truck.id, part);
    if (refused) throw new Refused(refused);
    pay(w, outpostPartPrice(w, part, truck.id));
    const facts = outpostFactsAt(w, post.milestone);
    facts.stock = facts.stock.filter((p) => p.id !== partId);
    receiveBoughtPart(w, part);
  });
}

export function outpostBuyChassis(world: World, chassisId: string): World {
  return playerCommand(world, (w) => {
    const post = requireOutpost(w);
    if (!outpostTrucks(w, post).includes(chassisId)) throw new Error(`Outpost ${post.milestone} offers no ${chassisId}`);
    swapChassis(w, chassisId);
    outpostFactsAt(w, post.milestone).trucksSold.push(chassisId);
  });
}

export function outpostGoodPrice(): number {
  return chargeM(GOODS[REPAIR_GOOD].value * CHAOS_HIGHWAY.goodsMarkup);
}

export function outpostGoodRoom(v: Vehicle): number {
  return cargoRoom(v);
}

export function outpostBuyGood(world: World, n: number): World {
  return playerCommand(world, (w) => {
    requireOutpost(w);
    const me = playerVehicle(w);
    if (!Number.isInteger(n) || n <= 0 || n > outpostGoodRoom(me)) throw new Error(`Cannot carry ${n} more ${REPAIR_GOOD}`);
    pay(w, outpostGoodPrice() * n);
    addGoods(w, me, REPAIR_GOOD, n);
  });
}

export function outpostSellPart(world: World, partId: string, truckId?: string): World {
  return playerCommand(world, (w) => {
    const post = requireOutpost(w, truckId);
    const part = takeSellablePart(w, partId, truckFor(w, truckId));
    const price = partTradePrice(w, playerVehicle(w), part, 'sell');
    requireWholeM(price, 'outpostSellPart');
    w.player.money += price;
    outpostFactsAt(w, post.milestone).stock.push(part);
  });
}

export function outpostGoodSellPrice(world: World): number {
  return payoutM(GOODS[REPAIR_GOOD].value * (1 - spread(world)));
}

export function outpostSellGood(world: World, n: number): World {
  return playerCommand(world, (w) => {
    requireOutpost(w);
    const me = playerVehicle(w);
    if (!Number.isInteger(n) || n <= 0 || n > (goodsCount(me)[REPAIR_GOOD] ?? 0)) throw new Error(`Cannot sell ${n} ${REPAIR_GOOD}`);
    removeGoods(me, REPAIR_GOOD, n);
    w.player.money += outpostGoodSellPrice(w) * n;
  });
}

export function outpostRepaint(world: World, paint: TruckPaint): World {
  return playerCommand(world, (w) => {
    requireOutpost(w);
    applyPaint(w, paint);
  });
}
