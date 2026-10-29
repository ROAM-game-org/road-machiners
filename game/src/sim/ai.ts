import { NPC_BEHAVIOR, NPCS, SPAWN } from "../data/npcs";
import { sustainedDamage } from "../data/parts";
import { RULES } from "../data/rules";
import { PHYSICS } from "../data/physics";
import { REGION } from "../data/region";
import { isKnockedOut } from "./defeat";
import { isNear } from "./far";
import { thinksThisTurn } from "./fidelity";
import { getActivityDestination, thinkNpc, topGoal, turnCornered } from "./npc-activities";
import { ObstacleBuckets } from "./nav/buckets";
import { aheadGoal, clearLines, route, routeLength, type Blocker } from "./path";
import { randRange } from "./rng";
import { isFree } from "./spawn";
import { parkedVehicles } from "./steering";
import { fieldBlockers } from "./hazards";
import { driveStats, isStranded, vehicleRadius, vehicleStats, type MountedWeapon } from "./stats";
import { waitsForFollowers } from "./company-wait";
import { followPace, getHitchedTowIds, isOnRope, ropeClientOf } from "./tow";
import { ramImpact, ramValue } from "./crash-contact";
import { ramsReadily } from "./npc-decisions";
import type { MoveOrder, NpcActivity, Vehicle, World } from "./types";
import { angleDiff, bearing, dist, type Vec } from "./vec";
import { canVehicleSee } from "./vision";
import { bodyHitChance, inArc, inCombat } from "./combat";
import { rigDiscs } from "./rig";
import { passShare, sideToward } from "./armor";
import { chance } from "./rng";
import { heldGoal, holdOnStretch, rollingOrder, runsDown } from "./hunters";
import { dragsStraight } from "./sunward";

function planners(world: World): Vehicle[] {
  return world.vehicles.filter((v) => v.brain && !isOnRope(world, v.id) && !isKnockedOut(v) && thinksThisTurn(world, v));
}

type Plan = { v: Vehicle; activity: NpcActivity; goal: Vec | null };

export function planNpcOrders(world: World): void {
  const plans = planners(world).map((v) => thinkOrderPoint(world, v));
  plans.sort((a, b) => (a.v.id < b.v.id ? 1 : -1));
  for (const plan of plans) setOrder(world, plan);
}

function thinkOrderPoint(world: World, v: Vehicle): Plan {
  const b = v.brain!;
  delete b.ramTarget;
  if (b.recovery) b.recovery--;
  const activity = thinkNpc(world, v);
  return { v, activity, goal: orderPoint(world, v, activity) };
}

function setOrder(world: World, { v, activity, goal }: Plan): void {
  const held = heldGoal(world, v, goal);
  noteStuck(world, v, held);
  const stops = goal !== null && !(activity.kind === "fight" && runsDown(world, v)) && trafficStops(world, v, goal);
  noteStall(world, v, (stops && activity.kind !== "fight" && activity.kind !== "flee") || waitsOnHold(v, goal, held));
  v.order = nextOrder(world, v, activity, goal, stops);
  v.direct = dragsStraight(world, v);
}

function noteStuck(world: World, v: Vehicle, goal: Vec | null): void {
  const b = v.brain!;
  b.stuck = heldAway(v, goal) ? (b.stuck ?? 0) + 1 : 0;
  if (b.stuck < RULES.unstick.turns) return;
  if (turnCornered(world, v)) {
    b.stuck = 0;
    return;
  }
  const spot = freeSpotNear(world, v);
  if (!spot) return;
  b.recovery = RULES.unstick.driveTurns;
  b.recoveryGoal = spot;
  b.stuck = 0;
}

function waitsOnHold(v: Vehicle, goal: Vec | null, held: Vec | null): boolean {
  return held !== goal && dist(v.pos, held!) <= RULES.arriveRadius * 2;
}

function heldAway(v: Vehicle, goal: Vec | null): boolean {
  const b = v.brain!;
  if (!goal || !b.lastPos || b.recovery) return false;
  return dist(v.pos, b.lastPos) < RULES.arriveRadius / 2 && dist(v.pos, goal) > RULES.arriveRadius * 2;
}

