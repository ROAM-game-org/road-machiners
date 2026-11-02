import { RULES } from '../data/rules';
import { inCombat } from './combat';
import { playerVehicle } from './damage';
import { gatesShut } from './outpost-gates';
import { setDown } from './steering';
import { isTowing } from './tow';
import type { Vehicle, World } from './types';
import { actBlock, playerCommand, type ActBlock } from './world';

export type UnstuckBlock = ActBlock | 'gatesShut' | 'combat' | 'towing' | 'harpoon';

function held(v: Vehicle): boolean {
  const turns = v.strandedTurns ?? 0;
  return turns > 0 && turns < RULES.stranded.turns;
}

export function unstuckBlock(world: World): UnstuckBlock | null {
  const block = actBlock(world);
  if (block) return block;
  if (gatesShut(world)) return 'gatesShut';
  const me = playerVehicle(world);
  if (inCombat(world, me) && !held(me)) return 'combat';
  if (isTowing(world, me.id)) return 'towing';
  if (world.lines.some((line) => line.from === me.id || line.to === me.id)) return 'harpoon';
  return null;
}

export function getUnstuck(world: World): World {
  const block = unstuckBlock(world);
  if (block) throw new Error(`Get unstuck is refused: ${block}`);
  return playerCommand(world, (w) => {
    const me = playerVehicle(w);
    me.order = null;
    setDown(w, me);
  });
}
