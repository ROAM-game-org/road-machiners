import { HOLLOW, SUNWARD } from '../data/sunward';
import { hollowPad, hollowReach } from './hollow-layout';
import { REGION, type TerritoryDef } from '../data/region';
import { RULES } from '../data/rules';
import { TIME } from '../data/time';
import { inCompany, joinCompany, followingOf, sameCompany } from './companies';
import { playerVehicle } from './damage';
import { isDefeated, isKnockedOut, patchBrokenCore, refitAtHome } from './defeat';
import { placeBase, topGoal } from './npc-activities';
import { getResources } from './resources';
import { isFree } from './spawn';
import { endState } from './states';
import { canDrag, dragHeldBy, inTowReach, isOnRope, startDrag } from './tow';
import { boundToOrder, callStrangers, dropSpot, lightZone, nearTheLight, offeringOf, seize } from './sunward-crater';
import { inTruce } from './relations';
import { canVehicleSee, grayRadius, tileCenter } from './vision';
import { fuelCap, suppliesCap } from './stats';
import { clockOf } from './sun';
import { canEnter, canUseSite, enterSite, isTerritory, leaveSite, shelteredAt, siteGap } from './sites';
import { territoryGrounds } from './territory';
import type { NpcActivity, NpcState, Obstacle, SunwardFacts, SunwardHunt, SunwardNight, Vehicle, World } from './types';
import { hashRandom } from './rng';
import { watchPost } from './watch-posts';
import type { NightZone } from './nav/layer';
import { dist, type Vec } from './vec';

export type SunwardPhase = 'rest' | 'ride' | 'vigil' | 'home' | 'fallen';
export type NightPhase = Exclude<SunwardPhase, 'fallen'>;

export const HOLLOW_ID = HOLLOW.id;
export const MEMBER_TEMPLATES: readonly string[] = ['cavalcade', 'hunter'];

const TURNS_PER_HOUR = TIME.turnsPerDay / 24;
const FALLEN_SUN = fallenSunDef();

function fallenSunDef(): TerritoryDef {
  const site = REGION.locations.find((l) => l.id === 'fallen-sun');
  if (!site || !isTerritory(site)) throw new Error('The Sunward keep their vigil at the Fallen Sun, and it is no territory');
  return site;
}

export function freshSunward(): SunwardFacts {
  return { collapsed: null, night: null, lastHunt: null };
}

export function sunwardFacts(world: World): SunwardFacts {
  if (!world.sunward) throw new Error('This world has no Sunward order');
  return world.sunward;
}

export function orderStands(world: World): boolean {
  return world.sunward !== null && world.sunward.collapsed === null;
}

function turnAtHour(day: number, hour: number): number {
  return Math.ceil(1 + ((day - 1) * 24 + hour - TIME.startHour) * TURNS_PER_HOUR);
}

export function duskTurn(day: number): number {
  return turnAtHour(day, TIME.sunset);
}

export function dawnAfter(dusk: number): number {
  return turnAtHour(clockOf(dusk).day + 1, TIME.sunrise);
}

export function returnTurn(dusk: number): number {
  return dawnAfter(dusk) - SUNWARD.returnMarginTurns;
}

export function lastDusk(turn: number): number {
  const day = clockOf(turn).day;
  const dusk = duskTurn(day);
  return turn >= dusk ? dusk : duskTurn(day - 1);
}

export function rideOutTurn(dusk: number): number {
  return dusk - SUNWARD.rideLeadTurns;
}

export function orderDusk(turn: number): number {
  if (turn < 0) throw new Error(`Turn ${turn} lies before the game began`);
  const day = clockOf(turn).day;
  return turn >= rideOutTurn(duskTurn(day)) ? duskTurn(day) : duskTurn(day - 1);
}

export function nextRideOut(turn: number): number {
  const day = clockOf(turn).day;
  return turn < rideOutTurn(duskTurn(day)) ? rideOutTurn(duskTurn(day)) : rideOutTurn(duskTurn(day + 1));
}

