import type { TimedFlight, TimedRecord, TimedCombatState } from '../sim/timed-combat';
import { combatState } from '../sim/timed-combat';
import { CONFIG } from "../config";
import type { Msg } from '../text/msg';
import type { UtilityEffectType } from "../data/parts";
import { MIX, type CueId } from "../data/sounds";
import { crashLevel } from "../audio/pick";
import { PAL } from "../render/palette";
import { GROUND, restFrame, type TurnResult } from "../phys/drive";
import { carriedPartDef } from "../sim/salvage";
import { isShield } from "../data/parts";
import type { Vec } from "../sim/vec";
import type { GameEvent, ShotRound, Vehicle, World } from "../sim/types";
import type { BreakCues, PartBreak, ShotLike } from "./breakCues";
import { roundLabel } from "../ui/format";
import { computeRoundPoint, groundPoint, headingOf, toMap, type TurnFrames, type V3, type VehicleFrame } from "../phys/frames";
import type { Fx3D } from "./render/fx";
import { FLARE_LOOK, SHELL } from "./render/hazards";
import { blastRadiusOf, projectileOf, roundSpec, type Impact, type Muzzle, type ProjectileSpec, type RoundPlan } from "./render/projectiles";
import type { VehicleView } from "./render/vehicle";
import { scoreEventOf, type SoundDirector } from "./sound";
import { PHYSICS } from "../data/physics";

export type VolleyHost = {
  world: World;
  fx: Fx3D;
  sound: SoundDirector;
  eventPoint: (vehicleId: string) => V3 | null;
  onBurst: (point: Vec) => void;
  breakPart: (brk: PartBreak) => void;
  poses: TurnPoses;
  startMs: number;
};

type StruckCues = { plate: CueId; part: CueId };

const GUN_SOUNDS: Record<string, { fire: CueId; struck: StruckCues }> = { harpoon: { fire: "harpoon-fire", struck: { plate: "harpoon-hook", part: "harpoon-hook" } } };
const DEFAULT_STRUCK: StruckCues = { plate: "hit-metal", part: "hit-part" };

export type VolleyLands = { landsMs: number[]; lastMs: number };

export function playVolley(
  host: VolleyHost,
  plans: PlannedRound[],
  muzzle: () => Muzzle,
  event: ShotLike,
  breaks: BreakCues,
  weapon: string,
  rows: Map<string, number>,
  dry: boolean,
  hooked: (() => void) | null,
): VolleyLands {
  const rounds = event.rounds;
  const spec = projectileOf(weapon);
  const ground = (p: V3) => groundPoint(host.world.terrain, toMap(p)).y;
  const sounds = GUN_SOUNDS[weapon] ?? { fire: spec.look === "tracer" ? "mg-fire" : "cannon-fire", struck: DEFAULT_STRUCK };
  const landsAt = plans.map((plan) => plan.delayMs + plan.flightMs);
  const lastLand = landsAt.indexOf(Math.max(...landsAt));
  plans.forEach((plan, k) => {
    const shown = { ...plan, delayMs: Math.max(0, plan.delayMs - host.startMs) };
    const empties = dry && k === lastLand;
    const burst = rounds[k].burst;
    const struckCue = reachedPart(host.world, rounds[k]) ? sounds.struck.part : sounds.struck.plate;
    const cues = {
      fired: (m: Muzzle) => host.sound.at(sounds.fire, m.pos, 0),
      landed: () => {
        landSound(host, plan, rounds[k], struckCue);
        if (empties) host.sound.at("gun-empty", muzzle().pos, 0);
        if (burst) host.onBurst(burst);
        if (hooked && plan.impact === "truck") hooked();
        for (const brk of breaks.ofRound(event, k)) host.breakPart(brk);
      },
    };
    host.fx.shot(roundSpec(spec, k), muzzle, shown, blastRadiusOf(weapon), cues, ground, host.world.turn);
    showDamage(host, rounds[k], shown.delayMs + shown.flightMs, rows);
  });
  return { landsMs: landsAt, lastMs: Math.max(...landsAt) };
}

