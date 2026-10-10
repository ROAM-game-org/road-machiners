import { FARM_TOWER_ID } from '../data/arrival';
import { GAME_OPENED_QUESTS } from '../data/quests';
import { startKit, type StartKit } from '../data/start';
import { wakeTownStart } from './intro';
import { QUESTS, startQuest } from './quests';
import type { BakedMap } from './terrain';
import type { World, WorldSetup } from './types';
import { newWorld } from './world';

export function kitOfNewGame(kitId: string, withIntro: boolean): StartKit {
  const kit = startKit(kitId);
  return kit.intro && !withIntro ? startKit(kit.intro.withoutIntro) : kit;
}

export function newGame(seed: number, kitId: string, withIntro: boolean, map: BakedMap, setup: WorldSetup): World {
  const kit = kitOfNewGame(kitId, withIntro);
  const skipped = startKit(kitId).intro !== null && !withIntro;
  const world = skipped ? newWorld(seed, kit, map, setup, true, wakeTownStart()) : newWorld(seed, kit, map, setup);
  return world.obstacles.some((o) => o.id === FARM_TOWER_ID) ? startQuest(world, QUESTS, GAME_OPENED_QUESTS.arrival, 'start') : world;
}