export function phaseAt(turn: number): NightPhase {
  const dusk = orderDusk(turn);
  if (turn >= dawnAfter(dusk)) return 'rest';
  if (turn < rideOutTurn(dusk) + SUNWARD.driveTurns) return 'ride';
  return turn < returnTurn(dusk) ? 'vigil' : 'home';
}

export function sunwardPhase(world: World): SunwardPhase {
  return sunwardFacts(world).collapsed !== null ? 'fallen' : phaseAt(world.turn);
}

export function orderRides(world: World): boolean {
  return orderStands(world) && phaseAt(world.turn) !== 'rest';
}

export function inNightWindow(turn: number): boolean {
  return turn < dawnAfter(lastDusk(turn));
}

export function nightWindow(world: World): boolean {
  return orderStands(world) && inNightWindow(world.turn);
}

export function keepsToItself(world: World, v: Vehicle): boolean {
  return isSunwardMember(v) && orderStands(world) && !inNightWindow(world.turn);
}

export function isSunwardMember(v: Vehicle): boolean {
  return v.faction === 'sunward' && v.brain !== null && MEMBER_TEMPLATES.includes(v.brain.templateId);
}

export function isCavalcadeCar(v: Vehicle): boolean {
  return isSunwardMember(v) && v.brain!.templateId === 'cavalcade';
}

export function isHunterCar(v: Vehicle): boolean {
  return isSunwardMember(v) && v.brain!.templateId === 'hunter';
}

export function membersOf(world: World): Vehicle[] {
  return [...shelteredAt(world, HOLLOW_ID), ...world.vehicles].filter(isSunwardMember);
}

function outsideMembers(world: World): Vehicle[] {
  return world.vehicles.filter(isSunwardMember);
}

export function hollowLampsLit(world: World, turn: number = world.turn): boolean {
  return orderStands(world) && inNightWindow(turn);
}

export function hollowHidden(world: World): boolean {
  return dist(playerVehicle(world).pos, HOLLOW.pos) > grayRadius(world) + hollowReach();
}

export function spawnsAtHollow(world: World): boolean {
  return orderStands(world) && phaseAt(world.turn) === 'rest' && hollowHidden(world);
}

export function discoverHollow(world: World, discover: (world: World, site: { id: string }) => void): void {
  if (world.sunward === null || world.player.discovered.includes(HOLLOW_ID)) return;
  const sightReach = hollowReach() + SUNWARD.sightMargin;
  if (dist(playerVehicle(world).pos, HOLLOW.pos) > grayRadius(world) + sightReach) return;
  const seen = world.player.visible.some((idx) => dist(tileCenter(world, idx), HOLLOW.pos) <= sightReach);
  if (seen) discover(world, { id: HOLLOW_ID });
}

export function advanceSunward(world: World): void {
  if (world.sunward === null) return;
  if (!orderStands(world)) {
    releaseFallen(world);
    return;
  }
  if (phaseAt(world.turn) !== 'rest') openTonight(world);
  restMembers(world);
  releaseRiders(world);
}

function openTonight(world: World): void {
  const facts = sunwardFacts(world);
  const dusk = orderDusk(world.turn);
  if (facts.night?.dusk !== dusk) facts.night = openNight(world, dusk);
  callStrangers(world);
  watchHunt(world);
}

function restMembers(world: World): void {
  for (const v of outsideMembers(world)) if (restsAtHome(world, v)) restInside(world, v);
}

function restsAtHome(world: World, v: Vehicle): boolean {
  const top = topGoal(v);
  return top?.kind === 'wait' && top.reason === 'restHollow' && goesHome(world, v, phaseAt(world.turn)) && !isKnockedOut(v);
}