export function reachedPart(world: World, r: ShotRound): boolean {
  const struck = r.struck === null ? [] : [{ vehicle: r.struck, hits: r.hits }];
  return [...struck, ...r.blast].some((dealt) => dealt.hits.some((h) => h.damage > 0 && !isShield(carriedPartDef(world, dealt.vehicle, h.part))));
}

function landSound(host: VolleyHost, plan: RoundPlan, r: ShotRound, struck: CueId): void {
  if (plan.impact !== "none") host.sound.at(r.struck !== null || r.blast.length > 0 ? struck : "miss", plan.land, 0);
}

function showDamage(host: VolleyHost, r: ShotRound, atMs: number, rows: Map<string, number>): void {
  const struck = r.struck === null ? [] : [{ vehicle: r.struck, hits: r.hits }];
  for (const dealt of [...struck, ...r.blast]) damageLabel(host, dealt.vehicle, roundLabel(host.world, dealt.vehicle, dealt.hits, r.crit), rows, atMs);
}

function damageLabel(host: VolleyHost, vehicleId: string, label: Msg | null, rows: Map<string, number>, atMs: number): void {
  if (!label || !host.poses.end(vehicleId)) return;
  const row = rows.get(vehicleId) ?? 0;
  rows.set(vehicleId, row + 1);
  host.fx.label(() => host.eventPoint(vehicleId), label, PAL.damageText, row, atMs, CONFIG.combatReadMs);
}

export type CombatHost = VolleyHost & { views: Map<string, VehicleView>; lineHooked: (shooter: string, weapon: string) => void };

export function playCrashes(host: CombatHost, cues: CollisionCues | null, step: number | null): void {
  for (const e of cues?.due(step) ?? []) {
    if (e.t === "claymore") playBlast(host, e);
    else playCrash(host, e);
  }
}

function playCrash(host: CombatHost, e: CollisionEvent): void {
  const p = host.eventPoint(e.a);
  if (!p) return;
  host.fx.crash(p);
  host.sound.atLevel("crash", p, 0, crashLevel(e.impact, MIX.crash));
}

function playBlast(host: CombatHost, e: ClaymoreEvent): void {
  if (!host.eventPoint(e.vehicle) && !host.eventPoint(e.other)) return;
  const p = ramShown(host, e.vehicle, e.part, e.pos);
  host.fx.claymoreBlast(p);
  host.sound.at("explosion", p, 0);
}

function ramShown(host: CombatHost, vehicle: string, part: string, pos: Vec): V3 {
  const view = host.views.get(vehicle);
  if (view?.hasPart(part)) return view.partPoint(part);
  const g = groundPoint(host.world.terrain, pos);
  return { x: g.x, y: g.y + BLAST_HEIGHT, z: g.z };
}

const BLAST_HEIGHT = 1;

export function playCookOff(host: CombatHost, brk: PartBreak): void {
  const e = host.world.events.find((x) => x.t === "claymoreCookOff" && x.vehicle === brk.vehicle && x.part === brk.part);
  if (!e || e.t !== "claymoreCookOff") return;
  const p = ramShown(host, e.vehicle, e.part, e.pos);
  host.fx.claymoreBlast(p);
  host.sound.at("explosion", p, 0);
}

export function gunfireSeen(events: readonly GameEvent[], seen: (vehicleId: string) => boolean): boolean {
  return events.some((e) => e.t === "shot" && seen(e.shooter) && seen(e.target));
}

export function volleySeen(events: readonly GameEvent[], seen: (vehicleId: string) => boolean): boolean {
  return gunfireSeen(events, seen) || utilitySeen(events, seen) || events.some((e) => e.t === "partDisabled" && seen(e.vehicle));
}

export function utilitySeen(events: readonly GameEvent[], seen: (vehicleId: string) => boolean): boolean {
  return events.some((e) => e.t === "utility" && seen(e.vehicle));
}

const gunKey = (vehicle: string, weapon: string) => `${vehicle}|${weapon}`;

const USE_CUES: Partial<Record<UtilityEffectType | "claymore", CueId>> = {
  mortar: "mortar-fire",
  flare: "flare-fire",
  sprout: "smoke-burst",
  caltrops: "caltrops-drop",
  oil: "oil-spill",
};

