import { GAME_OPENED_QUESTS } from '../data/quests';
import { startKit } from '../data/start';
import { QUESTS, startQuest } from './quests';
import type { BakedMap } from './terrain';
import type { World, WorldSetup } from './types';
import { newWorld } from './world';

export function newGame(seed: number, kitId: string, withIntro: boolean, map: BakedMap, setup: WorldSetup): World {
  const kit = startKit(kitId);
  const world = newWorld(seed, kit, map, setup);
  return kit.intro && withIntro ? startQuest(world, QUESTS, GAME_OPENED_QUESTS.arrival, 'start') : world;
}
