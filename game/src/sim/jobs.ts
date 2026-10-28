
import { GOODS } from "../data/goods";
import { partDef } from "../data/parts";
import { RULES } from "../data/rules";
import { STRIP } from "../data/salvage";
import { WORK } from "../data/utilities";
import { PERK_NUMBERS } from "../data/skills";
import { firstAidTurns, firstAidTurnSupplies, maxHealthOf } from "./health";
import { inCombat } from "./combat";
import { playerVehicle } from "./damage";
import { partValue } from "./wear";
import { corePart, coreParts, freeCells, goodsCount, isMounted, itemSize, mountedParts } from "./grid";
import { addGoods, applyRefitLayout, getRefitLayout, movesWork, NOTHING_TAKEN, refitStepLayout, refitStepWork, removeGoods, startRefitStep, stowPart } from "./inventory";
import { makePart } from "./factory";
import { promisedParts } from "./patch";
import { requireSpareGoods, spareGoods } from "./market";
import { isJunk, maxHp } from "./wear";
import { repairPlan, repairTurn } from "./repair";
import { hasBasic, practice, vehicleHasPerk } from "./progress";
import { finishTruckPickup, takeError } from "./salvage";
import { isSearchStalled, searchTurn } from "./search";
import { isSurveyStalled, surveyTurn } from "./survey";
import { hasWorkingUtility } from "./utility";
import type { GridItem, Job, PartInstance, RefitJob, RefitPickup, RefitStep, Refusal, Vehicle, World } from "./types";
import { getKnownSite } from "./npc-decisions";
import { canUseSite } from "./sites";
import { playerCommand, Refused } from "./world";

export { repairPlan };

export function isAutoPatch(job: Job | null): boolean {
  return job?.kind === "repair" && job.auto === true;
}

export function isBusy(v: Vehicle): boolean {
  return v.job !== null && !isAutoPatch(v.job);
}

export function isParkedForWork(world: World, v: Vehicle): boolean {
  if (v.speed > RULES.parkedSpeed) return false;
  return v.id !== world.player.vehicleId || v.order === null || v.order.kind === "brake";
}

export function dropLeftoverOrder(world: World, v: Vehicle): void {
  if (v.id === world.player.vehicleId && v.speed <= RULES.parkedSpeed) v.order = null;
}

export function stoppedByCombat(kind: Job["kind"]): boolean {
  return kind !== "survey";
}

export function startJob(world: World, v: Vehicle, job: Job): void {
  if (stoppedByCombat(job.kind) && inCombat(world, v)) throw new Refused({ id: "inCombat" });
  if (isAutoPatch(v.job)) cancelJob(world, v);
  if (v.job) throw new Refused({ id: "busy", job: v.job.kind });
  dropLeftoverOrder(world, v);
  if (!isParkedForWork(world, v)) throw new Refused({ id: "stopFirst" });
  v.job = job;
  world.events.push({
    t: "job",
    vehicle: v.id,
    job: { ...job },
    outcome: "started",
  });
}

export function repairBlocker(world: World, v: Vehicle, partId: string): Refusal | null {
  return workBlocker(world, v) ?? patchBlocker(world, v, partId);
}

function workBlocker(world: World, v: Vehicle): Refusal | null {
  if (inCombat(world, v)) return { id: "inCombat" };
  if (v.job && !isAutoPatch(v.job)) return { id: "busy", job: v.job.kind };
  return v.speed > RULES.parkedSpeed ? { id: "stopFirst" } : null;
}

function patchBlocker(world: World, v: Vehicle, partId: string): Refusal | null {
  const plan = repairPlan(world, v, partId);
  if (plan.needed === 0) return { id: "atRepairCap" };
  return plan.parts === 0 ? { id: "noParts" } : null;
}

export function startRepair(world: World, partId: string): World {
  return playerCommand(world, (w) => {
    const v = playerVehicle(w);
    const blocker = repairBlocker(w, v, partId);
    if (blocker) throw new Refused(blocker);
    const plan = repairPlan(w, v, partId);
    startJob(w, v, {
      kind: "repair",
      partId,
      parts: plan.parts,
      turnsLeft: plan.turns,
      total: plan.turns,
    });
  });
}