export type UtilitySoundHost = Pick<VolleyHost, "eventPoint"> & { world: Pick<World, "events" | "terrain">; sound: Pick<SoundDirector, "at">; fx: Pick<Fx3D, "later"> };

type UtilitySound = { cue: CueId; seenBy: string; at: Vec | null; delayMs: number };

export function playUtilitySounds(host: UtilitySoundHost, at: "start" | "end"): void {
  const events = host.world.events.filter((e) => (e.t === "utility" || e.t === "pulse") === (at === "start"));
  for (const s of events.flatMap(utilitySoundsOf)) {
    const seen = host.eventPoint(s.seenBy);
    if (!seen) continue;
    const at = s.at ? groundPoint(host.world.terrain, s.at) : seen;
    host.fx.later(s.delayMs, () => host.sound.at(s.cue, at, 0));
  }
}

const EVENT_CUES: Partial<Record<GameEvent["t"], CueId>> = { pulse: "emitter-pulse", lineTorn: "line-tear", caltrops: "caltrops-hit" };

const BURSTS: Partial<Record<UtilityEffectType | "claymore", { cue: CueId; delayMs: number }>> = {
  mortar: { cue: "cannon-fire", delayMs: SHELL.flightMs },
  flare: { cue: "flare-burst", delayMs: FLARE_LOOK.flightMs },
};

function utilitySoundsOf(e: GameEvent): UtilitySound[] {
  if (e.t === "utility") return useSoundsOf(e);
  const cue = EVENT_CUES[e.t];
  return cue && "vehicle" in e ? [{ cue, seenBy: e.vehicle, at: null, delayMs: 0 }] : [];
}

function useSoundsOf(e: Extract<GameEvent, { t: "utility" }>): UtilitySound[] {
  const cue = USE_CUES[e.effect];
  const burst = BURSTS[e.effect];
  const sounds: UtilitySound[] = cue ? [{ cue, seenBy: e.vehicle, at: null, delayMs: 0 }] : [];
  if (burst && e.point) sounds.push({ ...burst, seenBy: e.vehicle, at: e.point });
  return sounds;
}

export function playShotFx(host: CombatHost, breaks: BreakCues): number {
  return playTimedCombat(host, breaks);
}

function vehicleOf(w: World, id: string): Vehicle {
  const v = w.vehicles.find((x) => x.id === id) ?? w.removed.find((x) => x.id === id);
  if (!v) throw new Error(`Shot names unknown vehicle ${id}`);
  return v;
}

function shooterMuzzle(host: CombatHost, shooter: string, weapon: string): () => Muzzle {
  let last: Muzzle | null = null;
  return () => {
    const view = host.views.get(shooter);
    if (view) last = view.muzzle(weapon);
    return last ?? restMuzzle(host, shooter);
  };
}

function restMuzzle(host: CombatHost, shooter: string): Muzzle {
  const v = vehicleOf(host.world, shooter);
  const pos = host.poses.end(shooter) ?? restFrame(host.world, v).pos;
  const heading = host.poses.endHeading(shooter) ?? v.heading;
  return { pos, dir: { x: Math.cos(heading), y: 0, z: Math.sin(heading) } };
}

export function hookLine(world: World, playing: { before: World; hookedLines: Set<string> } | null, shooter: string, weapon: string): void {
  if (!playing) return;
  const line = world.lines.find((l) => l.from === shooter && l.fromPart === weapon && !playing.before.lines.some((o) => o.id === l.id));
  if (line) playing.hookedLines.add(line.id);
}

export function shotAimsOf(events: readonly GameEvent[]): Map<string, string> {
  return new Map(events.flatMap((e) => (e.t === "shot" ? [[gunKey(e.shooter, e.weapon), e.target] as const] : [])));
}

export function aimedTarget(shotAims: ReadonlyMap<string, string> | undefined, vehicleId: string, orders: Vehicle["weaponOrders"], partId: string): string | null {
  const shot = shotAims?.get(gunKey(vehicleId, partId));
  if (shot) return shot;
  return (orders[partId] ?? Object.values(orders)[0])?.targetId ?? null;
}

