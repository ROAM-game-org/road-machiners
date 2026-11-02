
import { Refused } from '../sim/world';
import { PERK_NUMBERS } from "../data/skills";
import { goodsCount } from "../sim/grid";
import { isBusy, isParkedForWork, repairBlocker, stripRefusal } from "../sim/jobs";
import { refusalText } from "../text/names";
import { t, type Msg } from "../text/msg";
import { partDef } from "../data/parts";
import { playerVehicle, truckFor } from "../sim/damage";
import { instantMoveItem } from "../sim/cheats";
import { gridOf, isMounted, mountedParts, placementError, type Spot } from "../sim/grid";
import { installSpot, moveItem, planItemMove, plannedTruck, plannedVehicle, startRefit, storePart, stowSpot, takeFromStorage, type RefitLayout } from "../sim/inventory";
import { takeFromTruck } from "../sim/salvage";
import { takeLoot } from "../sim/locations";
import { atGarage } from "../sim/garage";
import type { GridItem, PartInstance, PlacementRefusal, Vehicle, World } from "../sim/types";

const ROTATE_KEY_CODE = "KeyR";

const PLANNED_BLOCKER = "planned:";

export function isRotateKey(e: Pick<KeyboardEvent, "code" | "repeat" | "ctrlKey" | "metaKey" | "altKey">): boolean {
  return e.code === ROTATE_KEY_CODE && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey;
}

export const HOLD_TO_DRAG_MS = 300;

export const DOUBLE_CLICK_MS = 350;

export function dragStartOf(pointerType: string, mounted: boolean): "now" | "hold" {
  return pointerType === "touch" || mounted ? "hold" : "now";
}

export type ItemSource = "grid" | "storage" | "loot" | "truck";

export type ClickedItem = {
  source: ItemSource;
  item: GridItem;
  id: string;
  stockId: string | null;
  truckId: string | null;
  own?: string;
};

export type LastClick = { id: string; at: number } | null;

export function isDoubleClick(last: LastClick, id: string, now: number): boolean {
  return last !== null && last.id === id && now - last.at <= DOUBLE_CLICK_MS;
}

export function selectionAfterClick(selected: string | null, clicked: string): string | null {
  return selected === clicked ? null : clicked;
}

export type GridPoint = { x: number; y: number };

export type GridTap = { kind: "preview"; at: GridPoint } | { kind: "place" };

export function touchGridTap(preview: GridPoint | null, cell: GridPoint, size: { w: number; h: number }): GridTap {
  if (preview && cell.x >= preview.x && cell.x < preview.x + size.w && cell.y >= preview.y && cell.y < preview.y + size.h) return { kind: "place" };
  return { kind: "preview", at: { x: cell.x - Math.floor((size.w - 1) / 2), y: cell.y - Math.floor((size.h - 1) / 2) } };
}

export function needsHold(chassisId: string, item: GridItem): boolean {
  return item.kind === "part" && partDef(item.part.defId).kind !== "core" && isMounted(chassisId, item);
}

export type OpenPlan = { base: Vehicle; layout: RefitLayout };

export function doubleClickCommand(w: World, c: ClickedItem, instant = false, plan: OpenPlan = { base: plannedTruck(w, playerVehicle(w)), layout: {} }): ((w: World) => World) | null {
  if (c.source === "grid") return gridDoubleClick(w, c, instant);
  if (c.source === "storage") return storageCommand(w, c);
  return takeCommand(plan, c);
}

export function withPlanQueued(w: World, layout: RefitLayout, truckId?: string): World {
  if (Object.keys(layout).length === 0 || atGarage(w, truckId)) return w;
  return startRefit(w, layout, truckId);
}

function storageCommand(w: World, c: ClickedItem): ((w: World) => World) | null {
  if (c.item.kind !== "part") return null;
  const spot = installSpot(truckFor(w, c.own), c.item);
  return spot ? (next) => takeFromStorage(next, c.id, spot, c.own) : null;
}

function takeCommand(plan: OpenPlan, c: ClickedItem): ((w: World) => World) | null {
  const spot = stowSpot(pickupTruck(plan.base, plan.layout), c.item);
  if (!spot) return null;
  const dropped: Dropped = c.source === "truck" ? { source: "truck", from: c.truckId!, id: c.id, item: c.item } : { source: "loot", from: c.stockId!, id: c.id, item: c.item };
  return (next) => takeDropped(withPlanQueued(next, plan.layout, c.own), dropped, spot);
}

