import { awakeFoesOf, engageInSight, inCombat, inCombatWithOther, isHostile } from './combat';
import { companyOf, sameCompany } from './companies';
import { spokesman } from './sides';
import { playerVehicle } from './damage';
import { callFighters, canAnswerCall, decide, dangerJoining, isManageable, staysOutOfCall } from './npc-decisions';
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

export function helpAnswer(world: World, asked: Vehicle): HelpAnswer {
  const me = playerVehicle(world);
  const speaker = spokesman(world, asked);
  if (!canAnswerCall(world, speaker, me)) return 'refuse';
  const danger = dangerJoining(world, speaker, callFighters(world, speaker, me), me, awakeFoesOf(world, me));
  if (!isManageable(speaker, danger)) return 'outgunned';
  if (staysOutOfCall(world, speaker, me, danger)) return 'refuse';
  return decide(world, speaker, 'helpCalled', me.id, danger) === 'help' ? 'help' : 'refuse';
}

export function joinPlayerFight(world: World, asked: Vehicle): void {
  const me = playerVehicle(world);
  const speaker = spokesman(world, asked);
  const foes = awakeFoesOf(world, me);
  if (foes.length === 0 || !canAnswerCall(world, speaker, me)) throw new Error(`${asked.id} cannot answer the call for help`);
  for (const fighter of callFighters(world, speaker, me)) joinFight(world, fighter, me, foes);
}

function joinFight(world: World, fighter: Vehicle, me: Vehicle, foes: Vehicle[]): void {
  for (const foe of foes) sideAgainst(world, fighter, foe.id);
  const nearest = foes.reduce((best, foe) => (dist(fighter.pos, foe.pos) < dist(fighter.pos, best.pos) ? foe : best));
  world.events.push({ t: 'joins', vehicle: fighter.id, against: nearest.id, victim: me.id });
  interrupt(world, fighter, fightGoal(world, fighter, nearest, 'answeredCall'));
  engageInSight(world, fighter);
}

export function turnDownCall(world: World, asked: Vehicle): void {
  const me = playerVehicle(world);
  if (stateOf(world, 'helpRefused', asked.id, me.id)) throw new Error(`${asked.id} already turned down a call for help`);
  const speaker = spokesman(world, asked);
  const { leader, members } = companyOf(world, speaker);
  const refusing = speaker.id === leader.id ? [speaker, ...members] : [asked];
  for (const member of refusing) if (member.id === asked.id || canAskHelp(world, member)) addState(world, 'helpRefused', member.id, me.id, { kind: 'none' });
}
