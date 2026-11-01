import { NPCS } from '../data/npcs';
import { isHostile } from './combat';
import { inCompany, followingOf } from './companies';
import { isDefeated } from './defeat';
import { modeRules } from './settings';
import { startEscort, unguardedLeader } from './tow';
import type { NpcActivity, Vehicle, World } from './types';
import { dist, pointsAway, type Vec } from './vec';

function pairsWith(v: Vehicle): boolean {
  const templateId = v.brain?.templateId;
  return templateId !== undefined && NPCS[templateId]?.pairs === true;
}

export function isLone(world: World, v: Vehicle): boolean {
  if (isDefeated(v)) return false;
  return !inCompany(world, v);
}

export function lonePartnerOf(world: World, v: Vehicle): Vehicle | null {
  if (!pairsWith(v) || !modeRules(world).traffic || !isLone(world, v)) return null;
  const candidates = world.vehicles.filter(
    (o) => o.id !== v.id && o.brain?.templateId === v.brain!.templateId && o.faction === v.faction && isLone(world, o) && !isHostile(world, v, o) && !isHostile(world, o, v),
  );
  return candidates.sort((a, b) => dist(v.pos, a.pos) - dist(v.pos, b.pos))[0] ?? null;
}

export function leaderToJoin(world: World, v: Vehicle): Vehicle | null {
  const tpl = NPCS[v.brain!.templateId];
  if (tpl?.spawn.kind === 'escort') return unguardedLeader(world, v);
  return lonePartnerOf(world, v);
}

export function joinLeader(world: World, v: Vehicle): NpcActivity {
  const leader = leaderToJoin(world, v);
  if (!leader) throw new Error(`${v.id} chose an escort with no leader to join`);
  if (pairsWith(v) && !isLone(world, leader)) throw new Error(`${v.id} chose a partner ${leader.id} that is not lone`);
  return startEscort(world, v, leader, null, 0);
}

export function safeBesidePartner(world: World, v: Vehicle, threat: Vec): Vec | null {
  if (!pairsWith(v)) return null;
  const held = followingOf(world, v);
  const leader = held && world.vehicles.find((o) => o.id === held.other);
  if (!leader || isDefeated(leader) || !pointsAway(v.pos, leader.pos, threat)) return null;
  return { ...leader.pos };
}
