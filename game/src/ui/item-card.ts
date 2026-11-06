import { CRATE_MASS, PARCEL } from "../data/goods";
import { isShield, partDef } from "../data/parts";
import { reachedOutpostAt } from "../sim/chaos-highway";
import { canRebuild, partRepairCost, repairPart } from "../sim/economy";
import { atGarage } from "../sim/garage";
import type { Spot } from "../sim/grid";
import { dumpItem, fieldMoveIsInstant, plannedRefitTurns, plannedTruck, planItemMove, plannedRefit, refitTurnsLeft, startRefit, type RefitLayout } from "../sim/inventory";
import { cancelRefit, startRepair, startStrip, startWeld, stripTurns, stripYield } from "../sim/jobs";
import { outpostRepairPart } from "../sim/outposts";
import { vehicleHasPerk } from "../sim/progress";
import { repairPlan } from "../sim/repair";
import { shopAt } from "../sim/market";
import { workOf } from "../sim/states";
import { isJunk, maxHp } from "../sim/wear";
import type { GridItem, PartInstance, Vehicle, World } from "../sim/types";
import { PERK_NUMBERS } from "../data/skills";
import { num, t, type Msg } from "../text/msg";
import { partName } from "../text/names";
import { actionRow, baselinePart, conditionTag, costItem, diffStats, jobDone, massStat, offActionRow, partHealthRow, partStats, statGrid, workMeterEl } from "./cards";
import { disabledWith, el } from "./dom";
import { commandFailure, jobLabel, workLabel, workProgress } from "./format";
import { keyLabel, phoneMode } from "./input-mode";
import { canFieldPatch, patchBlocker, planAfterMove, stripBlocker, stripRoomText, turnsToTry, weldBlocker } from "./inventory-moves";
import { runCommand } from "./run-command";
import { moneyEl, moneyMsg } from "./units";

export const ROTATE_KEYCAP = "R";

export type CardHost = {
  world: World;
  me: Vehicle;
  shown: Vehicle;
  plan: RefitLayout;
  truckId: string | undefined;
  look: Msg | null;
  instant: boolean;
  dumpZone: boolean;
  run: (cmd: (w: World) => World) => void;
  rotate: () => void;
  cancelPlan: () => void;
};

function stopPress(e: Event): void {
  e.stopPropagation();
}

function verbButton(verb: Msg, reason: Msg | null, command: () => void, title?: Msg): HTMLElement {
  return el("button", { class: "btn-s", title: reason ? undefined : title, onpointerdown: stopPress, ...disabledWith(reason, command) }, verb);
}

function fieldPatchable(part: PartInstance): boolean {
  const def = partDef(part.defId);
  return !isShield(def) || def.fieldRepair !== "none";
}

function shopOnlyPatchRow(part: PartInstance): HTMLElement[] {
  if (part.hp >= maxHp(part)) return [];
  return offActionRow(verbButton(t("inv.verb.patch"), t("inv.shopOnly"), () => {}), t("inv.shopOnly"));
}

function patchRow(h: CardHost, part: PartInstance): HTMLElement[] {
  if (isJunk(part)) return [];
  if (!fieldPatchable(part)) return shopOnlyPatchRow(part);
  const plan = repairPlan(h.world, h.me, part.id);
  if (plan.needed === 0) return [];
  const reason = h.look ?? patchBlocker(h.world, h.me, part);
  const button = verbButton(t("inv.verb.patch"), reason, () => h.run((world) => startRepair(world, part.id)), t("inv.patchYield", { parts: plan.parts, needed: plan.needed, hp: Math.round(plan.hp) }));
  if (reason) return offActionRow(button, reason);
  return actionRow(button, [costItem("clock", num(plan.turns, "int")), costItem("parts", t("inv.costSpend", { n: plan.parts }), "bad")], t("inv.costWords", { turns: plan.turns, parts: plan.parts }));
}

function atOutpost(h: CardHost, world: World): boolean {
  return reachedOutpostAt(world, h.me) !== null;
}

function garageRow(h: CardHost, part: PartInstance, action: "repair" | "rebuild", title: Msg): HTMLElement[] {
  const cost = partRepairCost(h.world, part);
  if (cost === 0) return [];
  const short = h.world.player.money < cost ? t("trade.needMore", { price: moneyMsg(cost - h.world.player.money) }) : null;
  const reason = h.look ?? short;
  const button = verbButton(t(`inv.verb.${action}`), reason, () => h.run((world) => (atOutpost(h, world) ? outpostRepairPart(world, part.id, h.truckId) : repairPart(world, part.id))), title);
  return reason ? offActionRow(button, reason) : actionRow(button, [moneyEl(cost)]);
}

