import { ROAD_STORIES, STORY_SALT, STORY_TRADES, type StoryLineId, type StoryTrade } from '../data/road-stories';
import { npcTraits } from './npc-decisions';
import { charCodes, hashRandom } from './rng';
import type { Vehicle, World } from './types';

export function storyTrade(npc: Vehicle): StoryTrade {
  for (const trait of npcTraits(npc)) {
    const trade = STORY_TRADES[trait];
    if (trade) return trade;
  }
  throw new Error(`${npc.id} has no trait with a story trade`);
}

export function talesHeard(world: World): number {
  return Object.values(world.player.talked).filter((talked) => talked.tale !== undefined).length;
}

export function pickStory(world: World, npc: Vehicle): StoryLineId {
  const trade = storyTrade(npc);
  const stories = ROAD_STORIES[trade];
  const start = Math.floor(hashRandom(world.seed, ...charCodes(trade), ...charCodes(STORY_SALT)) * stories.length);
  return stories[(start + talesHeard(world)) % stories.length];
}
