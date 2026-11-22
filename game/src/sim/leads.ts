import type { Vec } from './vec';
import type { Vehicle, World } from './types';
import type { Contract } from './market';

export type Lead = { at: Vec; turn: number };

export type Sought = { contract: string; vehicle: string; driver: string; lead: Lead | null };

function soughtOf(c: Contract): Sought | null {
  if (c.kind === 'search' && !c.delivered) return { contract: c.id, vehicle: c.target, driver: c.driver, lead: c.lead };
  if (c.kind === 'rescue' && !c.fulfilled) return { contract: c.id, vehicle: c.client, driver: c.driver, lead: c.lead };
  return null;
}

export function soughtDrivers(world: World): Sought[] {
  return world.player.contracts.flatMap((c) => soughtOf(c) ?? []);
}

export function soughtBy(world: World, npc: Vehicle): Sought[] {
  return soughtDrivers(world).filter((s) => s.vehicle !== npc.id);
}

export function noteLead(world: World, contractId: string, at: Vec, turn: number): void {
  const c = world.player.contracts.find((x) => x.id === contractId);
  if (!c || (c.kind !== 'search' && c.kind !== 'rescue') || soughtOf(c) === null) throw new Error(`No open search or rescue ${contractId} to take a lead for`);
  const current = c.lead;
  if (current === null || turn > current.turn) c.lead = { at: { ...at }, turn };
}