function freeSpotNear(world: World, v: Vehicle): Vec | null {
  const radius = vehicleRadius(v);
  for (let i = 0; i < SPAWN.tries; i++) {
    const angle = randRange(world, 0, Math.PI * 2);
    const d = randRange(world, radius * 2, RULES.unstick.reach);
    const spot = { x: v.pos.x + Math.cos(angle) * d, y: v.pos.y + Math.sin(angle) * d };
    if (isFree(world, spot, radius, v.id)) return spot;
  }
  return null;
}

function noteStall(world: World, v: Vehicle, yielding: boolean): void {
  const b = v.brain!;
  b.stalled = !yielding && barelyMoved(v) ? (b.stalled ?? 0) + 1 : 0;
  b.lastPos = { ...v.pos };
  if (b.stalled < RULES.npcStuckTurns) return;
  if (turnCornered(world, v)) b.stalled = 0;
  else startRecovery(v);
}

function barelyMoved(v: Vehicle): boolean {
  const last = v.brain!.lastPos;
  return !!last && !!v.order && v.order.kind !== "brake" && dist(v.pos, last) < RULES.arriveRadius / 2;
}

function startRecovery(v: Vehicle): void {
  const b = v.brain!;
  const back = RULES.reverse.distance + RULES.minAimDistance;
  b.recovery = RULES.npcRecoveryTurns;
  b.recoveryGoal = { x: v.pos.x - Math.cos(v.heading) * back, y: v.pos.y - Math.sin(v.heading) * back };
  b.stalled = 0;
}

function nextOrder(world: World, v: Vehicle, activity: NpcActivity, goal: Vec | null, stops: boolean): MoveOrder {
  if (!goal) return { kind: "brake" };
  if (v.brain!.recovery) return holdOnStretch(world, v, { kind: "stopAt", dest: v.brain!.recoveryGoal! });
  if (stops || waitsForFollowers(world, v, activity)) return { kind: "brake" };
  return holdOnStretch(world, v, driveOrder(world, v, activity, goal));
}

function orderPoint(world: World, v: Vehicle, activity: NpcActivity): Vec | null {
  if (activity.kind !== "fight") return getActivityDestination(world, v, activity);
  const target = world.vehicles.find((other) => other.id === activity.targetId);
  if (!target) throw new Error("Fight activity missing its target");
  if (!canVehicleSee(world, v, target.pos)) return getActivityDestination(world, v, activity);
  const seen = perceivedTarget(world, v, target);
  noteTarget(world, v, target);
  return computeFightGoal(world, v, target, seen);
}

function driveOrder(world: World, v: Vehicle, activity: NpcActivity, dest: Vec): MoveOrder {
  if (v.brain!.ramTarget) return { kind: "through", dest };
  const rolling = rollingOrder(world, v);
  if (rolling) return rolling;
  const foe = foeInSight(world, v, activity);
  if (foe) return fightOrder(world, v, foe, dest);
  if (runsDown(world, v)) return { kind: "through", dest };
  return followOrder(world, v, activity, dest);
}

function followOrder(world: World, v: Vehicle, activity: NpcActivity, dest: Vec): MoveOrder {
  const leader = activity.kind === "follow" ? world.vehicles.find((x) => x.id === activity.targetId) : undefined;
  if (!leader || leader.speed <= RULES.parkedSpeed) return { kind: "stopAt", dest };
  if (dist(v.pos, leader.pos) > NPC_BEHAVIOR.escortCatchUpGap) return { kind: "through", dest };
  return { kind: "through", dest, pace: followPace(v, leader, dest) };
}

function foeInSight(world: World, v: Vehicle, activity: NpcActivity): Vehicle | null {
  if (activity.kind !== "fight") return null;
  const foe = world.vehicles.find((x) => x.id === activity.targetId);
  return foe && canVehicleSee(world, v, foe.pos) ? foe : null;
}

function computeFightGoal(world: World, v: Vehicle, target: Vehicle, seen: Vehicle): Vec | null {
  const b = v.brain!;
  if (charges(world, v, target)) {
    b.ramTarget = target.id;
    return leadOf(target);
  }
  if (haltsOnWhim(world, v)) return null;
  const lead = leadOf(seen);
  const clearance = vehicleRadius(v) + vehicleRadius(target) + RULES.yieldDistance;
  if (b.whim?.kind === "veer") {
    const range = Math.max(shortestRange(world, v) - RULES.arriveRadius, clearance);
    return { x: lead.x + Math.cos(b.whim.angle) * range, y: lead.y + Math.sin(b.whim.angle) * range };
  }
  if (!runsDown(world, v) && dist(v.pos, seen.pos) > longestRange(world, v)) return interceptOf(world, v, seen);
  return fightPoint(world, v, seen, clearance);
}