export type CollisionEvent = Extract<GameEvent, { t: "collision" }>;
export type ClaymoreEvent = Extract<GameEvent, { t: "claymore" }>;
export type CrashCue = CollisionEvent | ClaymoreEvent;
export type TimedCollision = { event: CrashCue; step: number | null };

type Steps = Pick<TurnResult, "crashes" | "breaks" | "landings">;

export function collisionSteps(events: GameEvent[], result: Steps): TimedCollision[] {
  const used = new Set<object>();
  const take = <T extends { step: number }>(list: T[], fits: (c: T) => boolean): number | null => {
    const found = list.find((c) => !used.has(c) && fits(c));
    if (!found) return null;
    used.add(found);
    return found.step;
  };
  const timed: TimedCollision[] = [];
  for (const event of events) {
    if (event.t === "claymore") {
      timed.push({ event, step: blastStep(timed, event) });
      continue;
    }
    if (event.t !== "collision") continue;
    const step =
      take(result.breaks, (b) => b.vehicle === event.a && b.prop === event.b) ??
      take(result.crashes, (c) => samePair(c, event)) ??
      take(result.landings, (l) => l.vehicle === event.a && event.b === GROUND);
    timed.push({ event, step });
  }
  return timed;
}

export function scoreEventMs(e: GameEvent, timed: TimedCollision[], endStep: number, impactMs: number): number | null {
  if (e.t === "shot") return null;
  if (e.t === "collision") {
    const hit = timed.find((t) => t.event === e);
    return hit ? ((hit.step ?? endStep) / PHYSICS.stepsPerSecond) * 1000 : null;
  }
  return impactMs;
}

function blastStep(timed: TimedCollision[], e: ClaymoreEvent): number | null {
  const crash = timed.at(-1)?.event;
  const pair = { a: e.vehicle, b: e.other };
  if (!crash || !samePair(pair, crash.t === "claymore" ? { a: crash.vehicle, b: crash.other } : crash)) throw new Error(`Claymore blast of ${e.vehicle} follows no crash with ${e.other}`);
  return timed[timed.length - 1].step;
}

function samePair(c: { a: string; b: string }, e: { a: string; b: string }): boolean {
  return (c.a === e.a && c.b === e.b) || (c.a === e.b && c.b === e.a);
}

export class CollisionCues {
  private pending: TimedCollision[];

  constructor(timed: TimedCollision[]) {
    this.pending = timed.slice();
  }

  due(step: number | null): CrashCue[] {
    const out = this.pending.filter((t) => step === null || (t.step !== null && t.step <= step));
    this.pending = this.pending.filter((t) => !out.includes(t));
    return out.map((t) => t.event);
  }
}

export type TurnPoses = {
  moveMs: number;
  stepMs: number;
  at: (vehicleId: string, step: number) => V3 | null;
  headingAt: (vehicleId: string, step: number, unit?: number) => number | null;
  end: (vehicleId: string) => V3 | null;
  endHeading: (vehicleId: string) => number | null;
};

export type PoseClock = { moveMs: number; stepMs: number; gunHeight: number };

export function posesOf(world: World, frames: TurnFrames, clock: PoseClock, shown: (v: Vehicle) => boolean): TurnPoses {
  const lift = (f: VehicleFrame): V3 => ({ x: f.pos.x, y: f.pos.y + clock.gunHeight, z: f.pos.z });
  const endFrame = (id: string) => {
    const v = world.vehicles.find((x) => x.id === id) ?? world.removed.find((x) => x.id === id);
    return v && shown(v) ? (frames[id]?.at(-1) ?? restFrame(world, v)) : null;
  };
  return {
    moveMs: clock.moveMs,
    stepMs: clock.stepMs,
    at: (id, step) => {
      const f = frames[id]?.[step];
      return f ? lift(f) : null;
    },
    headingAt: (id, step, unit = 0) => {
      const f = frames[id]?.[step];
      if (!f) return null;
      return unit > 0 && f.rear ? headingOf(f.rear.rot) : headingOf(f.rot);
    },
    end: (id) => {
      const f = endFrame(id);
      return f ? lift(f) : null;
    },
    endHeading: (id) => {
      const f = endFrame(id);
      return f ? headingOf(f.rot) : null;
    },
  };
}

