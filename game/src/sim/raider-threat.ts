import { RAIDER_THREAT, type Threat } from '../data/market';
import { REGION } from '../data/region';
import { raiderGrounds, raiderPatrolPosts } from './npc-decisions';
import type { Terrain } from './terrain';
import type { World } from './types';
import { dist, segmentDist, type Vec } from './vec';

const postLists = new WeakMap<Terrain, readonly Vec[]>();

export function raiderPosts(world: World): readonly Vec[] {
  const known = postLists.get(world.terrain);
  if (known) return known;
  const camps = REGION.locations.filter((site) => site.kind === 'camp');
  const posts = camps.flatMap((camp) => [...raiderGrounds(world, camp), ...raiderPatrolPosts(world, camp)]);
  postLists.set(world.terrain, posts);
  return posts;
}

export function threatOfCount(count: number): Threat {
  if (!Number.isInteger(count) || count < 0) throw new Error(`raider post count ${count} is not a whole number from 0`);
  if (count < RAIDER_THREAT.risky) return 1;
  return count < RAIDER_THREAT.dangerous ? 2 : 3;
}

export function threatAlong(world: World, from: Vec, to: Vec): Threat {
  return threatOfCount(raiderPosts(world).filter((post) => segmentDist(post, from, to) <= RAIDER_THREAT.reach).length);
}

export function threatAt(world: World, pos: Vec): Threat {
  return threatOfCount(raiderPosts(world).filter((post) => dist(post, pos) <= RAIDER_THREAT.reach).length);
}
