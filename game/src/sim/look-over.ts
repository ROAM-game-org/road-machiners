import { GOODS } from '../data/goods';
import { LOOK_OVER, type DecisionOptions } from '../data/npcs';
import { huntsForLoot, inCombat, isHostile } from './combat';
import { playerVehicle, vehicleById } from './damage';
import { isKnockedOut } from './defeat';
import { freeCells, hasLoot, isLoot, isMounted, itemCells, mountedItems } from './grid';
import { cargoValue } from './market';
import { chaseStalled, startChase } from './chase';
import { createActivity, fightGoal, fightTargetLost, finishGoal, fleeFrom, interrupt, popGoal, react, topGoal } from './npc-activities';
import { huntsOffRoad } from './hunt-style';
import { canRob, decide, holdsUp, huntsPrey, npcProfile, passReason, perceiveDanger, type NpcProfile } from './npc-decisions';
import { answersHoldUp } from './parley';
import { basicRefusal, hasPerk } from './progress';
import { reportIncident } from './relations';
import { fightsSideOf } from './sides';
import { addState, stateOf, type WorkLeft } from './states';
import { chooseOn, trackOf } from './tracks';
import type { Contact, GoalReason, NpcActivity, NpcState, Refusal, StateEnding, Vehicle, World } from './types';
import { dist } from './vec';
import { canVehicleSee } from './vision';
import { playerCanAct, playerCommand, Refused } from './world';

const MEAN_CRATE_VALUE = Object.values(GOODS).reduce((sum, good) => sum + good.value, 0) / Object.values(GOODS).length;

export function meanCrateValue(): number {
  return MEAN_CRATE_VALUE;
}

function isPlayerTruck(world: World, v: Vehicle): boolean {
  return v.id === world.player.vehicleId;
}

function awake(world: World, v: Vehicle): boolean {
  return isPlayerTruck(world, v) ? world.player.state === 'active' : !isKnockedOut(v);
}

function inReach(world: World, looker: Vehicle, target: Vehicle): boolean {
  return dist(looker.pos, target.pos) <= LOOK_OVER.reach && canVehicleSee(world, looker, target.pos);
}

function lookingOver(world: World, looker: Vehicle): boolean {
  return world.states.some((s) => s.kind === 'lookOver' && s.holder === looker.id);
}

export function canLookOver(world: World, looker: Vehicle, target: Vehicle): Refusal | null {
  if (looker.id === target.id) return { id: 'noTruck' };
  return lookerRefusal(world, looker, target) ?? sightRefusal(world, looker, target) ?? progressRefusal(world, looker, target);
}

function lookerRefusal(world: World, looker: Vehicle, target: Vehicle): Refusal | null {
  const basic = isPlayerTruck(world, looker) ? basicRefusal(world, 'lookOver') : null;
  if (basic) return basic;
  return awake(world, looker) && awake(world, target) ? null : { id: 'lookOverDown' };
}

function sightRefusal(world: World, looker: Vehicle, target: Vehicle): Refusal | null {
  if (!canVehicleSee(world, looker, target.pos)) return { id: 'lookOverUnseen' };
  return dist(looker.pos, target.pos) > LOOK_OVER.reach ? { id: 'lookOverFar' } : null;
}

function progressRefusal(world: World, looker: Vehicle, target: Vehicle): Refusal | null {
  if (lookingOver(world, looker)) return { id: 'lookOverRunning' };
  return stateOf(world, 'sizedUp', looker.id, target.id) ? { id: 'lookOverKnown' } : null;
}

export function startLookOver(world: World, looker: Vehicle, target: Vehicle): void {
  const refusal = canLookOver(world, looker, target);
  if (refusal) throw new Error(`${looker.id} cannot look ${target.id} over: ${refusal.id}`);
  addState(world, 'lookOver', looker.id, target.id, { kind: 'none' });
}

export function lookOverError(world: World, targetId: string): Refusal | null {
  if (!playerCanAct(world)) return { id: 'cannotAct' };
  return canLookOver(world, playerVehicle(world), vehicleById(world, targetId));
}