export type Gun = { spec: ProjectileSpec; rangeM: number; blastRadius: number; unit: number; covers: (heading: number, yaw: number) => boolean };

export type Shot = { shooter: string; target: string; rounds: ShotRound[]; late: (k: number) => boolean; missAt: (offset: number) => V3; targetHalf: { length: number; width: number } };

export type Ground = (p: V3) => number;

export type PlannedRound = RoundPlan & { struckAt: V3 | null };

const HIT = { drop: 0.8, band: 0.7 };
const MISS_DEPTH = 1;
const MISS_PAST = { min: 2, spread: 5 };
const LATE_SLACK_STEPS = 2;

const flat = (a: V3, b: V3) => Math.hypot(b.x - a.x, b.z - a.z);
const flightMsOf = (spec: ProjectileSpec, a: V3, b: V3) => (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / spec.speed) * 1000;

export function fireSteps(poses: TurnPoses, shot: Pick<Shot, "shooter" | "target">, gun: Gun): number[] {
  const steps: number[] = [];
  for (let s = 0; s * poses.stepMs < poses.moveMs; s++) if (firesAt(poses, shot, gun, s)) steps.push(s);
  return steps;
}

function firesAt(poses: TurnPoses, shot: Pick<Shot, "shooter" | "target">, gun: Gun, s: number): boolean {
  const a = poses.at(shot.shooter, s);
  const b = poses.at(shot.target, s);
  const heading = poses.headingAt(shot.shooter, s, gun.unit);
  if (!a || !b || heading === null || flat(a, b) > gun.rangeM) return false;
  return gun.covers(heading, Math.atan2(b.z - a.z, b.x - a.x)) && s * poses.stepMs + flightMsOf(gun.spec, a, b) <= poses.moveMs;
}

export function spreadOver(steps: readonly number[], n: number, random: () => number): number[] {
  if (n > 0 && steps.length === 0) throw new Error("spreadOver needs at least one fire step");
  return Array.from({ length: n }, (_, i) => steps[Math.min(steps.length - 1, Math.floor(((i + random()) / n) * steps.length))]);
}

export function planShot(poses: TurnPoses, shot: Shot, gun: Gun, ground: Ground, random: () => number): PlannedRound[] {
  const valid = fireSteps(poses, shot, gun);
  const free = shot.rounds.map((_, k) => valid.length > 0 && !shot.late(k));
  const steps = gun.spec.pellets ? pelletSteps(valid, free, random) : roundSteps(valid, free, random);
  let lateAfter = steps.filter((s) => s === null).length;
  return shot.rounds.map((r, k) => {
    const step = steps[k];
    if (step === null) return lateRound(poses, shot, gun, r, --lateAfter, valid, ground, random);
    return movingRound(poses, shot, gun, r, step, gun.spec.pellets ? k : 0, ground, random);
  });
}

function roundSteps(valid: number[], free: boolean[], random: () => number): (number | null)[] {
  const steps = spreadOver(valid, free.filter(Boolean).length, random);
  let i = 0;
  return free.map((f) => (f ? steps[i++] : null));
}

function pelletSteps(valid: number[], free: boolean[], random: () => number): (number | null)[] {
  if (!free.every(Boolean)) return free.map(() => null);
  const [step] = spreadOver(valid, 1, random);
  return free.map(() => step);
}

function movingRound(poses: TurnPoses, shot: Shot, gun: Gun, r: ShotRound, step: number, pellet: number, ground: Ground, random: () => number): PlannedRound {
  const a = poses.at(shot.shooter, step)!;
  const aimed = poses.at(shot.target, step)!;
  const landStep = step + Math.round(flightMsOf(gun.spec, a, aimed) / poses.stepMs);
  const b = poses.at(shot.target, landStep) ?? poses.end(shot.target) ?? aimed;
  const offset = offsetThen(poses, shot, r, a, b, poses.headingAt(shot.target, landStep));
  const { land, impact, struckAt } = movingLand(poses, shot, r, { a, b, landStep, offset }, ground, random);
  return { land, impact, delayMs: step * poses.stepMs + pellet * gun.spec.gapMs, flightMs: flightMsOf(gun.spec, a, land), struckAt };
}

