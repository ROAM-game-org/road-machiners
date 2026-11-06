import type { TimedRecord } from '../sim/timed-combat';
import { restFrame, type VehicleFrame, type V3 } from '../phys/frames';
import type { GridItem, World } from '../sim/types';
import { combatState } from '../sim/timed-combat';

export function timedDisplay(before: World, after: World, elapsedMs: number): World {
  const state = combatState(after);
  if (!state) throw new Error('Timed display needs combat state');
  const at = state.turnStart + elapsedMs;
  const damage = new Map<string, number>();
  const spent = new Set<string>();
  for (const record of state.records.filter(r => r.at <= at)) collectDisplay(record, damage, spent);
  const vehicles = before.vehicles.filter(v => state.destroyedAt[v.id] === undefined || state.destroyedAt[v.id] > at).map(v => ({
    ...v,
    items: v.items.map(item => displayItem(item, damage, spent)),
  }));
  return { ...before, vehicles };
}

let lastShown: { world: World; before: World; elapsed: number; shown: World } | null = null;

function timedDisplayOnce(before: World, world: World, elapsed: number): World {
  if (lastShown?.world === world && lastShown.before === before && lastShown.elapsed === elapsed) return lastShown.shown;
  const shown = timedDisplay(before, world, elapsed);
  lastShown = { world, before, elapsed, shown };
  return shown;
}

export function playbackWorld(world: World, playback: { impacts: boolean; before: World; elapsed: number } | null): World {
  if (!playback || playback.impacts) return world;
  return combatState(world) ? timedDisplayOnce(playback.before, world, playback.elapsed) : playback.before;
}
export function timedUiStale(world: World, elapsed: number, ms: number, stale: boolean): boolean {
  const state = combatState(world);
  if (!state) return stale;
  return stale || state.records.some(r => r.at > state.turnStart + elapsed - ms && r.at <= state.turnStart + elapsed);
}
export function shownTimedVehicles(world: World, landed: boolean, playback: { elapsed: number } | null): World['vehicles'] {
  if (landed) return world.vehicles;
  const state = combatState(world);
  const elapsed = playback?.elapsed ?? 0;
  const removed = world.removed.filter(v => {
    const destroyed = state?.destroyedAt[v.id];
    return destroyed === undefined || elapsed < destroyed - state!.turnStart;
  });
  return [...world.vehicles, ...removed];
}
export function untimedDestroyed(world: World, event: World['events'][number]): event is Extract<World['events'][number], { t: 'destroyed' }> {
  return event.t === 'destroyed' && combatState(world)?.destroyedAt[event.vehicle] === undefined;
}

export function combatEventPoint(world: World, frames: Record<string, VehicleFrame>, id: string, height: number, shown: (vehicle: World['vehicles'][number]) => boolean): V3 | null {
  const vehicle = world.vehicles.find(v => v.id === id) ?? world.removed.find(v => v.id === id);
  if (!vehicle || !shown(vehicle)) return null;
  const frame = frames[id] ?? restFrame(world, vehicle);
  return { x: frame.pos.x, y: frame.pos.y + height, z: frame.pos.z };
}

function collectDisplay(record: TimedRecord, damage: Map<string, number>, spent: Set<string>): void {
  if (record.kind === 'launch' && record.flight) spent.add(record.flight.weaponId);
  if (!record.event) return;
  const hits = record.event.rounds.flatMap(round => [...round.hits, ...round.blast.flatMap(b => b.hits)]);
  for (const hit of hits) damage.set(hit.part, (damage.get(hit.part) ?? 0) + hit.damage);
}
function displayItem(item: GridItem, damage: Map<string, number>, spent: Set<string>): GridItem {
  if (item.kind !== 'part') return item;
  const part = { ...item.part, hp: Math.max(0, item.part.hp - (damage.get(item.part.id) ?? 0)) };
  if (part.gun) part.gun = { ...part.gun, ammo: part.gun.ammo - Number(spent.has(part.id)) };
  return { ...item, part };
}

export function combatFrameMs(playback: { elapsed: number } | null, frameMs: number, durationMs: number): number {
  return playback === null ? 0 : Math.min(frameMs, Math.max(0, durationMs - playback.elapsed));
}