export function startAutoRepair(world: World): void {
  if (!world.player.autoRepair || world.player.state !== "active") return;
  const v = playerVehicle(world);
  if (!canAutoPatch(world, v)) return;
  const worst = mountedParts(v)
    .filter((p) => !isJunk(p) && repairPlan(world, v, p.id).needed > 0)
    .sort((a, b) => patchRank(v, a) - patchRank(v, b) || a.hp / maxHp(a) - b.hp / maxHp(b))[0];
  if (!worst) return;
  const plan = repairPlan(world, v, worst.id, 1);
  startJob(world, v, {
    kind: "repair",
    partId: worst.id,
    parts: plan.parts,
    turnsLeft: plan.turns,
    total: plan.turns,
    auto: true,
  });
}

function patchRank(v: Vehicle, part: PartInstance): number {
  if (part.hp > 0) return 2;
  if (part === mountedParts(v, "engine")[0] || part === corePart(v, "transmission")) return 0;
  return coreParts(v, "wheel").includes(part) ? 1 : 2;
}

function freeParts(world: World, v: Vehicle): number {
  return spareGoods(world, v, "parts") - promisedParts(world, v);
}

function canAutoPatch(world: World, v: Vehicle): boolean {
  return !v.job && isParkedForWork(world, v) && freeParts(world, v) > 0 && !inCombat(world, v);
}

export function startStrip(world: World, partId: string): World {
  return playerCommand(world, (w) => {
    const v = playerVehicle(w);
    findStripItem(v, partId);
    const refusal = stripRefusal(v, partId);
    if (refusal) throw new Refused(refusal);
    const total = stripTurns(w, v, partId);
    startJob(w, v, { kind: "strip", partId, turnsLeft: total, total });
  });
}

type PartItem = Extract<GridItem, { kind: "part" }>;

function findStripItem(v: Vehicle, partId: string): PartItem {
  const item = stripItem(v, partId);
  if (!item) throw new Error(`No part ${partId} on ${v.id}`);
  if (partDef(item.part.defId).kind === "core") throw new Error("A built-in part cannot be stripped");
  return item;
}

function stripItem(v: Vehicle, partId: string): PartItem | null {
  const item = v.items.find((it) => it.kind === "part" && it.part.id === partId);
  return item?.kind === "part" ? item : null;
}

export function stripTurns(world: World, v: Vehicle, partId: string): number {
  const unmount = isMounted(v.chassisId, findStripItem(v, partId)) ? movesWork(world, v, RULES.refitTurnsPerPart) : 0;
  return STRIP.turns + unmount;
}

export function stripYield(v: Vehicle, part: PartInstance): number {
  const rest = withoutPart(v, part.id);
  const share = hasWorkingUtility(rest, "scraper") ? WORK.scraperStripShare : STRIP.yieldShare;
  return Math.max(1, Math.round((partValue(part) * share) / GOODS.parts.value));
}

function withoutPart(v: Vehicle, partId: string): Vehicle {
  return { ...v, items: v.items.filter((it) => !(it.kind === "part" && it.part.id === partId)) };
}

export function stripRefusal(v: Vehicle, partId: string): Refusal | null {
  const item = findStripItem(v, partId);
  const leaving = takeError(v, item);
  if (leaving) return leaving;
  return freeCells(withoutPart(v, partId)) < stripYield(v, item.part) ? { id: "noCargoRoom" } : null;
}

function isStripStalled(v: Vehicle, partId: string): boolean {
  return !stripItem(v, partId) || stripRefusal(v, partId) !== null;
}

export function startWeld(world: World): World {
  return playerCommand(world, (w) => {
    const v = playerVehicle(w);
    if (!vehicleHasPerk(w, v, "welder")) throw new Error("Welding needs the Welder perk");
    if ((goodsCount(v).scrap ?? 0) < PERK_NUMBERS.welder.scrap) throw new Error(`Welding needs ${PERK_NUMBERS.welder.scrap} scrap metal`);
    requireSpareGoods(w, v, "scrap", PERK_NUMBERS.welder.scrap);
    if (!weldFits(v)) throw new Refused({ id: "noCargoRoom" });
    const turns = PERK_NUMBERS.welder.turns;
    startJob(w, v, { kind: "weld", turnsLeft: turns, total: turns });
  });
}