type Flightline = { a: V3; b: V3; landStep: number; offset: number };

function movingLand(poses: TurnPoses, shot: Shot, r: ShotRound, f: Flightline, ground: Ground, random: () => number): Pick<PlannedRound, "land" | "impact" | "struckAt"> {
  if (r.struck === shot.target) return { land: hitPoint(f.a, f.b, f.offset, random), impact: "truck", struckAt: f.b };
  if (r.burst !== null) return { land: shot.missAt(r.offset), impact: "ground", struckAt: null };
  const stray = strayPose(poses, r.struck, f.landStep);
  if (stray) return { land: hitPoint(f.a, stray, 0, random), impact: "truck", struckAt: stray };
  return { land: pastMiss(f.a, f.b, f.offset, ground, random), impact: r.struck === null ? "ground" : "none", struckAt: null };
}

function strayPose(poses: TurnPoses, struck: string | null, landStep: number): V3 | null {
  return struck === null ? null : (poses.at(struck, landStep) ?? poses.end(struck));
}

function lateRound(poses: TurnPoses, shot: Shot, gun: Gun, r: ShotRound, after: number, valid: number[], ground: Ground, random: () => number): PlannedRound {
  const end = poses.end(shot.shooter);
  const target = poses.end(shot.target);
  if (!end || !target) throw new Error(`Shot from ${shot.shooter} at ${shot.target} is planned with a truck not shown`);
  const landByMs = poses.moveMs - after * gun.spec.gapMs;
  const fitMs = latestFire(poses, valid, landByMs - flightMsOf(gun.spec, end, target));
  const a = fitMs === null ? end : (poses.at(shot.shooter, Math.round(fitMs / poses.stepMs)) ?? end);
  const struckAt = struckPoint(poses, shot, r, target);
  const land = lateLand(shot, gun, r, a, struckAt, ground, random);
  const flightMs = flightMsOf(gun.spec, a, land);
  const fireMs = fitMs ?? Math.max(0, landByMs - flightMs);
  return { land, impact: impactOf(r, struckAt), delayMs: fireMs, flightMs, struckAt };
}

function lateLand(shot: Shot, gun: Gun, r: ShotRound, a: V3, struckAt: V3 | null, ground: Ground, random: () => number): V3 {
  if (!struckAt) return missLand(a, shot.missAt(r.offset), gun, ground, random);
  return hitPoint(a, struckAt, r.struck === shot.target ? r.offset : 0, random);
}

function struckPoint(poses: TurnPoses, shot: Shot, r: ShotRound, target: V3): V3 | null {
  if (r.struck === null) return null;
  return r.struck === shot.target ? target : poses.end(r.struck);
}

function impactOf(r: ShotRound, struckAt: V3 | null): Impact {
  if (struckAt) return "truck";
  return r.struck === null ? "ground" : "none";
}

function latestFire(poses: TurnPoses, valid: number[], wantMs: number): number | null {
  const fits = valid.filter((s) => s * poses.stepMs <= wantMs && s * poses.stepMs >= wantMs - LATE_SLACK_STEPS * poses.stepMs);
  return fits.length > 0 ? fits[fits.length - 1] * poses.stepMs : null;
}

function seenHalf(from: V3, to: V3, heading: number, half: Shot["targetHalf"]): number {
  const rel = Math.atan2(to.z - from.z, to.x - from.x) - heading;
  return half.length * Math.abs(Math.sin(rel)) + half.width * Math.abs(Math.cos(rel));
}

function offsetThen(poses: TurnPoses, shot: Shot, r: ShotRound, a: V3, b: V3, heading: number | null): number {
  const endFrom = poses.end(shot.shooter);
  const endTo = poses.end(shot.target);
  const endHeading = poses.endHeading(shot.target);
  if (!endFrom || !endTo || endHeading === null || heading === null) return r.offset;
  return (r.offset * seenHalf(a, b, heading, shot.targetHalf)) / seenHalf(endFrom, endTo, endHeading, shot.targetHalf);
}

