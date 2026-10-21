import { awakeFoesOf, inCombat, inCombatWithOther, isHostile } from './combat';
import { sameCompany } from './companies';
import { playerVehicle } from './damage';
import { canAnswerCall, decide, dangerJoining, isManageable } from './npc-decisions';
import { fightGoal, inDanger, interrupt } from './npc-activities';
import { sideAgainst } from './relations';
import { modeRules } from './settings';
import { addState, stateOf } from './states';
import { isFreeMerc } from './tow';
import type { Vehicle, World } from './types';
import { dist } from './vec';

export type HelpAnswer = 'help' | 'refuse' | 'outgunned';

export function canAskHelp(world: World, npc: Vehicle): boolean {
  const me = playerVehicle(world);
  if (!modeRules(world).radio || world.player.state !== 'active' || npc.brain === null) return false;
  if (!inCombat(world, me) || awakeFoesOf(world, me).length === 0) return false;
  if (isHostile(world, npc, me) || inCombatWithOther(world, npc, me.id) || inDanger(npc)) return false;
  if (sameCompany(world, npc, me) || isFreeMerc(world, npc)) return false;
  return stateOf(world, 'helpRefused', npc.id, me.id) === null;
}

export function helpAnswer(world: World, npc: Vehicle): HelpAnswer {
  const me = playerVehicle(world);
  if (!canAnswerCall(world, npc, me)) return 'refuse';
  const danger = dangerJoining(world, npc, me, awakeFoesOf(world, me));
  if (!isManageable(npc, danger)) return 'outgunned';
  return decide(world, npc, 'helpCalled', me.id, danger) === 'help' ? 'help' : 'refuse';
}

export function joinPlayerFight(world: World, npc: Vehicle): void {
  const me = playerVehicle(world);
  const foes = awakeFoesOf(world, me);
  if (foes.length === 0 || !canAnswerCall(world, npc, me)) throw new Error(`${npc.id} cannot answer the call for help`);
  for (const foe of foes) sideAgainst(world, npc, foe.id);
  const nearest = foes.reduce((best, foe) => (dist(npc.pos, foe.pos) < dist(npc.pos, best.pos) ? foe : best));
  world.events.push({ t: 'joins', vehicle: npc.id, against: nearest.id, victim: me.id });
  interrupt(world, npc, fightGoal(world, npc, nearest, 'answeredCall'));
}

export function turnDownCall(world: World, npc: Vehicle): void {
  const me = playerVehicle(world);
  if (stateOf(world, 'helpRefused', npc.id, me.id)) throw new Error(`${npc.id} already turned down a call for help`);
  addState(world, 'helpRefused', npc.id, me.id, { kind: 'none' });
}