export function interceptOf(world: World, v: Vehicle, seen: Vehicle): Vec {
  const maxSpeed = driveStats(world, v).maxSpeed;
  if (maxSpeed <= 0) return { ...seen.pos };
  const turns = dist(v.pos, seen.pos) / maxSpeed;
  const ahead = Math.min(seen.speed * turns, maxSpeed);
  return { x: seen.pos.x + Math.cos(seen.heading) * ahead, y: seen.pos.y + Math.sin(seen.heading) * ahead };
}

function haltsOnWhim(world: World, v: Vehicle): boolean {
  return v.brain!.whim?.kind === "halt" && !runsDown(world, v);
}

export function perceivedTarget(world: World, v: Vehicle, target: Vehicle): Vehicle {
  const seen = v.brain!.targetSeen;
  if (!seen || seen.id !== target.id || seen.turn >= world.turn) return target;
  return { ...target, pos: { ...seen.pos }, heading: seen.heading, speed: seen.speed };
}

export function noteTarget(world: World, v: Vehicle, target: Vehicle): void {
  v.brain!.targetSeen = { id: target.id, turn: world.turn, pos: { ...target.pos }, heading: target.heading, speed: target.speed };
}

function rams(world: World, v: Vehicle, target: Vehicle): boolean {
  const b = v.brain!;
  return b.whim?.kind === "rush" || (b.ramChoice === target.id && ramImpact(world, v, target) !== null);
}

function charges(world: World, v: Vehicle, target: Vehicle): boolean {
  return rams(world, v, target) || vehicleStats(world, v).weapons.length === 0;
}

function shortestRange(world: World, v: Vehicle): number {
  return Math.min(...gunRanges(world, v));
}

function longestRange(world: World, v: Vehicle): number {
  return Math.max(...gunRanges(world, v));
}

function gunRanges(world: World, v: Vehicle): number[] {
  const weapons = vehicleStats(world, v).weapons;
  if (weapons.length === 0) throw new Error(`${v.id} is fighting without a gun`);
  return weapons.map((weapon) => weapon.def.range);
}

const F = NPC_BEHAVIOR.fight;
const QUARTER = Math.PI / 2;

export function leadOf(target: Vehicle): Vec {
  return { x: target.pos.x + Math.cos(target.heading) * target.speed, y: target.pos.y + Math.sin(target.heading) * target.speed };
}

export function fightPoint(world: World, v: Vehicle, target: Vehicle, clearance: number): Vec {
  const lead = leadOf(target);
  const turn = circleTurn(world, v);
  const reach = longestRange(world, v) - RULES.arriveRadius;
  const clear = clearLines(world, vehicleRadius(v), []);
  let best: Candidate | null = null;
  for (const share of F.rings) {
    const r = Math.max(clearance, share * reach);
    for (let i = 0; i < F.angles; i++) {
      const a = (2 * Math.PI * i) / F.angles;
      const p = { x: lead.x + Math.cos(a) * r, y: lead.y + Math.sin(a) * r };
      const score = scorePoint(world, v, target, lead, p, turn);
      const fires = bearingShare(world, v, { ...target, pos: lead }, p) > 0;
      const open = clear(v.pos, p);
      if (!best || beats({ p, score, fires, open }, best)) best = { p, score, fires, open };
    }
  }
  return best!.p;
}

type Candidate = { p: Vec; score: number; fires: boolean; open: boolean };

function beats(a: Candidate, b: Candidate): boolean {
  if (a.open !== b.open) return a.open;
  return a.fires === b.fires ? a.score > b.score : a.fires;
}

function bearingShare(world: World, v: Vehicle, there: Vehicle, p: Vec): number {
  const me = afterTurn(world, v, p);
  return gunShare(vehicleStats(world, v).weapons, (mw) => inReach(me, mw, there));
}

function circleTurn(world: World, v: Vehicle): number {
  if (NPCS[v.brain!.templateId].fightStyle !== 'circle') return 0;
  v.brain!.fightTurn ??= chance(world, 0.5) ? 1 : -1;
  return v.brain!.fightTurn;
}