function restInside(world: World, v: Vehicle): void {
  if (!canEnter(world, v, HOLLOW.site)) return;
  if (isDefeated(v)) refitAtHome(world, v);
  const stores = getResources(world, v);
  stores.fuel = Math.max(stores.fuel, fuelCap(v));
  stores.supplies = Math.max(stores.supplies, suppliesCap(v));
  enterSite(world, v, HOLLOW.site);
}

function releaseRiders(world: World): void {
  const riders = ridersTonight(world);
  const inside = new Set(shelteredAt(world, HOLLOW_ID).map((v) => v.id));
  const next = riders.find((id) => inside.has(id));
  if (next === undefined || !gateClear(world, riders) || !leaveSite(world, next)) return;
  planSunward(world, world.vehicles.find((v) => v.id === next)!);
}

function ridersTonight(world: World): string[] {
  const night = sunwardFacts(world).night;
  const phase = phaseAt(world.turn);
  if (!night || (phase !== 'ride' && phase !== 'vigil')) return [];
  return [...gateOrder(world, night), ...(huntOf(world)?.party ?? [])];
}

function gateClear(world: World, riders: string[]): boolean {
  const pad = hollowPad();
  return !world.vehicles.some((x) => riders.includes(x.id) && !isDefeated(x) && dist(x.pos, pad) < SUNWARD.padClear);
}

function releaseFallen(world: World): void {
  const [inside] = shelteredAt(world, HOLLOW_ID);
  if (inside) leaveSite(world, inside.id);
}

function openNight(world: World, dusk: number): SunwardNight {
  const roster = membersOf(world).filter((v) => isCavalcadeCar(v) && !isKnockedOut(v)).map((v) => v.id);
  const day = clockOf(dusk).day;
  const hunt = huntTonight(world, day) ? openHunt(world, day) : null;
  if (hunt) sunwardFacts(world).lastHunt = day;
  return { dusk, roster, beaten: [], calls: {}, hunt, shouted: [], offered: [] };
}

export function startHuntTonight(world: World): void {
  const night = sunwardFacts(world).night;
  if (!night || !orderRides(world)) throw new Error('A hunt rides out only on a night of the vigil');
  night.hunt = openHunt(world, clockOf(night.dusk).day);
}

export function huntTonight(world: World, day: number): boolean {
  const last = sunwardFacts(world).lastHunt;
  if (last !== null && day - last <= SUNWARD.huntCooldownNights) return false;
  return hashRandom(world.seed, day, SUNWARD.huntSalt) < SUNWARD.huntChance;
}

function openHunt(world: World, day: number): SunwardHunt | null {
  const party = membersOf(world).filter((v) => isHunterCar(v) && !isDefeated(v)).map((v) => v.id);
  return party.length > 0 ? { party, grounds: huntGrounds(world, day), prey: null, over: false, breaks: 0 } : null;
}

let roadNearCrater: Vec[] | null = null;

function huntRoads(): Vec[] {
  roadNearCrater ??= REGION.roads.flat().filter((p) => dist(p, FALLEN_SUN.pos) <= SUNWARD.huntReach && siteGap(FALLEN_SUN, p) > 0);
  if (roadNearCrater.length < 2) throw new Error('No road lies within the hunters\' reach of the Fallen Sun');
  return roadNearCrater;
}

function huntGrounds(world: World, day: number): Vec[] {
  const roads = huntRoads();
  const first = Math.floor(hashRandom(world.seed, day, SUNWARD.huntSalt, 1) * roads.length);
  const second = (first + 1 + Math.floor(hashRandom(world.seed, day, SUNWARD.huntSalt, 2) * (roads.length - 1))) % roads.length;
  return [{ ...roads[first] }, { ...roads[second] }];
}

export function huntOf(world: World): SunwardHunt | null {
  if (!orderRides(world)) return null;
  const hunt = sunwardFacts(world).night?.hunt ?? null;
  return hunt?.over === false ? hunt : null;
}

