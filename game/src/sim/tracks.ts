
import { NPC_BEHAVIOR } from '../data/npcs';
import type { Berth } from './nav/layer';
import type { Contact, Track, TrackChoice, Vehicle, World } from './types';
import type { Vec } from './vec';
import { canVehicleSee, sightRadius } from './vision';

export function trackOf(vehicle: Vehicle, id: string): Track | undefined {
  return tracksOf(vehicle)[id];
}

export function chooseOn(world: World, vehicle: Vehicle, id: string, at: Vec, choice: TrackChoice, inSight: boolean): void {
  const known = trackOf(vehicle, id);
  const seenSince = known ? known.seenSince : inSight ? world.turn : null;
  tracksOf(vehicle)[id] = { at: { ...at }, turn: world.turn, sighted: inSight || known?.sighted === true, seenSince, choice, chosenInSight: inSight };
}

export function refreshTrack(world: World, vehicle: Vehicle, id: string, at: Vec): void {
  const known = trackOf(vehicle, id);
  if (!known) throw new Error(`${vehicle.id} has no track of ${id} to refresh`);
  known.at = { ...at };
  known.turn = world.turn;
}

export function berthsOf(world: World, vehicle: Vehicle): Berth[] {
  const brain = vehicle.brain;
  if (!brain?.tracks) return [];
  const target = brain.goals[brain.goals.length - 1]?.targetId;
  const entries = Object.entries(brain.tracks).filter(([id, track]) => track.choice === 'flee' && id !== target && world.turn - track.turn <= memoryOf(track));
  if (entries.length === 0) return [];
  const r = sightRadius(world, vehicle) + NPC_BEHAVIOR.berthMargin;
  return entries.map(([, track]) => ({ x: track.at.x, y: track.at.y, r }));
}

export function comesInSight(world: World, track: Track): boolean {
  return track.seenSince === world.turn;
}

export function sensedAt(world: World, vehicle: Vehicle, id: string, contacts: Contact[]): Vec | undefined {
  const other = world.vehicles.find((v) => v.id === id);
  if (other && canVehicleSee(world, vehicle, other.pos)) return other.pos;
  return contacts.find((c) => c.vehicleId === id)?.center;
}

export function senseTracks(world: World, vehicle: Vehicle, seen: Vehicle[], contacts: Contact[]): void {
  const tracks = tracksOf(vehicle);
  loseSight(tracks, seen);
  for (const v of seen) sense(world, tracks, v.id, v.pos, true);
  for (const c of contacts) sense(world, tracks, c.vehicleId, c.center, false);
  for (const [id, track] of Object.entries(tracks)) {
    if (world.turn - track.turn > memoryOf(track) && !vehicle.brain!.goals.some((g) => g.targetId === id)) delete tracks[id];
  }
}

function loseSight(tracks: Record<string, Track>, seen: Vehicle[]): void {
  const inSight = new Set(seen.map((v) => v.id));
  for (const [id, track] of Object.entries(tracks)) {
    if (!inSight.has(id)) track.seenSince = null;
  }
}

function sense(world: World, tracks: Record<string, Track>, id: string, at: Vec, inSight: boolean): void {
  const known = tracks[id];
  if (!known) {
    tracks[id] = { at: { ...at }, turn: world.turn, sighted: inSight, seenSince: inSight ? world.turn : null, choice: null, chosenInSight: false };
    return;
  }
  known.at = { ...at };
  known.turn = world.turn;
  known.sighted ||= inSight;
  if (inSight) known.seenSince ??= world.turn;
}

function memoryOf(track: Track): number {
  return track.choice === 'flee' ? NPC_BEHAVIOR.fleeMemory : NPC_BEHAVIOR.noticeMemory;
}

function tracksOf(vehicle: Vehicle): Record<string, Track> {
  if (!vehicle.brain) throw new Error(`${vehicle.id} has no NPC brain`);
  if (!vehicle.brain.tracks) throw new Error(`${vehicle.id} has no tracks`);
  return vehicle.brain.tracks;
}