export function scorePoint(world: World, v: Vehicle, target: Vehicle, lead: Vec, p: Vec, turn: number): number {
  const sv = driveStats(world, v);
  const me = afterTurn(world, v, p);
  const there = { ...target, pos: lead };
  const mine = exposure(world, v, me, there);
  const theirs = exposure(world, target, there, me);
  const travel = Math.max(0, dist(v.pos, p) - sv.maxSpeed) / Math.max(sv.maxSpeed, RULES.arriveRadius);
  const ahead = turn === 0 ? 0 : Math.min(1, (turn * angleDiff(bearing(lead, v.pos), bearing(lead, p))) / QUARTER);
  const rammed = ramValue(world, there, me);
  const seek = ramsReadily(world, v, target.id) ? ramValue(world, me, there) : 0;
  return F.arcWeight * mine - F.threatWeight * theirs - F.travelWeight * travel + F.circleWeight * ahead - F.rammedWeight * rammed + F.ramWeight * seek;
}

export function afterTurn(world: World, v: Vehicle, p: Vec): Vehicle {
  const d = dist(v.pos, p);
  if (d <= RULES.arriveRadius) return v;
  const sv = driveStats(world, v);
  const heading = bearing(v.pos, p);
  const step = Math.min(d, sv.maxSpeed, v.speed + sv.accel);
  return { ...v, pos: { x: v.pos.x + Math.cos(heading) * step, y: v.pos.y + Math.sin(heading) * step }, heading };
}

export function exposure(world: World, shooter: Vehicle, at: Vehicle, v: Vehicle): number {
  const working = vehicleStats(world, shooter).weapons.filter((mw) => mw.part.hp > 0);
  const total = working.reduce((sum, mw) => sum + sustainedDamage(mw.def), 0);
  if (total === 0) return 0;
  const side = sideToward(v, at.pos);
  const landed = (mw: MountedWeapon) => sustainedDamage(mw.def) * bodyHitChance(world, at, mw, v) * passShare(v, side, mw.def.round);
  return working.filter((mw) => inReach(at, mw, v)).reduce((sum, mw) => sum + landed(mw), 0) / total;
}

function inReach(shooter: Vehicle, mw: MountedWeapon, target: Vehicle): boolean {
  const gap = dist(shooter.pos, target.pos);
  return gap > 0 && gap <= mw.def.range && inArc(shooter, mw, target);
}

function gunShare(weapons: MountedWeapon[], bears: (mw: MountedWeapon) => boolean): number {
  const working = weapons.filter((mw) => mw.part.hp > 0);
  const perTurn = (mw: MountedWeapon) => sustainedDamage(mw.def);
  const total = working.reduce((sum, mw) => sum + perTurn(mw), 0);
  if (total === 0) return 0;
  return working.filter(bears).reduce((sum, mw) => sum + perTurn(mw), 0) / total;
}

export function fightOrder(world: World, v: Vehicle, target: Vehicle, dest: Vec): MoveOrder {
  const circling = NPCS[v.brain!.templateId].fightStyle === 'circle';
  if (!circling && target.speed < RULES.parkedSpeed) return { kind: 'stopAt', dest };
  const keepUp = target.speed + dist(v.pos, dest);
  return { kind: 'through', dest, pace: circling ? Math.max(F.circlePace, keepUp) : keepUp };
}

export function followsTraffic(world: World, v: Vehicle): boolean {
  return !!v.brain || v.id === world.player.vehicleId;
}

export function yieldsToTraffic(world: World, v: Vehicle): boolean {
  if (v.brain || v.id !== world.player.vehicleId || v.direct) return false;
  const order = v.order;
  if (!order || order.kind === "brake" || inCombat(world, v)) return false;
  return trafficStops(world, v, order.dest);
}

export function standingBlockers(world: World, v: Vehicle): Blocker[] {
  const stopping = conflicts(world, v, 0).filter((x) => givesWayTo(world, x, v) && stopsInPlace(world, x));
  return [...parkedVehicles(world, v.id, getHitchedTowIds(world)), ...fieldBlockers(world, v), ...stopping.flatMap((x) => stopTrack(world, v, x))];
}

export function routeBlockers(world: World, v: Vehicle): Blocker[] {
  const standing = standingBlockers(world, v);
  if (!followsTraffic(world, v)) return standing;
  const swerves = conflicts(world, v, 1).filter((x) => !givesWayTo(world, x, v));
  const kept = heldHolders(world, v).filter((x) => !swerves.includes(x));
  return [...standing, ...[...swerves, ...kept].flatMap((x) => sweptPath(world, v, x))];
}

