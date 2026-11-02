import { inCombat, inFeud } from './combat';
import { playerVehicle, vehicleById } from './damage';
import { isMeeting } from './economy';
import { heldSearch, parcelOf, removeParcel, type SearchContract } from './market';
import { meetGoal } from './npc-activities';
import { addState, endState, stateOf } from './states';
import type { NpcState, StateEnding, Vehicle, World } from './types';
import { playerCommand } from './world';

export function parcelFor(world: World, npc: Vehicle): SearchContract | null {
  const search = heldSearch(world);
  if (!search || search.delivered || search.target !== npc.id) return null;
  return parcelOf(playerVehicle(world), search.id) ? search : null;
}

export function handoverWith(world: World, npc: Vehicle): NpcState | null {
  return stateOf(world, 'handover', npc.id, world.player.vehicleId);
}

export function playerHandover(world: World): NpcState | null {
  return world.states.find((s) => s.kind === 'handover' && s.other === world.player.vehicleId) ?? null;
}

export function readyHandover(world: World): NpcState | null {
  const s = playerHandover(world);
  return s && handoverHolds(world, s) && isMeeting(world, s) ? s : null;
}

function handoverHolds(world: World, s: NpcState): boolean {
  const npc = world.vehicles.find((v) => v.id === s.holder);
  const me = world.vehicles.find((v) => v.id === s.other);
  return npc !== undefined && me !== undefined && !inCombat(world, npc) && !inCombat(world, me) && parcelFor(world, npc) !== null;
}

export function askHandover(world: World, npc: Vehicle): void {
  if (!parcelFor(world, npc)) throw new Error(`The player holds no parcel for ${npc.id}`);
  if (handoverWith(world, npc)) throw new Error(`${npc.id} is already pulling over for the parcel`);
  addState(world, 'handover', npc.id, world.player.vehicleId, { kind: 'none' });
  meetGoal(world, npc, playerVehicle(world), 'pullOver');
}

export function checkHandover(world: World, s: NpcState): StateEnding | null {
  const npc = world.vehicles.find((v) => v.id === s.holder);
  const me = world.vehicles.find((v) => v.id === s.other);
  if (!npc || !me) return null;
  return inFeud(world, npc, me) || !parcelFor(world, npc) ? 'broken' : null;
}

export function handOverParcel(world: World, npcId: string): World {
  return playerCommand(world, (w) => giveParcel(w, vehicleById(w, npcId)));
}

function giveParcel(world: World, npc: Vehicle): void {
  const s = handoverWith(world, npc);
  if (!s || !isMeeting(world, s)) throw new Error(`Not meeting ${npc.id} to hand a parcel over`);
  if (inCombat(world, npc) || inCombat(world, playerVehicle(world))) throw new Error('No handover in combat');
  const search = parcelFor(world, npc);
  if (!search) throw new Error(`The player holds no parcel for ${npc.id}`);
  removeParcel(playerVehicle(world), search.id);
  search.delivered = true;
  world.events.push({ t: 'contract', contract: { ...search }, outcome: 'fulfilled' });
  endState(world, s, 'fulfilled');
}