function hunting(world: World, v: Vehicle): SunwardHunt | null {
  const hunt = huntOf(world);
  return hunt && hunt.party.includes(v.id) && !isDefeated(v) ? hunt : null;
}

function huntGoal(world: World, v: Vehicle, hunt: SunwardHunt): NpcActivity {
  const leader = hunt.party.map((id) => world.vehicles.find((x) => x.id === id)).find((x) => x !== undefined && !isDefeated(x));
  if (leader && leader.id !== v.id) return goal('follow', leader.pos, 'huntRoad', leader.id);
  if (!nightWindow(world)) return { ...goal('wait', huntHide(world, hunt), 'huntRoad'), until: orderDusk(world.turn) };
  const next = nextGround(v, hunt.grounds);
  return goal('prowl', hunt.grounds[next === 'a' ? 0 : 1], 'huntRoad', next);
}

function huntHide(world: World, hunt: SunwardHunt): Vec {
  const ground = hunt.grounds[0];
  const hide = watchPost(world, ground);
  if (!hide) throw new Error(`No hide watches the hunt road at ${ground.x},${ground.y}`);
  return hide;
}

function nextGround(v: Vehicle, grounds: Vec[]): 'a' | 'b' {
  const current = v.brain!.goals[0];
  const heading = current?.kind === 'prowl' && current.reason === 'huntRoad' && (current.targetId === 'a' || current.targetId === 'b') ? current.targetId : 'a';
  const reached = dist(v.pos, grounds[heading === 'a' ? 0 : 1]) <= RULES.arriveRadius * 6;
  if (!reached) return heading;
  return heading === 'a' ? 'b' : 'a';
}

function seizeLonePrey(world: World, v: Vehicle): void {
  const hunt = hunting(world, v);
  if (!hunt || !nightWindow(world) || hunt.prey !== null || hunt.party[0] !== v.id) return;
  const prey = world.vehicles.find((x) => lonePrey(world, v, x));
  if (!prey) return;
  hunt.prey = prey.id;
  seize(world, v, prey);
}

function lonePrey(world: World, hunter: Vehicle, x: Vehicle): boolean {
  if (isSunwardMember(x) || isDefeated(x) || boundToOrder(world, hunter, x)) return false;
  return !inCompany(world, x) && canVehicleSee(world, hunter, x.pos);
}

function watchHunt(world: World): void {
  const hunt = huntOf(world);
  if (!hunt) return;
  for (const ending of huntDragEndings(world, hunt)) noteHuntDrag(hunt, ending);
  if (hunt.over || huntSpent(world, hunt)) endHunt(world, hunt);
}

function huntDragEndings(world: World, hunt: SunwardHunt): string[] {
  return world.events.flatMap((e) => (e.t === 'stateEnded' && e.state.kind === 'drag' && hunt.party.includes(e.state.holder) ? [e.ending] : []));
}

function huntSpent(world: World, hunt: SunwardHunt): boolean {
  const fallen = hunt.party.some((id) => world.vehicles.some((v) => v.id === id && isDefeated(v)));
  return fallen || hunt.breaks >= SUNWARD.huntBreaks || world.turn >= returnTurn(orderDusk(world.turn));
}

function noteHuntDrag(hunt: SunwardHunt, ending: string): void {
  if (ending === 'fulfilled') hunt.over = true;
  else hunt.breaks++;
}

function endHunt(world: World, hunt: SunwardHunt): void {
  hunt.over = true;
  for (const s of world.states.filter((x) => x.kind === 'feud' && hunt.party.includes(x.holder) && x.other === hunt.prey)) endState(world, s, 'expired');
}

export function vigilGrounds(): Vec[] {
  return territoryGrounds(FALLEN_SUN).filter((p) => siteGap(FALLEN_SUN, p) < -SUNWARD.vigilInset);
}

export function inFallenSun(pos: Vec): boolean {
  return dist(pos, FALLEN_SUN.pos) <= FALLEN_SUN.radius && siteGap(FALLEN_SUN, pos) < 0;
}