export type Dropped = { source: "truck" | "loot"; from: string; id: string; item: GridItem };

export function takeDropped(w: World, d: Dropped, to: Spot): World {
  if (d.source === "truck") return takeFromTruck(w, d.from, d.id, to);
  return takeLoot(w, d.from, d.item.kind === "part" ? { kind: "part", partId: d.id } : { kind: "good", good: d.id }, to);
}

function gridCommand(w: World, c: ClickedItem): ((w: World) => World) | null {
  const me = truckFor(w, c.own);
  const item = me.items.find((it) => it.id === c.id);
  if (!item || item.kind !== "part" || partDef(item.part.defId).kind === "core") return null;
  if (isMounted(me.chassisId, item)) return (next) => storePart(next, item.id, c.own);
  const spot = installSpot(me, item);
  return spot ? (next) => moveItem(next, item.id, spot, c.own) : null;
}

function gridDoubleClick(w: World, c: ClickedItem, instant: boolean): ((w: World) => World) | null {
  if (instant) return instantGridCommand(w, c);
  return atGarage(w, c.own) ? gridCommand(w, c) : null;
}

function instantGridCommand(w: World, c: ClickedItem): ((w: World) => World) | null {
  const me = playerVehicle(w);
  const item = me.items.find((it) => it.id === c.id);
  if (!item || item.kind !== "part" || partDef(item.part.defId).kind === "core") return null;
  const spot = isMounted(me.chassisId, item) ? stowSpot(me, item) : installSpot(me, item);
  return spot ? (next) => instantMoveItem(next, item.id, spot) : null;
}

export function pickupTruck(real: Vehicle, plan: RefitLayout): Vehicle {
  const planned = Object.keys(plan);
  if (planned.length === 0) return real;
  const blockers = real.items.filter((it) => plan[it.id]).map((it) => ({ ...it, ...plan[it.id], id: `${PLANNED_BLOCKER}${it.id}` }));
  return { ...real, items: [...real.items, ...blockers] };
}

export function pickupProblem(real: Vehicle, plan: RefitLayout, item: GridItem): PlacementRefusal | null {
  const truck = pickupTruck(real, plan);
  const others = truck.items.filter((it) => it.id !== item.id);
  return placementError(gridOf({ ...truck, items: [...others, item] }), others, item, null);
}

export function canFieldPatch(real: Vehicle, plannedMounted: boolean, partId: string): boolean {
  return plannedMounted && mountedParts(real).some((p) => p.id === partId);
}

export function planAfterMove(v: Vehicle, plan: RefitLayout, itemId: string, to: Spot): RefitLayout {
  const result = planItemMove(plannedVehicle(v, plan), itemId, to);
  if (result.error !== null) throw new Refused(result.error);
  const next = { ...plan };
  for (const move of result.plan.moves) {
    if (isAtStart(v, move.itemId, move.to)) delete next[move.itemId];
    else next[move.itemId] = move.to;
  }
  return next;
}

function isAtStart(v: Vehicle, itemId: string, to: Spot): boolean {
  const start = v.items.find((it) => it.id === itemId);
  if (!start) throw new Error(`No item ${itemId}`);
  return start.x === to.x && start.y === to.y && start.rot === to.rot;
}

export function patchBlocker(w: World, me: Vehicle, part: PartInstance): Msg | null {
  const refusal = repairBlocker(w, me, part.id);
  return refusal && refusalText(w, refusal);
}

function busyText(w: World, me: Vehicle): Msg | null {
  return me.job && isBusy(me) ? refusalText(w, { id: "busy", job: me.job.kind }) : null;
}

export function stripBlocker(w: World, me: Vehicle): Msg | null {
  if (!isParkedForWork(w, me)) return t("inv.stopToStrip");
  return busyText(w, me);
}

export function stripRoomText(w: World, me: Vehicle, part: PartInstance): Msg | null {
  const refusal = stripRefusal(me, part.id);
  return refusal && refusalText(w, refusal);
}

export function weldBlocker(w: World, me: Vehicle): Msg | null {
  if (!isParkedForWork(w, me)) return t("inv.stopToWeld");
  const busy = busyText(w, me);
  if (busy) return busy;
  const scrap = PERK_NUMBERS.welder.scrap;
  return (goodsCount(me).scrap ?? 0) < scrap ? t("inv.needsScrap", { n: scrap }) : null;
}