function heldHolders(world: World, v: Vehicle): Vehicle[] {
  if (!v.yieldsTo) return [];
  return v.yieldsTo.flatMap((id) => {
    const holder = world.vehicles.find((x) => x.id === id);
    return holder && givesWayTo(world, v, holder) ? [holder] : [];
  });
}

export function trafficStops(world: World, v: Vehicle, dest: Vec): boolean {
  if (facesParked(world, v)) return true;
  if (!isNear(world, v)) return false;
  const moving = meeting(world, v);
  if (moving.length === 0) return false;
  const parked = parkedVehicles(world, v.id, getHitchedTowIds(world));
  const radius = vehicleRadius(v);
  const goal = aheadGoal(world, v.pos, dest, radius, parked, v, REGION.navigation.farWindow);
  const open = route(world, v.pos, goal, radius, parked, v);
  const around = route(world, v.pos, goal, radius, [...parked, ...moving.flatMap((x) => sweptPath(world, v, x))], v);
  if (dist(open.at(-1)!, around.at(-1)!) > 0) return true;
  const { vs, t } = horizon(world, v);
  if (routeLength(v.pos, around) - routeLength(v.pos, open) > vs * t) return true;
  return moving.some((x) => !passesClear(world, v, x, around));
}

function passesClear(world: World, v: Vehicle, x: Vehicle, around: Vec[]): boolean {
  const radii = vehicleRadius(v) + vehicleRadius(x) + PHYSICS.driver.clearMargin;
  const { vs, t } = horizon(world, v);
  const at = (d: number): Vec => alongRoute(v.pos, around, d);
  for (let s = 0; s <= t; s += RULES.traffic.passStep) {
    const there = { x: x.pos.x + Math.cos(x.heading) * x.speed * s, y: x.pos.y + Math.sin(x.heading) * x.speed * s };
    if (dist(at(vs * s), there) < radii + PHYSICS.driver.moverSpread * s) return false;
  }
  return true;
}

function alongRoute(from: Vec, points: Vec[], d: number): Vec {
  let at = from;
  let left = d;
  for (const p of points) {
    const leg = dist(at, p);
    if (left <= leg) return leg === 0 ? at : { x: at.x + ((p.x - at.x) * left) / leg, y: at.y + ((p.y - at.y) * left) / leg };
    left -= leg;
    at = p;
  }
  return at;
}

function others(world: World, v: Vehicle): Vehicle[] {
  return world.vehicles.filter((x) => x.id !== v.id && x.id !== v.brain?.ramTarget && !onOwnRope(world, v, x));
}

function meeting(world: World, v: Vehicle): Vehicle[] {
  const closing = conflicts(world, v, 0);
  const stopped = v.speed < RULES.parkedSpeed ? others(world, v).filter((x) => x.speed >= RULES.parkedSpeed && closesOn(world, x, v, 0) && !closing.includes(x)) : [];
  return [...closing, ...stopped].filter((x) => !givesWayTo(world, x, v));
}

function conflicts(world: World, v: Vehicle, leadTurns: 0 | 1): Vehicle[] {
  return others(world, v).filter((x) => x.speed >= RULES.parkedSpeed && closesOn(world, v, x, leadTurns));
}

function closesOn(world: World, v: Vehicle, x: Vehicle, leadTurns: 0 | 1): boolean {
  const gap = gapAhead(world, v, x, RULES.traffic.crossCone);
  return gap !== null && gap < brakingReach(world, v, x) + leadTurns * (v.speed + x.speed) && pathsMeet(world, v, x);
}

function facesParked(world: World, v: Vehicle): boolean {
  return others(world, v).some((x) => {
    if (x.speed >= RULES.parkedSpeed) return false;
    const gap = gapAhead(world, v, x);
    return gap !== null && v.id < x.id && facesOff(world, v, x, gap);
  });
}

export function givesWayTo(world: World, giver: Vehicle, holder: Vehicle): boolean {
  return !!giver.yieldsTo?.includes(holder.id) && givesWay(world, giver) && givesWay(world, holder);
}