export function lookOver(world: World, targetId: string): World {
  const refusal = lookOverError(world, targetId);
  if (refusal) throw new Refused(refusal);
  return playerCommand(world, (w) => startLookOver(w, playerVehicle(w), vehicleById(w, targetId)));
}

function partiesOf(world: World, s: NpcState): [Vehicle, Vehicle] | null {
  const looker = world.vehicles.find((v) => v.id === s.holder);
  const target = world.vehicles.find((v) => v.id === s.other);
  return looker && target ? [looker, target] : null;
}

export function checkLookOver(world: World, s: NpcState): StateEnding | null {
  const parties = partiesOf(world, s);
  if (!parties) return 'broken';
  const [looker, target] = parties;
  if (!awake(world, looker) || !awake(world, target) || !inReach(world, looker, target)) return 'broken';
  return world.turn >= s.born + LOOK_OVER.turns ? 'fulfilled' : null;
}

export function lookOverWork(world: World, s: NpcState, v: Vehicle): WorkLeft | null {
  if (v.id !== s.holder) return null;
  return { turnsLeft: Math.max(1, s.born + LOOK_OVER.turns - world.turn), total: LOOK_OVER.turns };
}

export function onLookedOver(world: World, s: NpcState): void {
  addState(world, 'sizedUp', s.holder, s.other, { kind: 'none' });
  world.events.push({ t: 'lookedOver', by: s.holder, target: s.other });
}

export function checkSizedUp(world: World, s: NpcState): StateEnding | null {
  const parties = partiesOf(world, s);
  if (!parties) return 'broken';
  const [looker, target] = parties;
  return canVehicleSee(world, looker, target.pos) ? null : 'broken';
}

export function knowsCargo(world: World, looker: Vehicle, target: Vehicle): boolean {
  if (stateOf(world, 'sizedUp', looker.id, target.id)) return true;
  return isPlayerTruck(world, looker) && hasPerk(world, 'cargoEye') && canVehicleSee(world, looker, target.pos);
}

function visibleHold(v: Vehicle): number {
  const stowed = v.items.filter((item) => item.kind !== 'part' || !isMounted(v.chassisId, item));
  return freeCells(v) + stowed.reduce((sum, item) => sum + itemCells(item).length, 0);
}

export function perceivedLoad(world: World, robber: Vehicle, target: Vehicle): number {
  if (knowsCargo(world, robber, target)) return cargoValue(target);
  return visibleHold(target) * MEAN_CRATE_VALUE * LOOK_OVER.guessShare;
}

export function hasPerceivedLoot(world: World, robber: Vehicle, target: Vehicle): boolean {
  if (knowsCargo(world, robber, target)) return hasLoot(target);
  return visibleHold(target) > 0 || mountedItems(target).some((item) => isLoot(target.chassisId, item));
}

export function onHoldUp(world: World, vehicle: Vehicle): void {
  const goal = topGoal(vehicle);
  const prey = goal ? preyToAsk(world, vehicle, goal) : null;
  if (!goal || !prey) return;
  goal.demands = false;
  answersHoldUp(world, prey, vehicle, decide(world, prey, 'threatened', vehicle.id, perceiveDanger(world, prey, vehicle)));
}

function preyToAsk(world: World, vehicle: Vehicle, goal: NpcActivity): Vehicle | null {
  if (goal.kind !== 'fight' || !goal.demands || goal.targetId === world.player.vehicleId) return null;
  const prey = vehicleById(world, goal.targetId!);
  return canVehicleSee(world, vehicle, prey.pos) && holdsUp(world, vehicle, prey, null) ? prey : null;
}

export function onPreySeen(world: World, vehicle: Vehicle): void {
  if (topGoal(vehicle)?.kind === 'sizeUp') return;
  const prey = world.vehicles
    .filter((other) => !(`preySeen:${other.id}` in vehicle.brain!.noticed) && canRob(world, vehicle, other))
    .sort((a, b) => dist(vehicle.pos, a.pos) - dist(vehicle.pos, b.pos));
  for (const target of prey) {
    if (react(world, vehicle, 'preySeen', target.id) !== 'rob') continue;
    if (knowsCargo(world, vehicle, target)) startRobbery(world, vehicle, target);
    else interrupt(world, vehicle, sizeUpGoal(world, vehicle, target));
    return;
  }
}