function missLand(a: V3, miss: V3, gun: Gun, ground: Ground, random: () => number): V3 {
  if (gun.blastRadius > 0) return miss;
  const len = flat(a, miss);
  const shift = (random() * 2 - 1) * MISS_DEPTH;
  const end = { x: miss.x + ((miss.x - a.x) / len) * shift, y: 0, z: miss.z + ((miss.z - a.z) / len) * shift };
  return { ...end, y: ground(end) };
}

function hitPoint(a: V3, b: V3, offset: number, random: () => number): V3 {
  const p = computeRoundPoint(a, b, offset);
  return { x: p.x, y: b.y - HIT.drop + (random() - 0.5) * HIT.band, z: p.z };
}

function pastMiss(a: V3, b: V3, offset: number, ground: Ground, random: () => number): V3 {
  const side = computeRoundPoint(a, b, offset);
  const len = flat(a, side);
  const past = MISS_PAST.min + random() * MISS_PAST.spread;
  const end = { x: side.x + ((side.x - a.x) / len) * past, y: 0, z: side.z + ((side.z - a.z) / len) * past };
  return { ...end, y: ground(end) };
}

function playTimedCombat(host: CombatHost, breaks: BreakCues): number {
  const state = combatState(host.world);
  host.fx.clearShots();
  resumeTimedFlights(host, state);
  const rows = new Map<string, number>();
  const last = new Map<string, TimedFlight>();
  for (const record of state.records) {
    if (record.kind === 'launch' && record.flight) last.set(record.flight.weaponId, record.flight);
  }
  for (const record of state.records) playTimedRecord(host, record, state, rows, breaks, last);
  queueTimedScores(host, state);
  for (const [id, destroyed] of Object.entries(state.destroyedAt)) {
    host.fx.later(Math.max(0, destroyed - state.turnStart - host.startMs), () => {
      const point = host.eventPoint(id);
      if (point) { host.fx.explode(point); host.sound.at('explosion', point, 0); }
    });
  }
  return host.poses.moveMs;
}

function playTimedRecord(host: CombatHost, record: TimedRecord, state: TimedCombatState, rows: Map<string, number>, breaks: BreakCues, last: Map<string, TimedFlight>): void {
  if (!record.flight) return;
  const at = Math.max(0, record.at - state.turnStart - host.startMs);
  if (record.at < state.turnStart + host.startMs) return;
  if (record.kind === 'launch') playTimedLaunch(host, record.flight, at, last.get(record.flight.weaponId) === record.flight);
  if (record.kind === 'impact' && record.event) playTimedImpact(host, record.flight, record.event, at, rows, breaks);
}

function playTimedLaunch(host: CombatHost, f: TimedFlight, at: number, last: boolean): void {
  vehicleOf(host.world, f.shooterId);
  vehicleOf(host.world, f.targetId);
  if (!host.eventPoint(f.shooterId)) return;
  const ground = (p: V3) => groundPoint(host.world.terrain, toMap(p)).y;
  const spec = projectileOf(f.weaponDefId);
  const point = groundPoint(host.world.terrain, f.impactAt);
  const land = { ...point, y: point.y + (f.roll.hit ? 1 : 0) };
  const muzzle = shooterMuzzle(host, f.shooterId, f.weaponId);
  const sounds = gunSounds(f.weaponDefId);
  const dry = last && host.world.events.some(e => e.t === 'empty' && e.vehicle === f.shooterId && e.weapon === f.weaponId);
  const pellet = host.world.combat.records.filter(r => r.kind === 'launch' && r.flight?.weaponId === f.weaponId).findIndex(r => r.flight === f);
  host.fx.shot(roundSpec(spec, pellet), muzzle, {
    delayMs: at, flightMs: f.landsAt - f.launchedMs, land, impact: 'none',
  }, blastRadiusOf(f.weaponDefId), {
    fired: m => {
      host.sound.at(sounds.fire, m.pos, 0);
      if (dry) host.sound.at('gun-empty', m.pos, 0);
    },
    landed: () => {},
  }, ground, host.world.turn);
}