export function settleMeetings(world: World): void {
  const live = world.vehicles.filter((v) => isNear(world, v) && followsTraffic(world, v));
  const byId = new Map(live.map((v) => [v.id, v]));
  for (const giver of live) endMeetings(world, giver, byId);
  const index = new ObstacleBuckets(live.map((v) => ({ pos: v.pos, r: driveStats(world, v).radius })), world.terrain.size);
  const bySpot = new Map(live.map((v) => [v.pos, v]));
  const widest = Math.max(0, ...live.map((v) => ownReach(world, v)));
  for (const a of live) {
    if (!givesWay(world, a)) continue;
    for (const near of index.alongSegment(a.pos, a.pos, RULES.yieldDistance + ownReach(world, a) + widest)) startMeeting(world, a, bySpot.get(near.pos)!);
  }
}

function ownReach(world: World, v: Vehicle): number {
  const s = vehicleStats(world, v);
  const vs = Math.min(s.maxSpeed, v.speed + s.accel);
  return 2 * vs + vs ** 2 / (2 * s.brake);
}

function endMeetings(world: World, giver: Vehicle, live: ReadonlyMap<string, Vehicle>): void {
  if (!giver.yieldsTo) return;
  const kept = giver.yieldsTo.filter((id) => {
    const holder = live.get(id);
    if (holder && holder.id < giver.id) throw new Error(`${giver.id} yields to ${holder.id}, which has the lower id`);
    return holder && !endsMeeting(world, giver, holder);
  });
  if (kept.length > 0) giver.yieldsTo = kept;
  else delete giver.yieldsTo;
}

function endsMeeting(world: World, giver: Vehicle, holder: Vehicle): boolean {
  if (!givesWay(world, giver) || !givesWay(world, holder)) return true;
  const px = holder.pos.x - giver.pos.x;
  const py = holder.pos.y - giver.pos.y;
  const rx = Math.cos(holder.heading) * holder.speed - Math.cos(giver.heading) * giver.speed;
  const ry = Math.sin(holder.heading) * holder.speed - Math.sin(giver.heading) * giver.speed;
  if (px * rx + py * ry >= 0) return true;
  return dist(giver.pos, holder.pos) > swerveReach(world, giver, holder) + vehicleStats(world, giver).radius + vehicleStats(world, holder).radius;
}

function swerveReach(world: World, a: Vehicle, b: Vehicle): number {
  return brakingReach(world, a, b) + a.speed + b.speed;
}

function startMeeting(world: World, a: Vehicle, b: Vehicle): void {
  if (a === b || !givesWay(world, b)) return;
  const [giver, holder] = a.id < b.id ? [a, b] : [b, a];
  if (giver.yieldsTo?.includes(holder.id)) return;
  if (!closesOn(world, giver, holder, 1) || !closesOn(world, holder, giver, 1)) return;
  giver.yieldsTo = [...(giver.yieldsTo ?? []), holder.id];
}

function stopsInPlace(world: World, x: Vehicle): boolean {
  return !x.order || x.order.kind === "brake" || yieldsToTraffic(world, x);
}

export function stopTrack(world: World, holder: Vehicle, giver: Vehicle): Blocker[] {
  if (![giver.speed, giver.pos.x, giver.pos.y, giver.heading].every(Number.isFinite) || giver.speed < 0) throw new Error(`stopTrack: bad giver ${giver.id}`);
  const stats = vehicleStats(world, giver);
  const stop = giver.speed ** 2 / (2 * stats.brake);
  const steps = Math.ceil(stop / stats.radius) + 1;
  const grow = PHYSICS.driver.clearMargin + ropeAllowance(world, holder);
  const discs = rigDiscs(giver);
  const track: Blocker[] = [];
  for (let i = 0; i < steps; i++) {
    const d = steps === 1 ? 0 : (stop * i) / (steps - 1);
    for (const disc of discs) track.push({ pos: { x: disc.pos.x + Math.cos(giver.heading) * d, y: disc.pos.y + Math.sin(giver.heading) * d }, r: disc.r + grow });
  }
  return track;
}

function ropeAllowance(world: World, tower: Vehicle): number {
  const client = ropeClientOf(world, tower.id);
  if (!client) return 0;
  const target = world.vehicles.find((x) => x.id === client);
  if (!target) throw new Error(`Rope client ${client} of ${tower.id} is not in the world`);
  return Math.max(0, vehicleStats(world, target).radius - vehicleStats(world, tower).radius);
}