function startRobbery(world: World, vehicle: Vehicle, target: Vehicle): void {
  addState(world, 'feud', vehicle.id, target.id, { kind: 'feud', robbery: true });
  world.events.push({ t: 'hostile', vehicle: vehicle.id, against: target.id });
  reportIncident(world, { aggressor: vehicle, victim: target, deed: 'robbed', victimFights: false });
  interrupt(world, vehicle, fightGoal(world, vehicle, target, 'robCargo'));
}

export function sizeUpGoal(world: World, vehicle: Vehicle, target: Vehicle): NpcActivity {
  return { ...createActivity('sizeUp', target.id, { ...target.pos }, 'sizingUp'), chase: startChase(world, vehicle, target.pos) };
}

export function reactToLookOvers(world: World): void {
  for (const e of world.events) {
    if (e.t === 'lookedOver') reactToLookOver(world, e.target, e.by);
  }
}

function reactToLookOver(world: World, targetId: string, lookerId: string): void {
  const target = world.vehicles.find((v) => v.id === targetId);
  const looker = world.vehicles.find((v) => v.id === lookerId);
  if (!target?.brain || !looker || !noticesLooker(world, target, looker)) return;
  answerLookOver(world, target, npcProfile(target), looker, react(world, target, 'lookedOver', looker.id));
}

function noticesLooker(world: World, target: Vehicle, looker: Vehicle): boolean {
  return !isKnockedOut(target) && !inCombat(world, target) && canVehicleSee(world, target, looker.pos);
}

function answerLookOver(world: World, vehicle: Vehicle, profile: NpcProfile, looker: Vehicle, option: DecisionOptions['lookedOver'] | null): void {
  if (option === 'keepAway') interrupt(world, vehicle, fleeFrom(world, vehicle, profile, looker.id, looker.pos, 'sizedUpBy'));
  else if (option === 'warn') vehicle.brain!.noticed[`lookWarning:${looker.id}`] = world.turn;
}

export function warnsOffLooker(world: World, npc: Vehicle): boolean {
  return `lookWarning:${world.player.vehicleId}` in npc.brain!.noticed;
}

export function forgetLookWarning(world: World, npc: Vehicle): void {
  delete npc.brain!.noticed[`lookWarning:${world.player.vehicleId}`];
}

export function onSizingUp(world: World, vehicle: Vehicle): void {
  const goal = topGoal(vehicle);
  if (goal?.kind !== 'sizeUp') return;
  const target = vehicleById(world, goal.targetId!);
  if (knowsCargo(world, vehicle, target)) afterSizedUp(world, vehicle, target);
}

export function lookOverPrey(world: World, vehicle: Vehicle): void {
  const goal = topGoal(vehicle);
  if (goal?.kind !== 'sizeUp' || isKnockedOut(vehicle)) return;
  const target = vehicleById(world, goal.targetId!);
  if (canLookOver(world, vehicle, target) === null) startLookOver(world, vehicle, target);
}

function afterSizedUp(world: World, vehicle: Vehicle, target: Vehicle): void {
  if (!knowsCargo(world, vehicle, target)) throw new Error(`${vehicle.id} weighs the load of ${target.id} without a look-over`);
  const raid = huntsForLoot(world, vehicle, target);
  const danger = perceiveDanger(world, vehicle, target);
  const option = decide(world, vehicle, 'sizedUp', target.id, danger);
  if (option === 'keep') {
    recordPass(world, vehicle, target, danger);
    backOffPrey(world, vehicle, target, raid);
    return finishGoal(world, vehicle, 'poorLoad');
  }
  popGoal(world, vehicle, 'robCargo');
  if (raid) interrupt(world, vehicle, fightGoal(world, vehicle, target, 'fightHostile'));
  else startRobbery(world, vehicle, target);
}