function gunSounds(weapon: string): { fire: CueId; struck: StruckCues } {
  return GUN_SOUNDS[weapon] ?? { fire: projectileOf(weapon).look === 'tracer' ? 'mg-fire' : 'cannon-fire', struck: DEFAULT_STRUCK };
}

function playTimedImpact(host: CombatHost, f: TimedFlight, event: Extract<GameEvent, { t: 'shot' }>, at: number, rows: Map<string, number>, breaks: BreakCues): void {
  for (const round of event.rounds) showDamage(host, round, at, rows);
  host.fx.later(at, () => landTimedFx(host, f, event, breaks));
}

function landTimedFx(host: CombatHost, f: TimedFlight, event: Extract<GameEvent, { t: 'shot' }>, breaks: BreakCues): void {
  const round = event.rounds[0];
  const plan = timedImpactPlan(host.world, f, round.struck !== null);
  const spec = projectileOf(f.weaponDefId);
  host.fx.projectileImpact(plan, blastRadiusOf(f.weaponDefId), spec.look === 'shell');
  const sounds = gunSounds(f.weaponDefId);
  landSound(host, plan, round, reachedPart(host.world, round) ? sounds.struck.part : sounds.struck.plate);
  if (round.burst) host.onBurst(round.burst);
  if (spec.rope && round.struck !== null) host.lineHooked(f.shooterId, f.weaponId);
  for (const brk of breaks.ofRound(event, 0)) host.breakPart(brk);
}

function queueTimedScores(host: CombatHost, state: TimedCombatState): void {
  const groups = new Map<string, TimedRecord[]>();
  for (const record of state.records) {
    if (record.kind !== 'impact' || !record.event) continue;
    const key = gunKey(record.event.shooter, record.event.weapon);
    const records = groups.get(key) ?? [];
    records.push(record);
    groups.set(key, records);
  }
  for (const records of groups.values()) queueTimedScore(host, state, records);
}

function queueTimedScore(host: CombatHost, state: TimedCombatState, records: TimedRecord[]): void {
  const event = records[0].event;
  if (!event) throw new Error('Score group has no impact event');
  const rounds = records.flatMap(r => r.event?.rounds ?? []);
  const pick = scoreEventOf({ ...event, rounds }, host.world.player.vehicleId);
  if (!pick) return;
  const earning = records[pick.round ?? 0];
  host.sound.queueScoreEvent(pick.kind, Math.max(0, earning.at - state.turnStart - host.startMs));
}

function timedImpactPlan(world: World, f: TimedFlight, hit: boolean): RoundPlan {
  const point = groundPoint(world.terrain, f.impactAt);
  return { delayMs: 0, flightMs: 0, land: { ...point, y: point.y + Number(hit) }, impact: hit ? 'truck' : 'ground' };
}

function resumeTimedFlights(host: CombatHost, state: TimedCombatState): void {
  const old = state.records.flatMap(record => record.flight && record.flight.launchedMs < state.turnStart ? [record.flight] : []);
  const pending = state.flights.filter(flight => flight.launchedMs < state.turnStart);
  for (const flight of [...old, ...pending]) resumeTimedFlight(host, state, flight);
}

function resumeTimedFlight(host: CombatHost, state: TimedCombatState, flight: TimedFlight): void {
  if (!host.eventPoint(flight.targetId) && !host.eventPoint(flight.shooterId)) return;
  const elapsedMs = state.turnStart + host.startMs - flight.launchedMs;
  if (elapsedMs < 0 || flight.landsAt <= state.turnStart + host.startMs) return;
  const ground = (p: V3) => groundPoint(host.world.terrain, toMap(p)).y;
  const from = groundPoint(host.world.terrain, flight.from);
  const land = groundPoint(host.world.terrain, flight.impactAt);
  const muzzle = () => ({ pos: { ...from, y: from.y + 1 }, dir: { x: 1, y: 0, z: 0 } });
  host.fx.shot(projectileOf(flight.weaponDefId), muzzle, {
    delayMs: 0, flightMs: flight.landsAt - flight.launchedMs, elapsedMs, land, impact: 'none',
  }, blastRadiusOf(flight.weaponDefId), { fired: () => {}, landed: () => {} }, ground, host.world.turn);
}