function repairRow(h: CardHost, part: PartInstance): HTMLElement[] {
  if (!isJunk(part)) return garageRow(h, part, "repair", t("inv.repairTitle", { hp: maxHp(part) }));
  return canRebuild(h.world, part) ? garageRow(h, part, "rebuild", t("inv.rebuildTitle")) : [];
}

function stripRow(h: CardHost, part: PartInstance): HTMLElement[] {
  const reason = h.look ?? stripBlocker(h.world, h.me) ?? stripRoomText(h.world, h.me, part);
  const button = verbButton(t("inv.verb.strip"), reason, () => h.run((world) => startStrip(world, part.id)));
  if (reason) return offActionRow(button, reason);
  const turns = stripTurns(h.world, h.me, part.id);
  const parts = stripYield(h.me, part);
  return actionRow(button, [costItem("clock", num(turns, "int")), costItem("parts", t("inv.costGain", { n: parts }), "good")], t("inv.costWords", { turns, parts }));
}

function rotatePose(h: CardHost, item: GridItem): Spot | null {
  const current = h.shown.items.find((it) => it.id === item.id);
  if (!current || current.kind !== "part") return null;
  const poses = turnsToTry(current).map((rot): Spot => ({ x: current.x, y: current.y, rot }));
  return poses.find((to) => planItemMove(h.shown, current.id, to).error === null) ?? null;
}

function rotateTurns(h: CardHost, itemId: string, to: Spot): number {
  if (h.instant || atGarage(h.world, h.truckId)) return 0;
  const base = plannedTruck(h.world, h.me);
  if (fieldMoveIsInstant(base, h.plan, itemId, to)) return 0;
  return plannedRefitTurns(h.world, h.me, planAfterMove(base, h.plan, itemId, to));
}

function refitRefusal(h: CardHost, itemId: string, to: Spot): Msg | null {
  const next = planAfterMove(plannedTruck(h.world, h.me), h.plan, itemId, to);
  const failed = runCommand(h.world, (x) => startRefit(x, next, h.truckId), () => {});
  return failed === null ? null : commandFailure(h.world, failed);
}

export function rotateButton(rotate: () => void, reason: Msg | null): HTMLElement {
  const press = (e: Event) => {
    e.stopPropagation();
    if (!reason) rotate();
  };
  const key = (e: Event) => {
    if ((e as MouseEvent).detail === 0 && !reason) rotate();
  };
  return el("button", { class: "btn-s", "data-action": "rotate", title: reason ? undefined : keyLabel(t("inv.rotate"), ROTATE_KEYCAP), onpointerdown: press, ...(reason ? disabledWith(reason, () => {}) : { onclick: key }) }, t("inv.rotate"));
}

function rotateCostRow(button: HTMLElement, turns: number): HTMLElement[] {
  return turns > 0 ? actionRow(button, [costItem("clock", num(turns, "int"))], t("inv.refitPlanned", { n: turns })) : actionRow(button, []);
}

function rotateReason(h: CardHost, itemId: string, to: Spot, turns: number): Msg | null {
  if (h.look) return h.look;
  return turns > 0 ? refitRefusal(h, itemId, to) : null;
}

function rotateOffered(h: CardHost): boolean {
  return !phoneMode() && (h.me.job === null || h.me.job.kind === "refit");
}

function rotateRow(h: CardHost, item: GridItem): HTMLElement[] {
  const to = rotateOffered(h) ? rotatePose(h, item) : null;
  if (!to) return [];
  const turns = rotateTurns(h, item.id, to);
  const reason = rotateReason(h, item.id, to, turns);
  const button = rotateButton(h.rotate, reason);
  return reason ? offActionRow(button, reason) : rotateCostRow(button, turns);
}

function dumpReason(h: CardHost, item: GridItem): Msg | null {
  if (h.look) return h.look;
  const failed = runCommand(h.world, (x) => dumpItem(x, item.id, h.truckId), () => {});
  return failed === null ? null : commandFailure(h.world, failed);
}

function dumpRow(h: CardHost, item: GridItem, mounted: boolean): HTMLElement[] {
  if (!h.dumpZone || phoneMode() || mounted || h.me.job) return [];
  const reason = dumpReason(h, item);
  const button = el("button", { class: "btn-s", "data-drop": "dump", onpointerdown: stopPress, ...disabledWith(reason, () => h.run((world) => dumpItem(world, item.id, h.truckId))) }, t("inv.dumpShort"));
  return reason ? offActionRow(button, reason) : actionRow(button, []);
}

