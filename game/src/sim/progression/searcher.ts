import { isOutlaw } from '../relations';
import { TOPICS, type LineId } from '../../data/dialogue';
import { SHOPS } from '../../data/market';
import { inCombat } from '../combat';
import { playerVehicle } from '../damage';
import { isKnockedOut } from '../defeat';
import { callVehicle, chooseOption, currentOptions, hangUp } from '../dialogue';
import { boardClosedUntil, acceptContract, deliverContract, heldSearch, searchRefusal, shopAt, shopState, siteOf, type SearchContract } from '../market';
import { handOverParcel, playerHandover, readyHandover } from '../parcel';
import { canUseSite, type Site } from '../sites';
import type { Vehicle, World } from '../types';
import { dist, type Vec } from '../vec';
import { canVehicleSee } from '../vision';
import { setMoveOrder } from '../world';
import { driveTo, driveToSite, type Orders } from './orders';

export const SEARCHER = {
  freshLeadTurns: 40,
  leadReach: 6,
  askEvery: 25,
};

const SHOP_SITES: readonly Site[] = Object.keys(SHOPS).map(siteOf);

export function searcherGoal(o: Orders, otherwise: (o: Orders) => void): void {
  const search = heldSearch(o.world);
  if (search?.delivered) return claimSearch(o, search);
  if (search) return seek(o, search);
  if (!takeSearch(o)) otherwise(o);
}

export function takeSearch(o: Orders): boolean {
  const shop = shopAt(o.world);
  if (!shop || boardClosedUntil(o.world, shop) !== null || heldSearch(o.world)) return false;
  const offer = shopState(o.world, shop).contracts.find((c) => c.kind === 'search' && c.deadline > o.world.turn && searchRefusal(o.world, c) === null);
  if (offer) o.run((w) => acceptContract(w, offer.id));
  return offer !== undefined;
}

function claimSearch(o: Orders, search: SearchContract): void {
  if (shopAt(o.world) === search.shop) o.run((w) => deliverContract(w, search.id), 'contracts');
  else driveToSite(o, siteOf(search.shop));
}

function seek(o: Orders, search: SearchContract): void {
  if (playerHandover(o.world)) return meet(o, search);
  const target = o.world.vehicles.find((v) => v.id === search.target);
  if (target && callable(o.world, target)) return askToPullOver(o, target);
  askWitnesses(o);
  if (heldSearch(o.world)?.delivered === false) roam(o, search);
}

function meet(o: Orders, search: SearchContract): void {
  const ready = readyHandover(o.world);
  if (ready?.holder === search.target) {
    o.run((w) => handOverParcel(w, search.target));
    return;
  }
  if (o.me.order) o.run((w) => setMoveOrder(w, null));
}

function callable(world: World, v: Vehicle): boolean {
  const me = playerVehicle(world);
  return v.brain !== null && !isOutlaw(v.faction) && !isKnockedOut(v) && !inCombat(world, v) && !inCombat(world, me) && canVehicleSee(world, me, v.pos);
}

function askToPullOver(o: Orders, target: Vehicle): void {
  if (!talk(o, target, [TOPICS.parcel.ask!.say, 'pullingOver'])) driveTo(o, target.pos);
  else if (o.me.order) o.run((w) => setMoveOrder(w, null));
}

function askWitnesses(o: Orders): void {
  const search = heldSearch(o.world)!;
  const witnesses = o.world.vehicles.filter((v) => v.id !== search.target && v.id !== o.me.id && callable(o.world, v) && asksNow(o.world, v));
  for (const v of witnesses) talk(o, v, [TOPICS.lastSeen.ask!.say, 'thanksOverAndOut']);
}

function asksNow(world: World, v: Vehicle): boolean {
  let hash = 0;
  for (const ch of v.id) hash = (hash * 31 + ch.charCodeAt(0)) % SEARCHER.askEvery;
  return (world.turn + hash) % SEARCHER.askEvery === 0;
}

function talk(o: Orders, npc: Vehicle, lines: readonly LineId[]): boolean {
  o.run((w) => callVehicle(w, npc.id));
  let said = 0;
  for (const line of lines) {
    if (!o.world.player.call) break;
    const pick = currentOptions(o.world).findIndex((option) => option.line === line);
    if (pick < 0) break;
    o.run((w) => chooseOption(w, pick));
    said += 1;
  }
  if (o.world.player.call) o.run(hangUp);
  return said === lines.length;
}

function roam(o: Orders, search: SearchContract): void {
  const fresh = o.world.turn - search.lead.turn < SEARCHER.freshLeadTurns;
  if (fresh) return goToLead(o, search.lead.at);
  if (touring(o)) return;
  tourFrom(o, search.lead.at);
}

function goToLead(o: Orders, at: Vec): void {
  if (dist(o.me.pos, at) <= SEARCHER.leadReach) {
    if (o.me.order) o.run((w) => setMoveOrder(w, null));
    return;
  }
  driveTo(o, at);
}

function touring(o: Orders): boolean {
  const order = o.me.order;
  if (order?.kind !== 'stopAt') return false;
  const site = SHOP_SITES.find((s) => canUseSite(order.dest, s));
  return site !== undefined && !canUseSite(o.me.pos, site);
}

function tourFrom(o: Orders, lead: Vec): void {
  const here = SHOP_SITES.find((s) => canUseSite(o.me.pos, s));
  const reached = dist(lead, here ? here.pos : o.me.pos);
  const outward = SHOP_SITES.filter((s) => s !== here && dist(lead, s.pos) > reached);
  const pool = outward.length > 0 ? outward : SHOP_SITES.filter((s) => s !== here);
  const next = [...pool].sort((a, b) => dist(o.me.pos, a.pos) - dist(o.me.pos, b.pos))[0];
  if (next) driveToSite(o, next);
}
