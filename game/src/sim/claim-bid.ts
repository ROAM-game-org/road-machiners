import { carriesPart, findClaim, claimOfRelic } from './claims';
import { playerVehicle, vehicleById } from './damage';
import { inFeud } from './combat';
import { isMeeting, transfer } from './economy';
import { stowPart, canStowPart } from './inventory';
import { fairM } from './money';
import { meetGoal } from './npc-activities';
import { getResources } from './resources';
import { addState, endState, stateOf } from './states';
import type { NpcState, PartInstance, StateData, StateEnding, Vehicle, World } from './types';
import { partValue } from './wear';

type BidData = Extract<StateData, { kind: 'claimBid' }>;

export function claimBidPrice(relic: PartInstance): number {
  return fairM(partValue(relic));
}

export function bidData(s: NpcState): BidData {
  if (s.data.kind !== 'claimBid') throw new Error(`State ${s.id} is no claim bid`);
  return s.data;
}

function relicOf(world: World, rival: Vehicle, truck: Vehicle): PartInstance {
  const claim = claimOfRelic(world, rival, truck);
  const item = claim && truck.items.find((it) => it.kind === 'part' && it.part.id === claim.partId);
  if (item?.kind !== 'part') throw new Error(`${truck.id} carries no relic that ${rival.id} runs a claim for`);
  return item.part;
}

export function canBidFor(world: World, rival: Vehicle, truck: Vehicle): boolean {
  const claim = claimOfRelic(world, rival, truck);
  if (!claim) return false;
  const relic = relicOf(world, rival, truck);
  return getResources(world, rival).money >= claimBidPrice(relic) && canStowPart(rival, relic);
}

export function bidWith(world: World, rival: Vehicle, truck: Vehicle): NpcState | null {
  return stateOf(world, 'claimBid', rival.id, truck.id);
}

export function playerBid(world: World): NpcState | null {
  return world.states.find((s) => s.kind === 'claimBid' && s.other === world.player.vehicleId) ?? null;
}

export function offerClaimBid(world: World, rival: Vehicle, truck: Vehicle): void {
  if (bidWith(world, rival, truck)) throw new Error(`${rival.id} already bids on ${truck.id}`);
  const claim = claimOfRelic(world, rival, truck);
  if (!claim) throw new Error(`${rival.id} runs no claim for a relic on ${truck.id}`);
  addState(world, 'claimBid', rival.id, truck.id, { kind: 'claimBid', contract: claim.id, price: claimBidPrice(relicOf(world, rival, truck)), accepted: false });
}

function openBid(world: World): NpcState {
  const s = playerBid(world);
  if (!s || bidData(s).accepted) throw new Error('No open claim bid');
  return s;
}

export function acceptClaimBid(world: World): void {
  const s = openBid(world);
  bidData(s).accepted = true;
  s.turnsLeft = 20;
  meetGoal(world, vehicleById(world, s.holder), playerVehicle(world), 'pullOver');
}

export function refuseClaimBid(world: World): void {
  endState(world, openBid(world), 'broken');
}

export function refreshClaimBid(world: World, s: NpcState): boolean {
  return bidData(s).accepted && isMeeting(world, s);
}

export function checkClaimBid(world: World, s: NpcState): StateEnding | null {
  const rival = world.vehicles.find((v) => v.id === s.holder);
  const truck = world.vehicles.find((v) => v.id === s.other);
  if (!rival || !truck) return null;
  const data = bidData(s);
  const claim = findClaim(world, data.contract);
  if (!claim || claim.rival !== rival.id || !carriesPart(truck, claim.partId) || inFeud(world, rival, truck)) return 'broken';
  if (!data.accepted || !isMeeting(world, s)) return null;
  return canBidFor(world, rival, truck) ? 'fulfilled' : 'broken';
}

export function settleClaimBid(world: World, s: NpcState): void {
  const rival = vehicleById(world, s.holder);
  const truck = vehicleById(world, s.other);
  const data = bidData(s);
  if (!data.accepted || !isMeeting(world, s)) throw new Error(`${rival.id} is not meeting ${truck.id} to settle a claim bid`);
  const relic = relicOf(world, rival, truck);
  transfer(world, rival, truck, data.price);
  truck.items = truck.items.filter((it) => !(it.kind === 'part' && it.part.id === relic.id));
  if (!stowPart(world, rival, relic)) throw new Error(`${rival.id} has no room for the relic it bought`);
}
