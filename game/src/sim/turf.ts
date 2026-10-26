import { SITE_FACTIONS, TURF } from '../data/npc-behavior';
import { REGION } from '../data/region';
import type { NpcFactionId } from './types';
import { dist, type Vec } from './vec';

export type Claimant = { id: string; home: Vec; reach: number };

export function turfClaimants(): Claimant[] {
  const shares = Object.entries(TURF.shares) as [NpcFactionId, number][];
  const total = TURF.reachPerFaction * shares.length;
  return shares.map(([id, share]) => ({ id, home: factionHome(id), reach: share * total }));
}

function factionHome(faction: NpcFactionId): Vec {
  const homes = [...REGION.towns, ...REGION.locations].filter((site) => SITE_FACTIONS[site.id] === faction);
  if (homes.length !== 1) throw new Error(`Faction ${faction} has ${homes.length} home sites, turf needs exactly one`);
  return homes[0].pos;
}

export function divideTurf(points: readonly Vec[], claimants: readonly Claimant[]): Map<string, Vec[]> {
  const turf = new Map(claimants.map((c) => [c.id, [] as Vec[]]));
  const free = [...points];
  while (claimants.some((c) => closestInReach(c, free) !== null))
    for (const claimant of claimants) {
      const pick = closestInReach(claimant, free);
      if (pick === null) continue;
      turf.get(claimant.id)!.push(free[pick]);
      free.splice(pick, 1);
    }
  return turf;
}

function closestInReach(claimant: Claimant, free: readonly Vec[]): number | null {
  let best: number | null = null;
  for (let i = 0; i < free.length; i++) {
    const gap = dist(free[i], claimant.home);
    if (gap <= claimant.reach && (best === null || gap < dist(free[best], claimant.home))) best = i;
  }
  return best;
}