export function fallenSun(): TerritoryDef {
  return FALLEN_SUN;
}

function goal(kind: NpcActivity['kind'], destination: Vec | null, reason: NpcActivity['reason'], targetId: string | null = null): NpcActivity {
  return { kind, targetId, destination: destination ? { ...destination } : null, phase: destination ? 'travel' : 'act', reason };
}

function sameGoal(a: NpcActivity | undefined, b: NpcActivity): boolean {
  return a !== undefined && a.kind === b.kind && a.reason === b.reason && a.targetId === b.targetId;
}

export function planSunward(world: World, v: Vehicle): void {
  hitchPrey(world, v);
  seizeLonePrey(world, v);
  const wanted = baseGoal(world, v);
  joinColumn(world, v, wanted);
  if (!sameGoal(v.brain!.goals[0], wanted)) placeBase(world, v, wanted);
}

function baseGoal(world: World, v: Vehicle): NpcActivity {
  const drag = dragHeldBy(world, v.id);
  if (drag) return dragGoal(v, drag);
  const prey = nightWindow(world) ? preyToDrag(world, v) : null;
  if (prey) return goal('explore', prey.pos, 'dragToLight', prey.id);
  return nightDuty(world, v) ?? scheduleGoal(world, v);
}

function nightDuty(world: World, v: Vehicle): NpcActivity | null {
  const watched = phaseAt(world.turn) === 'vigil' ? offeringWatched(world, v) : null;
  if (watched) return goal('patrol', watched.pos, 'keepVigil', watched.id);
  const hunt = hunting(world, v);
  return hunt ? huntGoal(world, v, hunt) : null;
}

function offeringWatched(world: World, v: Vehicle): Vehicle | null {
  const holder = world.vehicles.find((x) => offeringOf(world, x.id) !== null);
  if (!holder) return null;
  const nearest = outsideMembers(world).filter((m) => !isDefeated(m)).sort((a, b) => dist(a.pos, holder.pos) - dist(b.pos, holder.pos)).slice(0, SUNWARD.watchers);
  return nearest.includes(v) ? holder : null;
}

function scheduleGoal(world: World, v: Vehicle): NpcActivity {
  const phase = phaseAt(world.turn);
  if (goesHome(world, v, phase)) return homeGoal(world, v);
  if (phase === 'vigil' || atCrater(v, phase)) return vigilGoal(world, v);
  return columnGoal(world, v, phase);
}

function goesHome(world: World, v: Vehicle, phase: NightPhase): boolean {
  return phase === 'rest' || !ridesTonight(world, v) || nearHome(v, phase);
}

function columnGoal(world: World, v: Vehicle, phase: NightPhase): NpcActivity {
  const ahead = carAhead(world, v, phase);
  if (!ahead) return leadGoal(world, v, phase);
  if (atStation(world, v, phase) && notClearYet(world, ahead, phase)) return holdStation(world, v, phase);
  return followGoal(ahead, phase);
}

function followGoal(ahead: Vehicle, phase: NightPhase): NpcActivity {
  return goal('follow', ahead.pos, phase === 'ride' ? 'rideVigil' : 'rideHome', ahead.id);
}

function notClearYet(world: World, ahead: Vehicle, phase: NightPhase): boolean {
  return phase === 'ride' ? dist(ahead.pos, HOLLOW.pos) < hollowReach() + SUNWARD.fileGap : atStation(world, ahead, phase);
}

function stationOf(world: World, v: Vehicle, phase: NightPhase): Vec {
  return phase === 'ride' ? v.brain!.home : postOf(world, v);
}

function atStation(world: World, v: Vehicle, phase: NightPhase): boolean {
  return dist(v.pos, stationOf(world, v, phase)) < SUNWARD.fileGap;
}