function recordPass(world: World, vehicle: Vehicle, target: Vehicle, danger: number): void {
  if (!huntsPrey(vehicle) || !huntsOffRoad(vehicle.brain ?? undefined)) return;
  world.events.push({ t: 'preyPassed', vehicle: vehicle.id, prey: target.id, reason: passReason(world, vehicle, target, danger) });
}

function backOffPrey(world: World, vehicle: Vehicle, target: Vehicle, raid: boolean): void {
  addState(world, 'backedOff', vehicle.id, target.id, { kind: 'none' });
  if (raid) chooseOn(world, vehicle, target.id, target.pos, 'keep', true);
}

export function sizeUpInvalid(world: World, vehicle: Vehicle, goal: NpcActivity, contacts: Contact[]): GoalReason | null {
  const target = world.vehicles.find((v) => v.id === goal.targetId);
  if (!target || lostPrey(world, vehicle, target, contacts)) return 'lostTarget';
  if (fightBroke(world, vehicle, target)) return 'inCombat';
  return isHostile(world, vehicle, target) && !huntsForLoot(world, vehicle, target) ? 'contactGone' : null;
}

function lostPrey(world: World, vehicle: Vehicle, target: Vehicle, contacts: Contact[]): boolean {
  return isKnockedOut(target) || fightTargetLost(world, vehicle, target, contacts);
}

function fightBroke(world: World, vehicle: Vehicle, target: Vehicle): boolean {
  return inCombat(world, vehicle) || inCombat(world, target) || target.id in vehicle.brain!.attackers;
}

export function abandonLostSizing(world: World, vehicle: Vehicle, contacts: Contact[]): void {
  const goal = topGoal(vehicle);
  if (goal?.kind !== 'sizeUp' || sizeUpInvalid(world, vehicle, goal, contacts) !== 'lostTarget') return;
  if (world.vehicles.some((v) => v.id === goal.targetId)) addState(world, 'backedOff', vehicle.id, goal.targetId!, { kind: 'none' });
  finishGoal(world, vehicle, 'lostTarget');
}

export function joinSideFight(world: World, vehicle: Vehicle): void {
  const goal = topGoal(vehicle);
  if (goal?.kind !== 'sizeUp') return;
  const target = vehicleById(world, goal.targetId!);
  if (isKnockedOut(target) || !isHostile(world, vehicle, target) || !fightsSideOf(world, target, vehicle)) return;
  popGoal(world, vehicle, 'fightHostile');
  interrupt(world, vehicle, fightGoal(world, vehicle, target, 'fightHostile'));
}

export function abandonHopelessSizing(world: World, vehicle: Vehicle): void {
  const goal = topGoal(vehicle);
  if (goal?.kind !== 'sizeUp') return;
  const track = trackOf(vehicle, goal.targetId!);
  if (!track) throw new Error(`${vehicle.id} sizes up ${goal.targetId} with no track of it`);
  if (!chaseStalled(world, vehicle, goal, track.at, LOOK_OVER.reach)) return;
  const target = vehicleById(world, goal.targetId!);
  backOffPrey(world, vehicle, target, huntsForLoot(world, vehicle, target));
  finishGoal(world, vehicle, 'truckGotAway');
}

export function steerSizeUp(world: World, vehicle: Vehicle, goal: NpcActivity): void {
  const track = trackOf(vehicle, goal.targetId!);
  if (!track) throw new Error(`${vehicle.id} sizes up ${goal.targetId} with no track of it`);
  const target = vehicleById(world, goal.targetId!);
  const close = dist(vehicle.pos, target.pos) <= LOOK_OVER.reach * LOOK_OVER.holdShare && canVehicleSee(world, vehicle, target.pos);
  goal.destination = close ? null : { ...track.at };
}

export function sizesUpFirst(world: World, vehicle: Vehicle, enemy: Vehicle): boolean {
  return huntsForLoot(world, vehicle, enemy) && !knowsCargo(world, vehicle, enemy) && !(enemy.id in vehicle.brain!.attackers) && !fightsSideOf(world, enemy, vehicle);
}