function horizon(world: World, v: Vehicle): { vs: number; t: number } {
  const sv = driveStats(world, v);
  const vs = Math.min(sv.maxSpeed, v.speed + sv.accel);
  return { vs, t: 1 + vs / sv.brake };
}

function sweptReach(x: Vehicle, travel: number): number {
  return x.order?.kind === "stopAt" ? Math.min(travel, dist(x.pos, x.order.dest)) : travel;
}

function sweptPath(world: World, v: Vehicle, x: Vehicle): Blocker[] {
  const sx = driveStats(world, x);
  const r = sx.radius;
  const radii = vehicleRadius(v) + r;
  const { vs, t } = horizon(world, v);
  const xs = Math.min(sx.maxSpeed, x.speed + sx.accel);
  const reach = sweptReach(x, xs * t);
  const steps = Math.max(1, Math.ceil(reach / r));
  const tail = Math.cos(angleDiff(x.heading, bearing(v.pos, x.pos))) > 0 ? radii : 0;
  const circles: Blocker[] = [];
  for (let i = 0; i <= steps; i++) {
    const d = (reach * i) / steps;
    const margin = PHYSICS.driver.clearMargin + (PHYSICS.driver.moverSpread * d) / xs;
    const pos = { x: x.pos.x + Math.cos(x.heading) * d, y: x.pos.y + Math.sin(x.heading) * d };
    if (i === 0 || dist(v.pos, pos) - radii <= (vs * (d + tail)) / xs) circles.push({ pos, r: r + margin });
  }
  return circles;
}

function pathsMeet(world: World, v: Vehicle, x: Vehicle): boolean {
  const sv = driveStats(world, v);
  const sx = driveStats(world, x);
  const { vs, t: h } = horizon(world, v);
  const px = x.pos.x - v.pos.x;
  const py = x.pos.y - v.pos.y;
  const rx = Math.cos(x.heading) * x.speed - Math.cos(v.heading) * vs;
  const ry = Math.sin(x.heading) * x.speed - Math.sin(v.heading) * vs;
  const rr = rx * rx + ry * ry;
  const t = rr === 0 ? 0 : Math.min(h, Math.max(0, -(px * rx + py * ry) / rr));
  return Math.hypot(px + rx * t, py + ry * t) < sv.radius + sx.radius + RULES.yieldDistance;
}

function onOwnRope(world: World, tower: Vehicle, x: Vehicle): boolean {
  return ropeClientOf(world, tower.id) === x.id;
}

function gapAhead(world: World, v: Vehicle, x: Vehicle, cone: number = RULES.traffic.parkedCone): number | null {
  if (Math.abs(angleDiff(v.heading, bearing(v.pos, x.pos))) >= cone) return null;
  return dist(v.pos, x.pos) - vehicleRadius(v) - vehicleRadius(x);
}

function brakingReach(world: World, v: Vehicle, x: Vehicle): number {
  const sv = driveStats(world, v);
  const sx = driveStats(world, x);
  const vs = Math.min(sv.maxSpeed, v.speed + sv.accel);
  const toward = Math.cos(angleDiff(x.heading, bearing(x.pos, v.pos)));
  const xs = toward > 0 ? Math.min(sx.maxSpeed, x.speed + sx.accel) * toward : x.speed * toward;
  const xTravel = Math.max(0, xs) + (Math.sign(xs) * xs ** 2) / (2 * sx.brake);
  return RULES.yieldDistance + vs + vs ** 2 / (2 * sv.brake) + xTravel;
}

function facesOff(world: World, v: Vehicle, x: Vehicle, gap: number): boolean {
  if (!givesWay(world, x) || !wantsToDrive(x) || gapAhead(world, x, v) === null) return false;
  return gap < RULES.yieldDistance + driveStats(world, v).accel + driveStats(world, x).accel;
}

function wantsToDrive(x: Vehicle): boolean {
  const order = x.order;
  return !!order && order.kind !== "brake" && dist(x.pos, order.dest) > RULES.arriveRadius * 2;
}

function givesWay(world: World, x: Vehicle): boolean {
  return !isOnRope(world, x.id) && canSteerAside(world, x);
}

function canSteerAside(world: World, x: Vehicle): boolean {
  if (!x.brain) return x.id === world.player.vehicleId && !x.direct && !inCombat(world, x);
  const kind = topGoal(x)?.kind;
  return kind !== "fight" && kind !== "flee";
}
