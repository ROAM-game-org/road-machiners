import { NPCS } from '../../data/npcs';
import { PERSONALITY_IDS } from '../../data/personalities';
import { computeFightGoal, fightOrder } from '../ai';
import type { MoveOrder, Vehicle, World } from '../types';
import type { Vec } from '../vec';
import { setMoveOrder } from '../world';
import { setFire } from './aim';
import type { Orders } from './orders';

const FIGHTER = NPCS.merc;

export function asFighter(me: Vehicle): Vehicle {
  const brain = { templateId: FIGHTER.id, driver: '', traits: [...FIGHTER.traits], personality: PERSONALITY_IDS[0], goals: [], noticed: {}, tracks: {}, hurt: 0, attackers: {}, goal: null, home: { ...me.pos }, stepIndex: 0, memories: [] };
  return { ...me, brain };
}

export function fightMoveFor(world: World, me: Vehicle, foe: Vehicle, post: Vec | null): MoveOrder {
  const fighter = asFighter(me);
  const goal = computeFightGoal(world, fighter, foe, foe, post);
  return goal ? fightOrder(world, fighter, foe, goal) : { kind: 'brake' };
}

export function engage(o: Orders, foe: Vehicle): void {
  setFire(o, true);
  const order = fightMoveFor(o.world, o.me, foe, null);
  o.run((w) => setMoveOrder(w, order));
}