export type FirstAidBlock = "noBasic" | "inCombat" | "stopFirst" | "busy" | "unhurt" | "noSupplies";

export function firstAidBlock(world: World): FirstAidBlock | null {
  if (!hasBasic(world, "firstAid")) return "noBasic";
  const refusal = workBlocker(world, playerVehicle(world));
  if (refusal) return refusal.id as FirstAidBlock;
  if (world.player.health >= maxHealthOf(world)) return "unhurt";
  if (world.player.supplies < firstAidTurnSupplies(world)) return "noSupplies";
  return null;
}

export function canFirstAid(world: World): boolean {
  return firstAidBlock(world) === null;
}

export function startFirstAid(world: World): World {
  return playerCommand(world, (w) => {
    const v = playerVehicle(w);
    const block = firstAidBlock(w);
    if (block === "noBasic") throw new Error("First aid needs Toughness 1");
    if (block === "unhurt" || block === "noSupplies") throw new Refused({ id: block });
    const turns = firstAidTurns(w);
    startJob(w, v, { kind: "firstAid", turnsLeft: turns, total: turns });
  });
}

function firstAidTurn(world: World, v: Vehicle, job: Extract<Job, { kind: "firstAid" }>): boolean {
  if (v.id !== world.player.vehicleId) throw new Error("Only the player dresses wounds");
  if (world.player.health >= maxHealthOf(world)) return true;
  job.turnsLeft = firstAidTurns(world);
  return false;
}

function hasWeldScrap(world: World, v: Vehicle): boolean {
  return spareGoods(world, v, "scrap") >= PERK_NUMBERS.welder.scrap;
}

function weldFits(v: Vehicle): boolean {
  const def = partDef(PERK_NUMBERS.welder.part);
  return freeCells(v) + PERK_NUMBERS.welder.scrap >= def.w * def.h;
}

function weldTurn(world: World, v: Vehicle, job: Extract<Job, { kind: "weld" }>): boolean {
  job.turnsLeft = Math.max(0, job.turnsLeft - 1);
  if (job.turnsLeft > 0) return false;
  removeGoods(v, "scrap", PERK_NUMBERS.welder.scrap);
  if (!stowPart(world, v, makePart(world, PERK_NUMBERS.welder.part, 0))) throw new Error(`Welded part would not fit on ${v.id}`);
  return true;
}

export function advanceJobs(world: World): void {
  for (const v of world.vehicles) if (v.job) advanceJob(world, v, v.job);
}

function advanceJob(world: World, v: Vehicle, job: Job): void {
  if (!isParkedForWork(world, v) || (stoppedByCombat(job.kind) && inCombat(world, v))) return endJob(world, v, job, "cancelled");
  if (job.kind === "refit") return advanceRefit(world, v, job);
  if (isStalled(world, v, job)) return endJob(world, v, job, "cancelled");
  if (jobTurn(world, v, job)) endJob(world, v, job, "done");
}

function isStalled(world: World, v: Vehicle, job: Job): boolean {
  if (job.kind === "repair") return isRepairStalled(world, v, job);
  if (job.kind === "strip") return isStripStalled(v, job.partId);
  if (job.kind === "search") return isSearchStalled(world, v, job);
  if (job.kind === "survey") return isSurveyStalled(world, job);
  return isSiteWorkStalled(world, v, job);
}

function isSiteWorkStalled(world: World, v: Vehicle, job: Job): boolean {
  if (job.kind === "business") return !canUseSite(v.pos, getKnownSite(job.siteId));
  if (job.kind === "firstAid") return world.player.supplies < firstAidTurnSupplies(world);
  return job.kind === "weld" && (!hasWeldScrap(world, v) || !weldFits(v));
}

function jobTurn(world: World, v: Vehicle, job: Job): boolean {
  if (job.kind === "repair") return repairTurn(world, v, job);
  if (job.kind === "search") return searchTurn(world, v, job);
  if (job.kind === "survey") return surveyTurn(world, job);
  if (job.kind === "strip") return stripTurn(world, v, job);
  if (job.kind === "weld") return weldTurn(world, v, job);
  if (job.kind === "business") return businessTurn(job);
  if (job.kind === "firstAid") return firstAidTurn(world, v, job);
  throw new Error(`Unhandled job kind ${job.kind}`);
}