function weldRow(h: CardHost): HTMLElement[] {
  const { scrap, turns, part } = PERK_NUMBERS.welder;
  const reason = h.look ?? weldBlocker(h.world, h.me);
  const button = verbButton(t("inv.verb.weld"), reason, () => h.run((world) => startWeld(world)), t("inv.weldSpends", { scrap }));
  if (reason) return offActionRow(button, reason);
  return actionRow(button, [costItem("clock", num(turns, "int")), el("span", { class: "cost-item" }, partName(part))], t("inv.weldSpends", { scrap }));
}

function cargoRows(h: CardHost, item: GridItem): HTMLElement[] {
  const welds = item.kind === "good" && item.good === "scrap" && vehicleHasPerk(h.world, h.me, "welder");
  return [...(welds ? weldRow(h) : []), ...dumpRow(h, item, false)];
}

function partRows(h: CardHost, item: Extract<GridItem, { kind: "part" }>, mounted: boolean): HTMLElement[] {
  const part = item.part;
  const strips = partDef(part.defId).kind !== "core" && h.me.id === h.world.player.vehicleId;
  return [
    ...(canFieldPatch(h.me, mounted, part.id) ? patchRow(h, part) : []),
    ...(shopAt(h.world) || atOutpost(h, h.world) ? repairRow(h, part) : []),
    ...rotateRow(h, item),
    ...(strips ? stripRow(h, part) : []),
    ...dumpRow(h, item, mounted),
  ];
}

export function itemActions(h: CardHost, item: GridItem, mounted: boolean): HTMLElement[] {
  if (!h.me.items.some((it) => it.id === item.id)) return [];
  return item.kind === "part" ? partRows(h, item, mounted) : cargoRows(h, item);
}

export function partDetails(w: World, me: Vehicle, part: PartInstance, mounted: boolean): HTMLElement[] {
  const base = mounted ? null : baselinePart(me, partDef(part.defId).kind);
  const shown = partStats(w, part).filter((s) => !(mounted && s.icon === "arc"));
  const health = partHealthRow(part);
  return [
    ...(health ? [health] : []),
    ...(base ? [el("p", { class: "dim inv-against" }, t("inv.against", { part: partName(base.defId) }), conditionTag(base))] : []),
    statGrid(diffStats(shown, base ? partStats(w, base) : null)),
  ];
}

export function itemFacts(w: World, me: Vehicle, item: GridItem, mounted: boolean): HTMLElement[] {
  if (item.kind === "part") return partDetails(w, me, item.part, mounted);
  return [statGrid(diffStats([massStat(item.kind === "parcel" ? PARCEL.mass : CRATE_MASS)], null))];
}

function queuedSteps(w: World, me: Vehicle): HTMLElement[] {
  return plannedRefit(w, me).steps.map(({ step, work }) => el("div", { class: "job-row queued" }, el("span", { class: "job-name" }, jobLabel(w, me, { ...step, kind: "refit", queue: [], turnsLeft: 0, total: 0 })), costItem("clock", num(work, "int"))));
}

function cancelRefitButton(h: CardHost): HTMLElement | null {
  if (h.me.job?.kind !== "refit") return null;
  return el("button", { class: "btn-s", title: t("inv.cancelRefitTitle"), ...disabledWith(h.look, () => h.run(cancelRefit)) }, t("inv.cancelPlan"));
}

function jobTitle(h: CardHost): Msg | undefined {
  return h.me.job?.kind === "refit" ? t("inv.refitLeft", { n: refitTurnsLeft(h.world, h.me) }) : undefined;
}

function runningRows(h: CardHost): HTMLElement[] {
  const work = workOf(h.world, h.me);
  if (!work) return [];
  const done = work.from === "job" ? jobDone(work.job) : workProgress(work);
  return [el("div", { class: "job-row", title: jobTitle(h) }, el("span", { class: "job-name" }, workLabel(h.world, h.me, work)), costItem("clock", num(work.turnsLeft, "int")), cancelRefitButton(h)), workMeterEl(done), ...queuedSteps(h.world, h.me)];
}

function planRows(h: CardHost): HTMLElement[] {
  if (Object.keys(h.plan).length === 0) return [];
  const turns = plannedRefitTurns(h.world, h.me, h.plan);
  const start = el("button", { class: "btn-s", ...disabledWith(h.look, () => h.run((world) => startRefit(world, h.plan, h.truckId))) }, t("inv.verb.refit"));
  const cancel = el("button", { class: "btn-s", onclick: h.cancelPlan }, t("inv.cancelPlan"));
  return [el("div", { class: "action-rows plan" }, ...actionRow(start, [costItem("clock", num(turns, "int"))], t("inv.refitPlanned", { n: turns })), ...actionRow(cancel, []))];
}

export function jobBlock(h: CardHost): HTMLElement[] {
  const rows = [...runningRows(h), ...planRows(h)];
  return rows.length === 0 ? [] : [el("div", { class: "well-group job-block" }, ...rows)];
}

