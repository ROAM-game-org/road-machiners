import { FARM_TOWER_ID } from '../data/arrival';
import { GAME_OPENED_QUESTS } from '../data/quests';
import { startKit, type StartKit } from '../data/start';
import { QUESTS, startQuest } from './quests';
import type { BakedMap } from './terrain';
import type { World, WorldSetup } from './types';
import { newWorld } from './world';

export function kitOfNewGame(kitId: string, withIntro: boolean): StartKit {
  const kit = startKit(kitId);
  return kit.intro && !withIntro ? startKit(kit.intro.withoutIntro) : kit;
}

export function newGame(seed: number, kitId: string, withIntro: boolean, map: BakedMap, setup: WorldSetup): World {
  const world = newWorld(seed, kitOfNewGame(kitId, withIntro), map, setup);
  return world.obstacles.some((o) => o.id === FARM_TOWER_ID) ? startQuest(world, QUESTS, GAME_OPENED_QUESTS.arrival, 'start') : world;
}
