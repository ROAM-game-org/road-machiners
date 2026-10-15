import { CONFIG } from "../config";
import type { Msg } from '../text/msg';
import type { UtilityEffectType } from "../data/parts";
import type { CueId } from "../data/sounds";
import { PAL } from "../render/palette";
import { GROUND, restFrame, type TurnResult } from "../phys/drive";
import { missPoint } from "../sim/combat";
import { carriedPart } from "../sim/salvage";
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
import { PARTS } from "../data/parts";
import { PHYSICS } from "../data/physics";
import { bodyOf } from "../sim/body";

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

const GUN_SOUNDS: Record<string, { fire: CueId; struck: CueId }> = { harpoon: { fire: "harpoon-fire", struck: "harpoon-hook" } };

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
  const sounds = GUN_SOUNDS[weapon] ?? { fire: spec.look === "tracer" ? "mg-fire" : "cannon-fire", struck: "hit-metal" };
  const landsAt = plans.map((plan) => plan.delayMs + plan.flightMs);
  const lastLand = landsAt.indexOf(Math.max(...landsAt));
  plans.forEach((plan, k) => {
    const shown = { ...plan, delayMs: Math.max(0, plan.delayMs - host.startMs) };
    const empties = dry && k === lastLand;
    const burst = rounds[k].burst;
    const cues = {
      fired: (m: Muzzle) => host.sound.at(sounds.fire, m.pos, 0),
      landed: () => {
        landSound(host, plan, rounds[k], sounds.struck);
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
  host.sound.at("crash", p, 0);
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

function playDryGuns(host: CombatHost, played: Set<string>): void {
  for (const e of host.world.events) {
    const p = e.t === "empty" && !played.has(gunKey(e.vehicle, e.weapon)) ? host.eventPoint(e.vehicle) : null;
    if (p) host.sound.at("gun-empty", p, Math.max(0, host.poses.moveMs - host.startMs));
  }
}

const gunKey = (vehicle: string, weapon: string) => `${vehicle}|${weapon}`;

const USE_CUES: Partial<Record<UtilityEffectType | "claymore", CueId>> = {
  mortar: "mortar-fire",
  flare: "flare-fire",
  sprout: "smoke-burst",
  caltrops: "caltrops-drop",
  oil: "oil-spill",
};

export type UtilitySoundHost = Pick<VolleyHost, "eventPoint"> & { world: Pick<World, "events" | "terrain">; sound: Pick<SoundDirector, "at"> };

type UtilitySound = { cue: CueId; seenBy: string; at: Vec | null; delayMs: number };

export function playUtilitySounds(host: UtilitySoundHost): void {
  for (const s of host.world.events.flatMap(utilitySoundsOf)) {
    const seen = host.eventPoint(s.seenBy);
    if (seen) host.sound.at(s.cue, s.at ? groundPoint(host.world.terrain, s.at) : seen, s.delayMs);
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
  const rows = new Map<string, number>();
  const played = new Set<string>();
  let lastMs = 0;
  for (const e of host.world.events) {
    const lands = e.t === "shot" ? playTruckShot(host, e, rows, breaks) : null;
    if (lands === null) continue;
    queueVolleyScore(host, e, lands);
    lastMs = Math.max(lastMs, lands.lastMs);
    if (e.t === "shot") played.add(gunKey(e.shooter, e.weapon));
  }
  playDryGuns(host, played);
  return lastMs;
}

function queueVolleyScore(host: CombatHost, e: GameEvent, lands: VolleyLands): void {
  const pick = scoreEventOf(e, host.world.player.vehicleId);
  if (pick) host.sound.queueScoreEvent(pick.kind, lands.landsMs[pick.round ?? 0]);
}

function vehicleOf(w: World, id: string): Vehicle {
  const v = w.vehicles.find((x) => x.id === id) ?? w.removed.find((x) => x.id === id);
  if (!v) throw new Error(`Shot names unknown vehicle ${id}`);
  return v;
}

function missAt(w: World, from: Vec, target: Vec): (offset: number) => V3 {
  return (offset) => groundPoint(w.terrain, missPoint(from, target, offset));
}

function playTruckShot(host: CombatHost, e: ShotLike, rows: Map<string, number>, breaks: BreakCues): VolleyLands | null {
  if (!host.eventPoint(e.shooter) || !host.eventPoint(e.target)) return null;
  const w = host.world;
  const shooter = vehicleOf(w, e.shooter);
  const target = vehicleOf(w, e.target);
  const part = carriedPart(w, e.shooter, e.weapon);
  if (!part) throw new Error(`Shot from ${e.shooter} names no mounted weapon ${e.weapon}`);
  const view = host.views.get(e.shooter);
  const spec = projectileOf(part.defId);
  const gun: Gun = { spec, rangeM: weaponRange(part.defId) * PHYSICS.metersPerTile, blastRadius: blastRadiusOf(part.defId), covers: (heading, yaw) => view?.covers(e.weapon, heading, yaw) ?? false };
  const half = bodyOf(target.chassisId).half;
  const shot: Shot = { shooter: e.shooter, target: e.target, rounds: e.rounds, late: killingRounds(w, e), missAt: missAt(w, shooter.pos, target.pos), targetHalf: { length: half.x, width: half.z } };
  const ground = (p: V3) => groundPoint(w.terrain, toMap(p)).y;
  const plans = planShot(host.poses, shot, gun, ground, Math.random);
  const dry = w.events.some((x) => x.t === "empty" && x.vehicle === e.shooter && x.weapon === e.weapon);
  const hooked = spec.rope ? () => host.lineHooked(e.shooter, e.weapon) : null;
  return playVolley(host, plans, shooterMuzzle(host, e.shooter, e.weapon), e, breaks, part.defId, rows, dry, hooked);
}

function shooterMuzzle(host: CombatHost, shooter: string, weapon: string): () => Muzzle {
  let last: Muzzle | null = null;
  return () => {
    const view = host.views.get(shooter);
    if (view) last = view.muzzle(weapon);
    return last ?? restMuzzle(host.poses, shooter);
  };
}

function restMuzzle(poses: TurnPoses, shooter: string): Muzzle {
  const pos = poses.end(shooter);
  const heading = poses.endHeading(shooter);
  if (pos === null || heading === null) throw new Error(`Shooter ${shooter} has no end pose`);
  return { pos, dir: { x: Math.cos(heading), y: 0, z: Math.sin(heading) } };
}

function killingRounds(w: World, e: ShotLike): (k: number) => boolean {
  const gone = w.events.flatMap((x) => (x.t === "destroyed" ? [x.vehicle] : []));
  const killers = new Set(gone.map((v) => e.rounds.map((r) => damages(r, v)).lastIndexOf(true)));
  return (k) => killers.has(k);
}

const damages = (r: ShotRound, vehicle: string): boolean => r.struck === vehicle || r.blast.some((b) => b.vehicle === vehicle);

export function hookLine(world: World, playing: { before: World; hookedLines: Set<string> } | null, shooter: string, weapon: string): void {
  if (!playing) throw new Error(`Harpoon of ${shooter} hooked with no turn playing`);
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

function weaponRange(key: string): number {
  const def = PARTS[key];
  if (def?.kind !== "weapon") throw new Error(`${key} is not a weapon`);
  return def.range;
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

export function crashMs(timed: TimedCollision[], e: GameEvent, endStep: number): number | null {
  const hit = timed.find((t) => t.event === e);
  return hit ? ((hit.step ?? endStep) / PHYSICS.stepsPerSecond) * 1000 : null;
}

export function scoreEventMs(e: GameEvent, timed: TimedCollision[], endStep: number, impactMs: number): number | null {
  if (e.t === "shot") return null;
  if (e.t === "collision") return crashMs(timed, e, endStep);
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
  headingAt: (vehicleId: string, step: number) => number | null;
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
    headingAt: (id, step) => {
      const f = frames[id]?.[step];
      return f ? headingOf(f.rot) : null;
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

export type Gun = { spec: ProjectileSpec; rangeM: number; blastRadius: number; covers: (heading: number, yaw: number) => boolean };

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
  const heading = poses.headingAt(shot.shooter, s);
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
  let late = 0;
  return shot.rounds.map((r, k) => {
    const step = steps[k];
    if (step === null) return lateRound(poses, shot, gun, r, late++, valid, ground, random);
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

function lateRound(poses: TurnPoses, shot: Shot, gun: Gun, r: ShotRound, k: number, valid: number[], ground: Ground, random: () => number): PlannedRound {
  const end = poses.end(shot.shooter);
  const target = poses.end(shot.target);
  if (!end || !target) throw new Error(`Shot from ${shot.shooter} at ${shot.target} is planned with a truck not shown`);
  const fireMs = latestFire(poses, valid, poses.moveMs - flightMsOf(gun.spec, end, target));
  const a = poses.at(shot.shooter, Math.round(fireMs / poses.stepMs)) ?? end;
  const struckAt = struckPoint(poses, shot, r, target);
  const land = struckAt ? hitPoint(a, struckAt, r.struck === shot.target ? r.offset : 0, random) : missLand(a, shot.missAt(r.offset), gun, ground, random);
  return { land, impact: impactOf(r, struckAt), delayMs: fireMs + k * gun.spec.gapMs, flightMs: flightMsOf(gun.spec, a, land), struckAt };
}

function struckPoint(poses: TurnPoses, shot: Shot, r: ShotRound, target: V3): V3 | null {
  if (r.struck === null) return null;
  return r.struck === shot.target ? target : poses.end(r.struck);
}

function impactOf(r: ShotRound, struckAt: V3 | null): Impact {
  if (struckAt) return "truck";
  return r.struck === null ? "ground" : "none";
}

function latestFire(poses: TurnPoses, valid: number[], wantMs: number): number {
  const fits = valid.filter((s) => s * poses.stepMs <= wantMs && s * poses.stepMs >= wantMs - LATE_SLACK_STEPS * poses.stepMs);
  return fits.length > 0 ? fits[fits.length - 1] * poses.stepMs : poses.moveMs;
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