function holdStation(world: World, v: Vehicle, phase: NightPhase): NpcActivity {
  const until = returnTurn(sunwardFacts(world).night!.dusk);
  return { ...goal('wait', stationOf(world, v, phase), phase === 'ride' ? 'restHollow' : 'keepVigil'), until: phase === 'ride' ? until : dawnAfter(sunwardFacts(world).night!.dusk) };
}

function carAhead(world: World, v: Vehicle, phase: NightPhase): Vehicle | null {
  const column = gateOrder(world, sunwardFacts(world).night!).flatMap((id) => world.vehicles.filter((x) => x.id === id && !isDefeated(x) && inColumn(x, phase)));
  const at = column.findIndex((x) => x.id === v.id);
  if (at < 0) throw new Error(`${v.id} rides tonight but is not in the Cavalcade's column`);
  return at === 0 ? null : column[at - 1];
}

function inColumn(v: Vehicle, phase: NightPhase): boolean {
  return phase === 'ride' ? !atCrater(v, phase) : !nearHome(v, phase);
}

export function gateOrder(world: World, night: SunwardNight): string[] {
  const here = new Set(membersOf(world).map((v) => v.id));
  return night.roster.filter((id) => here.has(id));
}

function atCrater(v: Vehicle, phase: NightPhase): boolean {
  return phase === 'ride' && inFallenSun(v.pos);
}

function homeGoal(world: World, v: Vehicle): NpcActivity {
  if (canUseSite(v.pos, HOLLOW.site)) return { ...goal('wait', v.brain!.home, 'restHollow'), until: nextRideOut(world.turn) };
  return goal('explore', v.brain!.home, 'rideHome');
}

function leadGoal(world: World, v: Vehicle, phase: NightPhase): NpcActivity {
  return phase === 'ride' ? goal('explore', postOf(world, v), 'rideVigil') : goal('explore', v.brain!.home, 'rideHome');
}

function vigilGoal(world: World, v: Vehicle): NpcActivity {
  return { ...goal('wait', postOf(world, v), 'keepVigil'), until: returnTurn(sunwardFacts(world).night!.dusk) };
}

const HELD_POSTS: readonly NpcActivity['reason'][] = ['keepVigil', 'huntRoad'];

export function holdsPost(v: Vehicle): boolean {
  const top = topGoal(v);
  return isSunwardMember(v) && top?.kind === 'wait' && HELD_POSTS.includes(top.reason) && top.destination !== null && dist(v.pos, top.destination) <= RULES.arriveRadius * 2;
}

function postOf(world: World, v: Vehicle): Vec {
  const night = sunwardFacts(world).night!;
  const seat = gateOrder(world, night).indexOf(v.id);
  if (seat < 0) throw new Error(`${v.id} keeps no post at the vigil tonight`);
  return { ...vigilPosts(world)[seat] };
}

const POSTS = new WeakMap<object, Vec[]>();

export function vigilPosts(world: World): Vec[] {
  let posts = POSTS.get(world.terrain);
  if (!posts) {
    posts = pickPosts(world);
    POSTS.set(world.terrain, posts);
  }
  return posts;
}

function pickPosts(world: World): Vec[] {
  const zone = lightZone();
  const ring = zone.radius + SUNWARD.postGap;
  const empty = { ...world, vehicles: [] };
  const spots = Array.from({ length: SUNWARD.postSamples }, (_, k) => (k * 2 * Math.PI) / SUNWARD.postSamples)
    .map((a) => ({ x: zone.pos.x + Math.cos(a) * ring, y: zone.pos.y + Math.sin(a) * ring }))
    .filter((p) => isFree(empty, p, SUNWARD.postClearance, null))
    .sort((a, b) => dist(b, HOLLOW.pos) - dist(a, HOLLOW.pos));
  const posts: Vec[] = [];
  for (const p of spots) if (posts.length < SUNWARD.cavalcade && posts.every((q) => dist(p, q) >= SUNWARD.postSpacing)) posts.push(p);
  if (posts.length < SUNWARD.cavalcade) throw new Error(`Only ${posts.length} vigil posts fit round the Fallen Sun's light, not ${SUNWARD.cavalcade}`);
  return posts;
}

