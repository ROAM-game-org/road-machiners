import type { TruckPaint } from "../data/chassis";
import { partDef } from "../data/parts";
import { baseGrid, isMounted, itemCells, mountCellsOf, type Spot } from "../sim/grid";
import type { GridItem, PartInstance, Vehicle, World } from "../sim/types";
import { maxHp } from "../sim/wear";
import { playerTrucks } from "../sim/damage";
import { coreItems, isCore, mountSpotsOf, type GarageBody, type GarageNeed, type GaragePart, type GarageRenders, type GarageSprite } from "../three/render/garageRender";
import { el } from "./dom";
import { tierOf } from "./hud-readout";
import { turnedIcon, type GridMetrics, type PixelRect } from "./inventory-draw";

type PartItem = Extract<GridItem, { kind: "part" }>;

export type GarageLook = { renders: GarageRenders; paint: TruckPaint; truck: Vehicle };

function isPartItem(it: GridItem): it is PartItem {
  return it.kind === "part";
}

function onTruck(v: Vehicle, it: GridItem): boolean {
  return itemCells(it).every((c) => c.y < baseGrid(v.chassisId).h);
}

export function spotOf(it: GridItem): Spot {
  return { x: it.x, y: it.y, rot: it.rot };
}

function everySpot(truck: Vehicle, part: PartInstance): GaragePart {
  return { part, spots: mountSpotsOf(truck.chassisId, part, coreItems(truck)) };
}

function looseParts(items: readonly GridItem[]): PartInstance[] {
  return items.filter(isPartItem).map((it) => it.part).filter((part) => !isCore(part));
}

export function ownNeed(truck: Vehicle, paint: TruckPaint, extra: readonly GridItem[]): GarageNeed {
  return { truck, paint, parts: [...looseParts(truck.items), ...looseParts(extra)].map((part) => everySpot(truck, part)) };
}

export function shownNeed(truck: Vehicle, paint: TruckPaint): GarageNeed {
  const mounted = truck.items.filter(isPartItem).filter((it) => !isCore(it.part) && onTruck(truck, it) && isMounted(truck.chassisId, it));
  return { truck, paint, parts: mounted.map((it) => ({ part: it.part, spots: [spotOf(it)] })) };
}

export function backgroundNeeds(w: World): GarageNeed[] {
  const storage = w.player.storage.map((part): GridItem => ({ id: `store-${part.id}`, x: 0, y: 0, rot: 0, kind: "part", part }));
  return playerTrucks(w).map((truck) => ownNeed(truck, w.player.paint, storage));
}

export function percentOf(part: PartInstance): number {
  return part.hp > 0 ? Math.max(1, Math.floor((part.hp / maxHp(part)) * 100)) : 0;
}

function placed(node: HTMLElement, sprite: GarageSprite, m: GridMetrics, from: { left: number; top: number }): HTMLElement {
  const k = m.pxPerMeter;
  node.style.cssText = `left:${sprite.left * k - from.left}px;top:${sprite.top * k - from.top}px;width:${sprite.width * k}px;height:${sprite.height * k}px`;
  return node;
}

function layered(sprite: GarageSprite, className: string): HTMLElement {
  const mask = `url("${sprite.url}")`;
  const art = el("div", { class: className, "aria-hidden": "true" });
  for (const layer of ["art-img", "art-tint", "art-hatch"]) {
    const node = el("div", { class: layer });
    if (layer === "art-img") node.style.backgroundImage = mask;
    else {
      node.style.setProperty("-webkit-mask-image", mask);
      node.style.setProperty("mask-image", mask);
    }
    art.append(node);
  }
  return art;
}

export function truckBackdrop(body: GarageBody, m: GridMetrics): HTMLElement {
  const img = el("img", { class: "inv-backdrop", src: body.image.url, draggable: "false" });
  img.setAttribute("alt", "");
  return placed(img, body.image, m, { left: 0, top: 0 });
}

export function partArt(sprite: GarageSprite, m: GridMetrics, box: PixelRect): HTMLElement {
  return placed(layered(sprite, "inv-art"), sprite, m, box);
}

export function coreArt(body: GarageBody, part: PartInstance, m: GridMetrics, box: PixelRect): HTMLElement | null {
  const sprite = body.cores.get(part.id);
  return sprite ? placed(layered(sprite, "inv-art core"), sprite, m, box) : null;
}

export function tierAttr(it: GridItem): string {
  return it.kind === "part" ? tierOf(percentOf(it.part)) : "ok";
}

function standsOnTruck(look: GarageLook, it: GridItem): it is PartItem {
  return isPartItem(it) && !isCore(it.part) && isMounted(look.truck.chassisId, it) && onTruck(look.truck, it);
}

export function drawnSprite(look: GarageLook, it: GridItem): GarageSprite | null {
  if (!standsOnTruck(look, it)) return null;
  const sprite = look.renders.sprite(look.truck, look.paint, it.part, spotOf(it));
  return sprite?.url ? sprite : null;
}

export function isWeaponItem(it: GridItem): boolean {
  return isPartItem(it) && partDef(it.part.defId).kind === "weapon";
}

export type GarageLooks = { own: GarageLook | null; other: GarageLook | null };

export function garageLooks(renders: GarageRenders | null, w: World, own: Vehicle, extra: readonly GridItem[], otherId: string | null): GarageLooks {
  if (!renders) return { own: null, other: null };
  const other = w.vehicles.find((v) => v.id === otherId) ?? null;
  const paint = w.player.paint;
  renders.ensureNow([ownNeed(own, paint, extra), ...(other ? [shownNeed(other, paint)] : [])]);
  return { own: { renders, paint, truck: own }, other: other ? { renders, paint, truck: other } : null };
}

export function ghostArt(look: GarageLook | null, it: GridItem, m: GridMetrics, box: PixelRect): HTMLElement | null {
  const sprite = look ? drawnSprite(look, it) : null;
  return sprite ? partArt(sprite, m, box) : null;
}

export function fillGhost(ghost: HTMLElement, look: GarageLook | null, it: GridItem, m: GridMetrics, box: PixelRect, tone: string, dragOver: HTMLElement | null): void {
  const art = tone === "ok" ? ghostArt(look, it, m, box) : null;
  ghost.className = `inv-ghost${dragOver ? "" : " placed"} ${tone}${art ? " drawn" : ""}`;
  ghost.replaceChildren(art ?? turnedIcon(it, m));
  if (dragOver) markMounts(dragOver, it);
}

export function markMounts(grid: HTMLElement, it: GridItem): void {
  grid.dataset.mounts = isPartItem(it) && !isCore(it.part) ? mountCellsOf(it.part.defId).join(" ") : "";
}
