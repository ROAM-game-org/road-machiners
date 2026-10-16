import { haulerOf, truckFor } from '../damage';
import { reachedOutpostAt } from '../fury-road';
import { storePart } from '../inventory';
import { haulerTakes, outpostBuyPart, outpostPartPrice } from '../outposts';
import { isJunk } from '../wear';
import { gearPlans, type GearJob, type Plan } from './gear';
import { mountBought, type Orders } from './orders';

export function bestValue<P extends Plan>(plans: readonly P[], budget: number): P | null {
  const ratio = (p: P) => p.jobGain / Math.max(1, p.cost);
  const open = plans.filter((p) => p.cost <= budget && p.jobGain > 0);
  return open.reduce<P | null>((best, p) => (!best || ratio(p) > ratio(best) ? p : best), null);
}

function nextBuy(o: Orders, truckId: string, job: GearJob, budget: number) {
  const truck = truckFor(o.world, truckId);
  const post = reachedOutpostAt(o.world, truck);
  if (!post) return null;
  const offers = post.stock.filter((part) => !isJunk(part) && (truckId === o.me.id || haulerTakes(part))).map((part) => ({ part, price: outpostPartPrice(o.world, part, truckId) }));
  const buyer = { job, skip: [], resale: () => 0 };
  return bestValue(gearPlans(o.world, truck, offers, buyer), Math.min(budget, o.world.player.money));
}

function buyGear(o: Orders, truckId: string, job: GearJob, budget: number): void {
  let left = budget;
  for (let plan = nextBuy(o, truckId, job, left); plan; plan = nextBuy(o, truckId, job, left)) {
    if (plan.replaces) o.run((w) => storePart(w, plan.replaces!.id, truckId), 'gear');
    o.run((w) => outpostBuyPart(w, plan.offer.part.id, truckId), 'gear');
    mountBought(o, plan.offer.part.id, plan.spot, truckId);
    left -= plan.offer.price;
  }
}

export function armorHauler(o: Orders, share: number): void {
  buyGear(o, haulerOf(o.world).id, 'hauler', share * o.world.player.money);
}