function ridesTonight(world: World, v: Vehicle): boolean {
  const night = sunwardFacts(world).night;
  return night !== null && night.roster.includes(v.id) && !isDefeated(v);
}

function nearHome(v: Vehicle, phase: NightPhase): boolean {
  return phase === 'home' && dist(v.pos, HOLLOW.pos) <= hollowReach() + RULES.arriveRadius * 4;
}

function joinColumn(world: World, v: Vehicle, wanted: NpcActivity): void {
  const held = followingOf(world, v);
  if (held?.kind === 'cavalcade' && held.other !== wanted.targetId) endState(world, held, 'expired');
  if (wanted.kind === 'follow' && !followingOf(world, v)) joinCompany(world, v, columnHead(world, wanted), 'cavalcade', { kind: 'none' });
}

function columnHead(world: World, wanted: NpcActivity): Vehicle {
  const leader = world.vehicles.find((x) => x.id === wanted.targetId);
  if (!leader) throw new Error(`The Cavalcade's leader ${wanted.targetId} is gone`);
  return leader;
}

function dragGoal(v: Vehicle, drag: NpcState): NpcActivity {
  const lane = dropSpot(v.pos);
  return goal('explore', nearTheLight(v.pos) ? lane.stop : lane.approach, 'dragToLight', drag.other);
}

export function dragsStraight(world: World, v: Vehicle): boolean {
  return isSunwardMember(v) && dragHeldBy(world, v.id) !== null && nearTheLight(v.pos);
}

function preyToDrag(world: World, v: Vehicle): Vehicle | null {
  const claimed = new Set(membersOf(world).filter((m) => m.id !== v.id).flatMap((m) => m.brain!.goals.filter((g) => g.reason === 'dragToLight').map((g) => g.targetId)));
  const prey = world.vehicles.filter((x) => !claimed.has(x.id) && canDrag(world, v, x, isSunwardMember) && !inTruce(world, v, x) && canVehicleSee(world, v, x.pos));
  return prey.sort((a, b) => dist(v.pos, a.pos) - dist(v.pos, b.pos))[0] ?? null;
}

function hitchPrey(world: World, v: Vehicle): void {
  const held = v.brain!.goals.find((g) => g.reason === 'dragToLight' && g.kind === 'explore');
  const prey = held && !dragHeldBy(world, v.id) ? world.vehicles.find((x) => x.id === held.targetId) : undefined;
  if (prey && inTowReach(v, prey) && canDrag(world, v, prey, isSunwardMember)) startDrag(world, v, prey, dropSpot(v.pos).stop, isSunwardMember);
}

export function sunwardNext(world: World, v: Vehicle): NpcActivity {
  planSunward(world, v);
  const top = topGoal(v);
  if (!top) throw new Error(`${v.id} of the Sunward was given no goal`);
  return top;
}

export function sunwardRetreat(world: World, v: Vehicle): NpcActivity {
  const wanted = homeGoal(world, v);
  // Defeated riders do not run the normal column planner. End their column state and
  // discard its follow goal, or it will keep overriding the home goal forever.
  joinColumn(world, v, wanted);
  const hadFollow = v.brain!.goals.some((g) => g.kind === 'follow');
  if (hadFollow) v.brain!.goals = v.brain!.goals.filter((g) => g.kind !== 'follow');
  if (hadFollow || !sameGoal(v.brain!.goals[0], wanted) || topGoal(v) === null) placeBase(world, v, wanted);
  return topGoal(v)!;
}

const ORDER_STATES: readonly NpcState['kind'][] = ['cavalcade', 'offering', 'drag'];

export function noteSunwardDefeat(world: World, beaten: Vehicle, actor: Vehicle): void {
  const night = orderStands(world) ? sunwardFacts(world).night : null;
  if (!night || !counts(world, night, beaten, actor)) return;
  night.beaten.push(beaten.id);
  if (night.beaten.length >= SUNWARD.collapseAt) collapseOrder(world);
}