function businessTurn(job: Extract<Job, { kind: "business" }>): boolean {
  job.turnsLeft = Math.max(0, job.turnsLeft - 1);
  return job.turnsLeft === 0;
}

function stripTurn(world: World, v: Vehicle, job: Extract<Job, { kind: "strip" }>): boolean {
  job.turnsLeft = Math.max(0, job.turnsLeft - 1);
  if (job.turnsLeft > 0) return false;
  finishStrip(world, v, job.partId);
  return true;
}

function finishStrip(world: World, v: Vehicle, partId: string): void {
  const part = findStripItem(v, partId).part;
  const units = stripYield(v, part);
  const refusal = stripRefusal(v, partId);
  if (refusal) throw new Error(`Part ${partId} cannot be stripped from ${v.id}: ${refusal.id}`);
  applyRefitLayout(world, v, withoutPart(v, partId).items);
  const added = addGoods(world, v, "parts", units);
  if (added < units) throw new Error(`Stripped parts would not fit on ${v.id}`);
}

function isRepairStalled(world: World, v: Vehicle, job: Extract<Job, { kind: "repair" }>): boolean {
  const part = mountedParts(v).find((p) => p.id === job.partId);
  if (!part || isJunk(part) || repairPlan(world, v, job.partId, job.parts).parts === 0) return true;
  return job.auto === true && freeParts(world, v) < job.parts;
}

function advanceRefit(world: World, v: Vehicle, job: RefitJob): void {
  if (!Array.isArray(job.queue)) throw new Error(`Refit job on ${v.id} has no queue`);
  const result = getRefitLayout(world, v, job);
  if (result.error !== null) return endJob(world, v, job, 'cancelled');
  job.turnsLeft -= 1;
  if (job.turnsLeft > 0) return;
  finishRefitStep(world, v, job, result.items);
  endJob(world, v, job, 'done');
  startNextRefitStep(world, v, job.queue);
}

function finishRefitStep(world: World, v: Vehicle, step: RefitStep, items: GridItem[]): void {
  applyRefitLayout(world, v, items);
  if (step.pickup) takePickup(world, v, step.pickup);
}

function startNextRefitStep(world: World, v: Vehicle, queue: RefitStep[]): void {
  for (const [at, step] of queue.entries()) {
    const layout = refitStepLayout(world, v, step, NOTHING_TAKEN);
    if (layout.error !== null) {
      world.events.push({ t: 'job', vehicle: v.id, job: { kind: 'refit', ...step, queue: [], turnsLeft: 0, total: 0 }, outcome: 'skipped', reason: layout.error });
      continue;
    }
    if (refitStepWork(world, v, step) === 0) {
      finishRefitStep(world, v, step, layout.items);
      continue;
    }
    return startRefitStep(world, v, step, queue.slice(at + 1));
  }
}

function takePickup(world: World, v: Vehicle, pickup: RefitPickup): void {
  if (pickup.from === 'truck') return finishTruckPickup(world, v, pickup);
  const stock = world.salvage.find((entry) => entry.id === pickup.stockId);
  const part = stock?.parts.find((entry) => entry.id === pickup.partId);
  if (!stock || !part) throw new Error('Refit stock part disappeared after validation');
  stock.parts = stock.parts.filter((entry) => entry.id !== pickup.partId);
}

export function cancelJob(world: World, v: Vehicle): void {
  if (v.job) endJob(world, v, v.job, "cancelled");
}

export function cancelRefit(world: World): World {
  return playerCommand(world, (w) => {
    const v = playerVehicle(w);
    if (v.job?.kind !== "refit") throw new Error("No refit to cancel");
    cancelJob(w, v);
  });
}

function endJob(
  world: World,
  v: Vehicle,
  job: Job,
  outcome: "done" | "cancelled",
): void {
  v.job = null;
  world.events.push({ t: "job", vehicle: v.id, job: { ...job }, outcome });
  if (outcome === "done") practiceFieldJob(world, v, job);
}

function practiceFieldJob(world: World, v: Vehicle, job: Job): void {
  if (v.id !== world.player.vehicleId || job.kind !== "repair") return;
  practice(world, "fieldJob", job.total, null, job.partId);
}