function counts(world: World, night: SunwardNight, beaten: Vehicle, actor: Vehicle): boolean {
  return nightWindow(world) && lastDusk(world.turn) === night.dusk && night.roster.includes(beaten.id) && !night.beaten.includes(beaten.id) && byPlayersCompany(world, actor);
}

function byPlayersCompany(world: World, actor: Vehicle): boolean {
  const me = playerVehicle(world);
  return actor.id === me.id || sameCompany(world, actor, me);
}

export function collapseOrder(world: World): void {
  const facts = sunwardFacts(world);
  requireFall(facts);
  facts.collapsed = world.turn;
  for (const s of world.states.filter((x) => ORDER_STATES.includes(x.kind))) if (world.states.includes(s)) endState(world, s, 'expired');
  for (const v of membersOf(world)) leaveOrder(world, v);
  world.events.push({ t: 'sunwardFallen' });
}

function requireFall(facts: SunwardFacts): void {
  if (facts.collapsed !== null) throw new Error('The Sunward order has already fallen');
  const beaten = facts.night?.beaten.length ?? 0;
  if (beaten < SUNWARD.collapseAt) throw new Error(`The Sunward order falls only after ${SUNWARD.collapseAt} Cavalcade cars are beaten in one night, not ${beaten}`);
}

function leaveOrder(world: World, v: Vehicle): void {
  const previous = topGoal(v);
  v.faction = 'independent';
  v.brain!.traits = ['roamer'];
  v.brain!.goals = [];
  world.events.push({ t: 'activity', vehicle: v.id, previous: previous?.kind ?? null, activity: null, reason: 'orderFell' });
  if (v.defeat?.phase !== 'out') return;
  patchBrokenCore(v);
  v.defeat = { ...v.defeat, phase: 'retreat', unseen: 0 };
}

const SHUNNED: readonly NpcActivity['kind'][] = ['scavenge', 'prowl', 'raid', 'patrol', 'travel', 'explore', 'trade', 'sell', 'resupply', 'investigate', 'claim', 'loot'];

export function avoidsCrater(world: World, v: Vehicle): boolean {
  return v.brain !== null && !isSunwardMember(v) && nightWindow(world);
}

export function inCraterZone(pos: Vec): boolean {
  return siteGap(FALLEN_SUN, pos) < SUNWARD.avoidMargin;
}

export const CRATER_NIGHT: NightZone = { center: FALLEN_SUN.pos, reach: FALLEN_SUN.radius + SUNWARD.avoidMargin, cost: SUNWARD.avoidCost, inside: (x, y) => inCraterZone({ x, y }) };

export function shunsAtNight(world: World, v: Vehicle, g: NpcActivity): boolean {
  return SHUNNED.includes(g.kind) && g.destination !== null && avoidsCrater(world, v) && inCraterZone(g.destination);
}

export function nightSafe(world: World, v: Vehicle, next: NpcActivity): NpcActivity {
  if (!shunsAtNight(world, v, next)) return next;
  return inCraterZone(v.pos) ? goal('explore', craterExit(v.pos), 'leaveCrater') : goal('wait', null, 'leaveCrater');
}

export function craterExit(from: Vec): Vec {
  const away = Math.atan2(from.y - FALLEN_SUN.pos.y, from.x - FALLEN_SUN.pos.x);
  for (let r = FALLEN_SUN.radius; r < FALLEN_SUN.radius * 3; r += 4) {
    const p = { x: FALLEN_SUN.pos.x + Math.cos(away) * r, y: FALLEN_SUN.pos.y + Math.sin(away) * r };
    if (!inCraterZone(p)) return p;
  }
  throw new Error(`No way out of the Fallen Sun's night zone from ${from.x}, ${from.y}`);
}
