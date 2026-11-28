
import { keyPress } from "./control-sound";
import { runCommand } from "./run-command";
import { chassisDef } from "../data/chassis";
import { partDef } from "../data/parts";
import { playerVehicle, truckFor } from "../sim/damage";
import { instantMoveItem } from "../sim/cheats";
import { getLotTradePrice, sellPrice } from "../sim/economy";
import { sellStoredGood, storedHere, storeTotal } from "../sim/goods-store";
import { GOODS_STORE } from "../data/market";
import { lotLabel, rowButton } from "./shop-rows";
import { deepestFirst, gridOf, isMounted, nextTurn, type Cell, type Spot } from "../sim/grid";
import {
  dumpItem,
  installSpot,
  fieldMoveIsInstant,
  moveItem,
  planItemMove,
  plannedTruck,
  plannedVehicle,
  startRefit,
  stowSpot,
  type RefitLayout,
} from "../sim/inventory";
import { shopAt, shopTrades } from "../sim/market";
import { atGarage } from "../sim/garage";
import { needsSearch, takeAllLoot, takeStores } from "../sim/locations";
import { canLootTruck, claimedPartIn, claimOn, hasStores, hiddenUnitsFor, visibleParts } from "../sim/salvage";
import { isKnockedOut } from "../sim/defeat";
import { knowsCargo } from "../sim/look-over";
import { REGION } from "../data/region";
import type {
  GridItem,
  PartInstance,
  SalvageStock,
  Vehicle,
  World,
} from "../sim/types";
import { keyTip, touchMode } from "./input-mode";
import { disabledWith, el, panel, uiRoot } from "./dom";
import { lookOrTurnReason, lookOverReason } from "./unstuck-reason";
import { uiSize } from "./ui-size";
import type { UiHost } from "./host";
import { itemLookId } from "../render/partLooks";
import { actionRow, conditionMeter, conditionTag, createIcon, createItemIcon, itemLoreEl, footprint as footprintEl, itemIconEl, partIconEl, toneStyle } from "./cards";
import { budgetGroup, truckGroups } from "./truck-panel";
import { autoPatchKey } from "./auto-patch-key";
import { itemActions, itemFacts, jobBlock, rotateButton, type CardHost } from "./item-card";
import {
  blockerIds,
  clearFan,
  fanSvg,
  weaponDefOf,
  gridEl,
  itemBox,
  itemName,
  idleActions, splitActions,
  chooseLayout,
  hostedRooms,
  type FitRoom,
  type StorePlace,
  stackedLayout,
  truckMeters,
  benchRooms,
  hostedWidth,
  bandedHeight,
  overflowIn,
  scrollAncestor,
  targetRoom,
  trimFrame,
  gridSize,
  type GridLayout,
  lootGoodItem,
  lootPartItem,
  markWorking,
  markTaken,
  refitMarks,
  removalMarks,
  takenMarks,
  workMarkOf,
  storageItem,
  storedGoodItem,
  footprint,
  cellUnder,
  GridScale,
  pxStyle,
  rectOf,
  drawnReach,
  reachPadding,
  NO_REACH,
  type Reach,
  type PixelRect,
} from "./inventory-draw";
import { fillGhost, garageLooks, pivotPx, type GarageLooks } from "./garage-draw";
import { fuelLiters } from "./units";
import { getSearchAction } from "./hud-readout";
import { canFieldPatch, patchBlocker, stripBlocker, stripRoomText, weldBlocker, doubleClickCommand, dragStartOf, planAfterMove, withPlanQueued, takeDropped, pickupProblem, pickupTruck, HOLD_TO_DRAG_MS, isDoubleClick, needsHold, selectionAfterClick, selectionAfterPress, touchGridTap, type ClickedItem, type ItemSource, type LastClick, isRotateKey, storeItem, takeFromStore, turnsToTry } from "./inventory-moves";
import type { Refusal } from "../sim/types";
import { bindAttr, setText } from "../text/language";
import { t, type Msg } from "../text/msg";
import { chassisName, goodName, partName, refusalText, siteName, vehicleTitle } from "../text/names";
import { Refused, setAutoRepair } from "../sim/world";
import { commandFailure, downedStateText, parcelTitle } from "./format";

type Drag = {
  source: ItemSource;
  id: string;
  item: GridItem;
  grab: { x: number; y: number };
  ghost: HTMLElement;
  start: { x: number; y: number };
  moved: boolean;
};

type Tap = { pointerId: number; x: number; y: number };

type Press = { timer: number; source: ItemSource; id: string; item: GridItem; grab: { x: number; y: number } };

const SHORT_LAYER = 600;

export type BenchHead = { title: HTMLElement; close: HTMLElement };

const REACH_PASSES = 2;
const REACH_TOLERANCE = 0.01;

function sameReach(a: Reach, b: Reach): boolean {
  return (["top", "right", "bottom", "left"] as const).every((side) => Math.abs(a[side] - b[side]) < REACH_TOLERANCE);
}

export class InventoryView {
  private drag: Drag | null = null;
  private press: Press | null = null;
  private preview: Drag | null = null;
  private tap: Tap | null = null;
  private lastClick: LastClick = null;
  private pressedCell: { x: number; y: number } | null = null;
  private lastPointer: PointerEvent | null = null;
  private holdId: number | null = null;
  private stopScroll: ((e: TouchEvent) => void) | null = null;
  private error: Msg | null = null;
  private gridEl: HTMLElement | null = null;
  private root: HTMLElement = el("div", { class: "inv-view" });
  private inspection = el("div", { class: "inv-inspection" });
  private keys = el("div", { class: "inv-keys" });
  private costs = el("div", { class: "inv-costs" });
  private lootKeys = el("div", { class: "inv-keys loot" });
  private selectedItem: string | null = null;
  private loot: string | null = null;
  private truck: string | null = null;
  private looking = false;
  private reach: Reach = NO_REACH;
  private gridTruck: string | null = null;
  private scale = new GridScale();
  private looks: GarageLooks = { own: null, other: null };
  private plan: RefitLayout = {};
  private head: BenchHead | null = null;

  constructor(
    private host: UiHost,
    private onChange: () => void,
    private dumpZone: boolean,
    private instant = false,
  ) {
    window.addEventListener("pointermove", (e) => this.onMove(e));
    window.addEventListener("pointerup", (e) => this.onDrop(e));
    window.addEventListener("pointercancel", (e) => this.onCancel(e));
    this.root.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("button, .inv-inspection, .inv-item, .inv-chip")) return;
      if (this.beginGridTap(e)) return;
      this.select(null);
    });
    window.addEventListener("keydown", (e) => {
      if (!isRotateKey(e) || this.host.menuOpen()) return;
      if (this.drag) this.rotate();
      else this.rotateSelected(true);
    });
    window.addEventListener("contextmenu", (e) => {
      if (!this.drag) return;
      e.preventDefault();
      this.rotate();
    });
  }

  setHead(head: BenchHead | null): void {
    this.head = head;
  }

  fitTo(box: HTMLElement): void {
    const key = this.fitKeyOf(box);
    if (this.scale.holds(key)) {
      this.render();
      return;
    }
    if (this.head) box.style.removeProperty("height");
    this.scale.reset();
    this.reach = NO_REACH;
    this.render();
    if (this.root.querySelector(".inv-truck") === null) throw new Error("Inventory view is not rendered");
    if (this.head) this.fitBench(box, key);
    else this.fitHosted(box, key);
  }

  private fitKeyOf(box: HTMLElement): string {
    const w = this.host.world();
    const me = gridOf(this.shown(w));
    const layer = uiSize().layerSize();
    const room = this.head ? `${layer.width}x${layer.height}` : `${box.offsetHeight}`;
    return [this.mine(w).id, me.w, me.h, this.shown(w).chassisId, this.truck ?? "", this.looking, this.loot ?? "", uiSize().toLayer(1), layer.width, room, this.head ? "bench" : "hosted"].join("|");
  }

  private fitHosted(box: HTMLElement, key: string): void {
    const me = this.shown(this.host.world());
    const truck = truckMeters(me.chassisId, gridOf(me));
    const height = bandedHeight(box, this.root) ?? gridSize(this.scale.mine).height - overflowIn(scrollAncestor(box) ?? box, this.root);
    const narrow = uiRoot().classList.contains("narrow");
    const layout = narrow ? stackedLayout(height, truck) : chooseLayout(this.hostedRooms(box, height), truck);
    this.markStore(box, layout.store);
    this.scale.apply(key, layout, null);
    this.render();
  }

  private hostedRooms(box: HTMLElement, height: number): FitRoom[] {
    return box.closest(".town-split.banded") ? hostedRooms(box, this.root, height) : [{ columns: 1, width: hostedWidth(box, this.root), height }];
  }

  private markStore(box: HTMLElement, store: StorePlace | undefined): void {
    const split = box.closest<HTMLElement>(".town-split");
    if (!split) return;
    if (store) split.dataset.store = store;
    else delete split.dataset.store;
  }

  private fitBench(frame: HTMLElement, key: string): void {
    const w = this.host.world();
    const me = this.shown(w);
    this.root.classList.toggle("short-layer", uiSize().layerSize().height < SHORT_LAYER);
    const rooms = benchRooms(frame, this.root, this.gridEl);
    const layout = chooseLayout(rooms, truckMeters(me.chassisId, gridOf(me)));
    this.scale.apply(key, layout, this.targetLayout(w, layout));
    this.render();
    this.refitTarget(w, layout, key);
    trimFrame(frame, rooms[0].height - gridSize(this.scale.mine).height);
    uiRoot().style.setProperty("--inv-frame-w", `${frame.offsetWidth}px`);
  }

  private refitTarget(w: World, layout: GridLayout, key: string): void {
    for (let pass = 0; pass < REACH_PASSES; pass++) {
      const grid = this.root.querySelector<HTMLElement>(".inv-target .inv-grid");
      if (!grid) return;
      const measured = drawnReach(grid);
      if (sameReach(measured, this.reach)) return;
      this.reach = measured;
      this.scale.apply(key, layout, this.targetLayout(w, layout));
      this.render();
    }
  }

  private targetLayout(w: World, layout: GridLayout): GridLayout | null {
    const target = w.vehicles.find((v) => v.id === this.truck);
    const room = target ? targetRoom(this.root, this.reach) : null;
    return target && room ? chooseLayout([room], truckMeters(target.chassisId, gridOf(target))) : null;
  }

  setLoot(stockId: string | null): void {
    this.loot = stockId;
    this.truck = null;
    this.looking = false;
  }

  setTruck(vehicleId: string | null, mode: "downed" | "look"): void {
    this.truck = vehicleId;
    this.looking = mode === "look";
    this.loot = null;
  }

  lookOnlyReason(): Msg | null {
    return lookOverReason(this.host.world(), this.looking);
  }

  render(): HTMLElement {
    const w = this.host.world();
    const me = this.shown(w);
    const g = gridOf(me);
    this.showSelection(w);
    this.looks = garageLooks(this.host.garageRenders?.() ?? null, w, me, this.otherItems(w), this.truck);
    const grid = gridEl(g, me.chassisId, this.scale.measure(me, true), this.looks.own, this.selection(w));
    grid.append(...this.gridItems(w, me));
    this.gridEl = grid;
    this.showFan(me, this.selectedGun(me));
    this.drawPreview(grid, me);
    const error = this.error ? el("div", { class: "bad" }, this.error) : el("div");
    if (!this.loot) this.lootKeys.replaceChildren();
    this.root.replaceChildren(this.head ? this.benchEl(w, this.head, grid, error) : this.hostedEl(w, grid, error));
    return this.root;
  }

  private hostedEl(w: World, grid: HTMLElement, error: HTMLElement): HTMLElement {
    const stores = this.storeList(w);
    return el(
      "div",
      { class: "inv-wrap" },
      el("div", { class: "inv-truck" }, el("div", { class: "truck-shell" }, grid)),
      el("div", { class: "inv-side screen-block" }, this.costs, ...this.jobBlock(w), this.inspection, error),
      stores.length > 0 ? el("div", { class: "inv-store screen-block", "data-drop": "storage" }, ...stores) : null,
    );
  }

  get keysEl(): HTMLElement {
    return this.keys;
  }

  private benchEl(w: World, head: BenchHead, grid: HTMLElement, error: HTMLElement): HTMLElement {
    const me = this.mine(w);
    const budget = budgetGroup(w, me, this.selection(w)?.item ?? null);
    const two = this.scale.columns === 2;
    const name = el("h3", { class: "inv-truck-name tape screen-tape" }, chassisName(chassisDef(me.chassisId).id));
    const middle = el("div", { class: "inv-middle" }, el("div", { class: "inv-band" }, two ? head.title : null), name, el("div", { class: "inv-truck" }, grid));
    const close = el("div", { class: "inv-band close-band" }, head.close);
    return two ? this.twoColumns(w, me, middle, close, budget, error) : this.threeColumns(w, me, head, middle, close, budget, error);
  }

  private threeColumns(w: World, me: Vehicle, head: BenchHead, middle: HTMLElement, close: HTMLElement, budget: HTMLElement, error: HTMLElement): HTMLElement {
    return el(
      "div",
      { class: "inv-bench" },
      el("div", { class: "inv-side-column" }, el("div", { class: "inv-band" }, head.title), el("div", { class: "well" }, budget, ...(this.sourceList(w) ?? truckGroups(w, me)), ...this.jobBlock(w)), this.targetEl(w)),
      middle,
      el("div", { class: "inv-side-column" }, close, el("div", { class: "well" }, this.inspection, error, this.costs)),
      this.footEl(w),
    );
  }

  private twoColumns(w: World, me: Vehicle, middle: HTMLElement, close: HTMLElement, budget: HTMLElement, error: HTMLElement): HTMLElement {
    const facts = this.sourceList(w) ?? (this.selection(w) ? [] : truckGroups(w, me));
    return el("div", { class: "inv-bench two" }, middle, el("div", { class: "inv-side-column" }, close, el("div", { class: "well" }, budget, ...facts, this.inspection, ...this.jobBlock(w), error, this.costs), this.targetEl(w)), this.footEl(w));
  }

  private targetEl(w: World): HTMLElement | null {
    return this.truck ? this.targetScreen(w, this.truck) : null;
  }

  private fillActions(actions: HTMLElement[], idle: Msg): void {
    const { keys, costs } = splitActions(actions);
    this.keys.replaceChildren(keys.length > 0 ? el("div", { class: "action-rows" }, ...keys) : idleActions(idle));
    this.costs.replaceChildren(...costs);
  }

  private footEl(w: World): HTMLElement {
    return el("div", { class: "inv-foot" }, this.loot || this.truck ? this.lootKeys : this.settingKeys(w), this.keys);
  }

  private settingKeys(w: World): HTMLElement {
    const own = this.mine(w).id === w.player.vehicleId;
    return el("div", { class: "inv-keys settings" }, own ? autoPatchKey({ on: w.player.autoRepair, reason: this.look(), flip: () => this.flipAutoPatch() }) : null);
  }

  private flipAutoPatch(): void {
    const w = this.host.world();
    this.host.apply(setAutoRepair(w, !w.player.autoRepair));
  }

  private sourceList(w: World): HTMLElement[] | null {
    if (!this.loot && !this.truck) return null;
    return this.sideList(w);
  }

  private itemEl(w: World, it: GridItem): HTMLElement {
    const me = this.shown(w);
    const mounted = it.kind === "part" && isMounted(me.chassisId, it);
    const core = it.kind === "part" && partDef(it.part.defId).kind === "core";
    const node = itemBox(it, me.chassisId, mounted, this.scale.mine, this.looks.own);
    node.setAttribute("aria-pressed", String(this.selectedItem === it.id));
    node.classList.toggle("selected", this.selectedItem === it.id);
    const click = () => this.clickItem(this.clicked("grid", it.id, it));
    node.addEventListener("click", (e) => {
      if (fromButton(e) || !(core || e.detail === 0)) return;
      this.pressedCell = e.detail === 0 || !this.gridEl ? null : cellUnder(this.scale.mine, this.gridEl, e.clientX, e.clientY);
      click();
    });
    node.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      this.pressedCell = null;
      click();
    });
    this.hoverFan(node, me, it, mounted);
    if (!core)
      node.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        if (!this.gridEl) throw new Error("Grid item pressed without a grid");
        const at = cellUnder(this.scale.mine, this.gridEl, e.clientX, e.clientY);
        const grab = { x: at.x - it.x, y: at.y - it.y };
        this.pressedCell = at;
        if (dragStartOf(e.pointerType, needsHold(me.chassisId, it)) === "hold") this.startPress(e, "grid", it.id, it, grab);
        else this.startDrag(e, "grid", it.id, it, grab);
      });
    return node;
  }

  private shown(w: World): Vehicle {
    return plannedVehicle(plannedTruck(w, this.mine(w)), this.plan);
  }

  private gridItems(w: World, v: Vehicle): HTMLElement[] {
    const real = this.mine(w);
    const marks = refitMarks(w, real);
    for (const id of Object.keys(this.plan)) marks.set(id, "queued");
    const work = workMarkOf(w, real);
    const withWork = (it: GridItem, node: HTMLElement): HTMLElement => (work?.itemIds.has(it.id) ? markWorking(node, work.done) : node);
    const node = (it: GridItem) => (marks.get(it.id) === "queued" ? this.plannedEl(w, it) : withWork(it, marks.has(it.id) ? this.refittingEl(w, real, it) : this.itemEl(w, it)));
    return deepestFirst(v.chassisId, [...v.items].sort((a, b) => Number(marks.has(a.id)) - Number(marks.has(b.id)))).map(node);
  }

  private plannedEl(w: World, item: GridItem): HTMLElement {
    const node = this.itemEl(w, item);
    node.classList.add("refitting");
    return node;
  }

  private refittingEl(w: World, real: Vehicle, item: GridItem): HTMLElement {
    const node = this.itemEl(w, item);
    if (real.job?.kind === "refit") bindAttr(node, "title", t("inv.itemRefit", { item: itemName(item), n: real.job.turnsLeft }));
    return node;
  }

  private selectedGun(me: Vehicle): GridItem | null {
    const it = me.items.find((item) => item.id === this.selectedItem);
    return it && it.kind === "part" && weaponDefOf(it) && isMounted(me.chassisId, it) ? it : null;
  }

  private hoverFan(node: HTMLElement, me: Vehicle, it: GridItem, mounted: boolean): void {
    if (!mounted || !weaponDefOf(it)) return;
    node.addEventListener("mouseenter", () => this.showFan(me, it));
    node.addEventListener("mouseleave", () => this.showFan(me, this.selectedGun(me)));
  }

  private showFan(me: Vehicle, it: GridItem | null): void {
    if (!this.gridEl) return;
    clearFan(this.gridEl);
    if (it) this.drawFan(this.gridEl, me, it);
  }

  private drawFan(grid: HTMLElement, me: Vehicle, it: GridItem): void {
    const def = weaponDefOf(it);
    if (!def) return;
    grid.append(fanSvg(me, it, this.scale.mine, pivotPx(this.looks.own, it, this.scale.mine)));
    for (const id of blockerIds(me, it)) grid.querySelector(`[data-item-id="${id}"]`)?.classList.add("blocking");
  }

  private selection(w: World): { item: GridItem; mounted: boolean; own: boolean } | null {
    const id = this.selectedItem;
    if (id === null) return null;
    const me = this.shown(w);
    const own = me.items.find((it) => it.id === id);
    if (own) return { item: own, mounted: own.kind === "part" && isMounted(me.chassisId, own), own: true };
    const item = this.otherItems(w).find((it) => it.id === id);
    return item ? { item, mounted: false, own: false } : null;
  }

  private otherItems(w: World): GridItem[] {
    return this.otherSources(w).map((entry) => entry.item);
  }

  private otherSources(w: World): { source: ItemSource; item: GridItem }[] {
    const stock = this.loot ? w.salvage.find((s) => s.id === this.loot) : undefined;
    const target = this.truck ? w.vehicles.find((v) => v.id === this.truck) : undefined;
    return [
      ...w.player.storage.map((p) => ({ source: "storage" as const, item: storageItem(p) })),
      ...Object.keys(this.storeShop(w) ? storedHere(w) : {}).map((good) => ({ source: "storage" as const, item: storedGoodItem(good) })),
      ...(stock ? [...visibleParts(w, playerVehicle(w), stock).map(lootPartItem), ...Object.keys(stock.goods).map(lootGoodItem)] : []).map((item) => ({ source: "loot" as const, item })),
      ...(target ? target.items : []).map((item) => ({ source: "truck" as const, item })),
    ];
  }

  private showSelection(w: World): void {
    const selection = this.selection(w);
    if (!selection) {
      this.selectedItem = null;
      this.inspection.replaceChildren(el("p", { class: "dim idle" }, t("inv.selectHint")));
      this.fillActions([], t("inv.selectHint"));
    } else if (selection.own) this.showItem(w, selection.item, selection.mounted);
    else this.showTruckItem(w, selection.item);
  }

  selectedPart(): PartInstance | null {
    const item = this.selection(this.host.world())?.item;
    return item?.kind === "part" ? item.part : null;
  }

  clearSelection(): void {
    this.selectedItem = null;
    this.preview = null;
    this.lastClick = null;
  }

  private select(id: string | null): void {
    if (this.selectedItem === id) return;
    this.selectedItem = id;
    this.preview = null;
    this.onChange();
  }

  private clickItem(c: ClickedItem): void {
    const now = Date.now();
    const double = isDoubleClick(this.lastClick, c.item.id, now);
    this.lastClick = double ? null : { id: c.item.id, at: now };
    const cmd = double && !this.look() ? doubleClickCommand(this.host.world(), c, this.instant, { base: plannedTruck(this.host.world(), this.mine(this.host.world())), layout: this.plan }) : null;
    if (cmd) {
      this.selectedItem = null;
      this.run(cmd);
      return;
    }
    this.selectedItem = double ? c.item.id : this.pressedSelection(c);
    this.onChange();
  }

  private pressedSelection(c: ClickedItem): string | null {
    const cell = this.pressedCell;
    this.pressedCell = null;
    if (c.source !== "grid" || !cell) return selectionAfterClick(this.selectedItem, c.item.id);
    return selectionAfterPress(this.shown(this.host.world()), this.selectedItem, c.item, cell);
  }

  private clicked(source: ItemSource, id: string, item: GridItem): ClickedItem {
    return { source, id, item, stockId: this.loot, truckId: this.truck, own: this.gridTruck ?? undefined };
  }

  showTruck(id: string | null): void {
    if (this.gridTruck === id) return;
    this.gridTruck = id;
    this.plan = {};
    this.error = this.selectedItem = null;
    this.preview = null;
  }

  private mine(w: World): Vehicle {
    return truckFor(w, this.gridTruck ?? undefined);
  }

  private jobBlock(w: World): HTMLElement[] {
    return jobBlock(this.cardHost(w));
  }

  private cardHost(w: World): CardHost {
    return { world: w, me: this.mine(w), shown: this.shown(w), plan: this.plan, truckId: this.gridTruck ?? undefined, look: this.look(), instant: this.instant, dumpZone: this.dumpZone, run: (cmd) => this.run(cmd), rotate: () => this.rotateHeld(), cancelPlan: () => this.cancelPlan() };
  }

  private cancelPlan(): void {
    this.plan = {};
    this.onChange();
  }

  commitPlan(): void {
    if (Object.keys(this.plan).length === 0) return;
    const layout = this.plan;
    this.plan = {};
    if (this.look()) return;
    this.host.apply(startRefit(this.host.world(), layout, this.gridTruck ?? undefined));
  }

  private sideList(w: World): HTMLElement[] {
    return this.loot ? [this.lootEl(w, this.loot)] : this.storeList(w);
  }

  private storeList(w: World): HTMLElement[] {
    if (this.instant || !atGarage(w, this.gridTruck ?? undefined)) return [];
    const shopId = this.storeShop(w);
    return shopId ? [this.storageEl(w), this.cratesEl(w, shopId)] : [this.storageEl(w)];
  }

  private storeShop(w: World): string | null {
    return !this.instant && truckFor(w, this.gridTruck ?? undefined).id === w.player.vehicleId ? shopAt(w) : null;
  }

  private cardHead(w: World, item: GridItem): HTMLElement {
    return el("div", { class: "card-head" }, createItemIcon(itemLookId(item)), el("div", { class: "card-name" }, el("b", {}, this.itemTitle(w, item)), item.kind === "part" ? conditionTag(item.part) : null));
  }

  private showCard(w: World, me: Vehicle, item: GridItem, mounted: boolean, actions: HTMLElement[]): void {
    this.inspection.replaceChildren(el("div", { class: "well-group inv-details" }, this.cardHead(w, item), itemLoreEl(itemLookId(item)), ...itemFacts(w, me, item, mounted)));
    this.fillActions(actions, t("inv.dragToGrid"));
  }

  private showItem(w: World, item: GridItem, mounted: boolean): void {
    this.showCard(w, this.mine(w), item, mounted, itemActions(this.cardHost(w), item, mounted));
  }

  hintMounts(cells: readonly Cell[] | null): void {
    if (!this.gridEl) return;
    if (cells) this.gridEl.dataset.hint = cells.join(" ");
    else delete this.gridEl.dataset.hint;
  }

  private itemTitle(w: World, item: GridItem): Msg {
    return item.kind === "parcel" ? parcelTitle(w, item) : itemName(item);
  }

  private storageEl(w: World): HTMLElement {
    const chips = w.player.storage.map((p) => {
      const d = partDef(p.defId);
      const chip = el(
        "div",
        { class: "inv-chip", "data-hold": "", style: toneStyle(p.defId) },
        partIconEl(p),
        el("span", {}, partName(d.id)),
        conditionTag(p),
        footprintEl(d.w, d.h),
        conditionMeter(p),
      );
      const item = storageItem(p);
      this.markSelected(chip, item);
      chip.addEventListener("pointerdown", (e) =>
        this.startDrag(e, "storage", p.id, item, { x: 0, y: 0 }),
      );
      return chip;
    });
    return el(
      "div",
      { class: "inv-storage", "data-drop": "storage" },
      el("h3", {}, t("inv.storage")),
      ...(chips.length ? chips : [el("div", { class: "dim" }, t("inv.storageEmpty"))]),
    );
  }

  private cratesEl(w: World, shopId: string): HTMLElement {
    const stored = storedHere(w);
    const chips = Object.entries(stored).map(([good, count]) => this.storedCrateChip(w, shopId, good, count));
    return el(
      "div",
      { class: "inv-storage inv-crates", "data-drop": "storage" },
      el("h3", {}, t("inv.storedCrates"), el("span", { class: "inv-fill", title: t("inv.storedRule") }, t("inv.storedFill", { n: storeTotal(w, shopId), cap: GOODS_STORE.crates }))),
      ...(chips.length ? chips : [el("div", { class: "dim" }, t("inv.storageEmptyCrates"))]),
    );
  }

  private storedCrateChip(w: World, shopId: string, good: string, count: number): HTMLElement {
    const item = storedGoodItem(good);
    const chip = el(
      "div",
      { class: "inv-chip stored", "data-hold": "", style: toneStyle(good) },
      itemIconEl(item),
      el("span", { class: "stored-name" }, t("inv.goodCount", { good: goodName(good), n: count })),
      shopTrades(shopId, good) ? this.storedSellCell(w, shopId, good, count) : this.untradedSellCell(w, good, count),
    );
    this.markSelected(chip, item);
    chip.addEventListener("pointerdown", (e) => this.startDrag(e, "storage", good, item, { x: 0, y: 0 }));
    return chip;
  }

  private storedSellCell(w: World, shopId: string, good: string, count: number): HTMLElement {
    const look = this.look();
    const allTotal = getLotTradePrice(w, playerVehicle(w), shopId, good, count, "sell");
    return el(
      "div",
      { class: "trade sell", onpointerdown: (e: Event) => e.stopPropagation() },
      rowButton([lotLabel(t("trade.minus", { n: 1 }), sellPrice(w, shopId, good))], () => this.run((x) => sellStoredGood(x, good, 1)), look, `${good}:storedSell1`),
      rowButton([lotLabel(t("trade.all"), allTotal)], () => this.run((x) => sellStoredGood(x, good, count)), look, `${good}:storedSellAll`),
    );
  }

  private untradedSellCell(w: World, good: string, count: number): HTMLElement {
    const reason = this.look() ?? refusalText(w, { id: "notTraded" });
    return el(
      "div",
      { class: "trade sell", onpointerdown: (e: Event) => e.stopPropagation() },
      rowButton([lotLabel(t("trade.minus", { n: 1 }), null)], () => this.run((x) => sellStoredGood(x, good, 1)), reason, `${good}:storedSell1`),
      rowButton([lotLabel(t("trade.all"), null)], () => this.run((x) => sellStoredGood(x, good, count)), reason, `${good}:storedSellAll`),
    );
  }

  private lootPartChips(w: World, stock: SalvageStock): HTMLElement[] {
    const chips: HTMLElement[] = [];
    const claim = claimOn(w, stock);
    const claimed = claimedPartIn(w, stock);
    const parts = visibleParts(w, playerVehicle(w), stock);
    const taken = takenMarks(w, parts);
    for (const p of parts) {
      const d = partDef(p.defId);
      const chip = el(
        "div",
        { class: "inv-chip", "data-hold": "", style: toneStyle(p.defId) },
        partIconEl(p),
        el("span", {}, partName(d.id)),
        claim && p.id === claimed ? claimMark(claim.shop) : null,
        conditionTag(p),
        footprintEl(d.w, d.h),
        conditionMeter(p),
      );
      const item = lootPartItem(p);
      markTaken(w, chip, taken.get(p.id));
      this.markSelected(chip, item);
      chip.addEventListener("pointerdown", (e) =>
        this.startDrag(e, "loot", p.id, item, { x: 0, y: 0 }),
      );
      chips.push(chip);
    }
    return chips;
  }

  private lootGoodChips(stock: SalvageStock): HTMLElement[] {
    const chips: HTMLElement[] = [];
    for (const [good, count] of Object.entries(stock.goods)) {
      if (count <= 0) continue;
      const item = lootGoodItem(good);
      const chip = el(
        "div",
        { class: "inv-chip", "data-hold": "", style: toneStyle(good) },
        itemIconEl(item),
        t("inv.goodCount", { good: goodName(good), n: count }),
      );
      this.markSelected(chip, item);
      chip.addEventListener("pointerdown", (e) =>
        this.startDrag(e, "loot", good, item, { x: 0, y: 0 }),
      );
      chips.push(chip);
    }
    return chips;
  }

  private lootStoresButton(stock: SalvageStock): HTMLElement[] {
    if (!hasStores(stock)) return [];
    return [
      el(
        "button",
        { ...disabledWith(this.look(), () => this.run((world) => takeStores(world, stock.id))) },
        t("inv.takeStores", { fuel: fuelLiters(stock.fuel ?? 0), supplies: stock.supplies ?? 0 }),
      ),
    ];
  }

  private lootEl(w: World, stockId: string): HTMLElement {
    const stock = w.salvage.find((s) => s.id === stockId);
    if (!stock) throw new Error(`Unknown salvage ${stockId}`);
    const site = REGION.locations.find((l) => l.id === stockId);
    const loose = [...this.lootPartChips(w, stock), ...this.lootGoodChips(stock)];
    const stores = this.lootStoresButton(stock);
    const present = loose.length + stores.length > 0;
    this.lootKeys.replaceChildren(
      ...stores,
      ...(needsSearch(w, stock) ? [this.searchButton(w, stock)] : []),
      ...(present ? [el("button", { ...disabledWith(this.look(), () => this.run((world) => takeAllLoot(world, stockId))) }, t("inv.takeAll"))] : []),
    );
    return el(
      "div",
      { class: "inv-storage inv-loot" },
      el("h3", {}, site ? t("inv.salvageAt", { site: siteName(site.id) }) : t("inv.salvage")),
      ...(present ? loose : [el("div", { class: "dim" }, hiddenUnitsFor(w, playerVehicle(w), stock) > 0 ? t("inv.nothingFound") : t("inv.nothingLeft"))]),
    );
  }

  private searchButton(w: World, stock: SalvageStock): HTMLElement {
    const action = getSearchAction(w, stock);
    const blocked = !action.ready && action.combat === undefined;
    const reason = blocked ? (action.hint ?? refusalText(w, { id: "salvageOutOfReach" })) : null;
    return el("button", { class: "inv-search", ...disabledWith(this.look() ?? reason, () => this.host.searchStock(stock.id)) }, t("inv.searchMore"));
  }

  private targetScreen(w: World, truckId: string): HTMLElement {
    const target = w.vehicles.find((v) => v.id === truckId);
    if (!target || !(this.looking ? knowsCargo(w, playerVehicle(w), target) : isKnockedOut(target))) return el("div", { class: "inv-target" }, el("div", { class: "well inv-target-screen" }, el("div", { class: "dim" }, t("inv.truckGone"))));
    const grid = gridEl(gridOf(target), target.chassisId, this.scale.measure(target, false), this.looks.other, null);
    const removing = this.looking ? null : removalMarks(w, target);
    grid.append(...deepestFirst(target.chassisId, target.items).map((it) => this.targetItem(w, target, it, grid, removing)));
    const state = downedStateText(target);
    const shell = el("div", { class: "truck-shell" }, grid);
    shell.style.padding = reachPadding(this.reach, this.scale.measure(target, false));
    return el(
      "div",
      { class: "inv-target" },
      el("h3", { class: "tape screen-tape" }, vehicleTitle(w, target)),
      el("div", { class: "well inv-target-screen" }, ...(state ? [el("div", { class: "inv-target-state" }, state)] : []), shell),
    );
  }

  private targetItem(w: World, target: Vehicle, it: GridItem, grid: HTMLElement, removing: ReturnType<typeof removalMarks> | null): HTMLElement {
    const node = this.truckItemEl(target, it, grid);
    return removing ? markTaken(w, node, removing.get(it.id)) : node;
  }

  private truckItemEl(target: Vehicle, it: GridItem, grid: HTMLElement): HTMLElement {
    const mounted = it.kind === "part" && isMounted(target.chassisId, it);
    const node = itemBox(it, target.chassisId, mounted, this.scale.other, this.looks.other);
    this.markSelected(node, it);
    const select = () => this.clickItem(this.clicked("truck", it.id, it));
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter") select();
    });
    if (it.kind === "part" && partDef(it.part.defId).kind === "core") {
      node.addEventListener("click", (e) => {
        if (!fromButton(e)) select();
      });
      return node;
    }
    node.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const at = cellUnder(this.scale.other, grid, e.clientX, e.clientY);
      this.startDrag(e, "truck", it.id, it, { x: at.x - it.x, y: at.y - it.y });
    });
    return node;
  }

  private showTruckItem(w: World, item: GridItem): void {
    const rotates = touchMode();
    this.showCard(w, playerVehicle(w), item, false, rotates ? actionRow(rotateButton(() => this.rotateHeld(), this.look()), []) : []);
  }

  private startDrag(
    e: PointerEvent,
    source: Drag["source"],
    id: string,
    item: GridItem,
    grab: { x: number; y: number },
  ): void {
    if (e.button !== 0 || this.selectWhileLooking(source, id, item)) return;
    if (this.look()) return;
    if (dragStartOf(e.pointerType, false) === "hold") return this.startPress(e, source, id, item, grab);
    e.preventDefault();
    e.stopPropagation();
    this.beginDrag(e, source, id, item, grab);
  }

  private selectWhileLooking(source: ItemSource, id: string, item: GridItem): boolean {
    if (!this.looking) return false;
    this.clickItem(this.clicked(source, id, item));
    return true;
  }

  private startPress(e: PointerEvent, source: ItemSource, id: string, item: GridItem, grab: Press["grab"]): void {
    if (this.selectWhileLooking(source, id, item) || this.look()) return;
    e.preventDefault();
    e.stopPropagation();
    this.endPress();
    const target = e.currentTarget as HTMLElement;
    target.classList.add("holding");
    const timer = window.setTimeout(() => {
      this.press = null;
      this.beginDrag(this.lastPointer ?? e, source, id, item, grab);
      this.drag?.ghost.classList.add("held");
      if (e.pointerType === "touch") this.holdTouch(target, e.pointerId);
    }, HOLD_TO_DRAG_MS);
    this.press = { timer, source, id, item, grab };
    this.holdId = e.pointerId;
    this.lastPointer = e;
  }

  private holdTouch(target: HTMLElement, pointerId: number): void {
    if (target.isConnected) target.setPointerCapture(pointerId);
    this.stopScroll = (ev) => ev.preventDefault();
    window.addEventListener("touchmove", this.stopScroll, { passive: false });
  }

  private endHold(): void {
    if (this.stopScroll) window.removeEventListener("touchmove", this.stopScroll);
    this.stopScroll = null;
    this.holdId = null;
  }

  private ownsPointer(e: PointerEvent): boolean {
    return this.holdId === null || (this.drag === null && this.press === null) || e.pointerId === this.holdId;
  }

  private endPress(): Press | null {
    const press = this.press;
    if (press) window.clearTimeout(press.timer);
    this.press = null;
    return press;
  }

  private beginDrag(at: PointerEvent, source: Drag["source"], id: string, item: GridItem, grab: { x: number; y: number }): void {
    const ghost = el("div", { class: "inv-ghost" });
    uiRoot().append(ghost);
    this.drag = {
      source,
      id,
      item: { ...item },
      grab,
      ghost,
      start: { x: at.clientX, y: at.clientY },
      moved: false,
    };
    this.holdId = at.pointerId;
    this.error = null;
    this.showDragged(source, item);
    this.onMove(at);
  }

  private showDragged(source: ItemSource, item: GridItem): void {
    if (source !== "grid") return;
    const w = this.host.world();
    const shown = this.shown(w);
    this.showItem(w, item, item.kind === "part" && isMounted(shown.chassisId, item));
  }

  private markSelected(node: HTMLElement, item: GridItem): void {
    node.classList.toggle("selected", this.selectedItem === item.id);
  }

  rotateHeld(): void {
    if (this.drag) return this.rotate();
    if (this.preview) return this.rotatePreview();
    const off = this.offGridSelection();
    if (off) return this.previewOffGrid(off.source, off.item);
    this.rotateSelected();
  }

  private offGridSelection(): { source: ItemSource; item: GridItem } | null {
    return this.otherSources(this.host.world()).find((entry) => entry.item.id === this.selectedItem) ?? null;
  }

  private previewOffGrid(source: ItemSource, item: GridItem): void {
    const w = this.host.world();
    const spot = source === "storage" && item.kind === "part" ? installSpot(this.mine(w), item) : stowSpot(pickupTruck(plannedTruck(w, playerVehicle(w)), this.plan), item);
    const at = spot ?? { x: 0, y: 0, rot: item.rot };
    this.setPreview(source, { ...item, x: at.x, y: at.y, rot: at.rot });
    this.rotatePreview();
  }

  private setPreview(source: ItemSource, item: GridItem): void {
    this.preview = { source, id: sourceIdOf(source, item), item, grab: { x: 0, y: 0 }, ghost: el("div"), start: { x: 0, y: 0 }, moved: true };
    this.error = null;
    this.onChange();
  }

  private rotatePreview(): void {
    if (!this.preview) throw new Error("No placement preview to turn");
    this.setPreview(this.preview.source, { ...this.preview.item, rot: nextTurn(this.preview.item) });
  }

  private beginGridTap(e: PointerEvent): boolean {
    if (e.pointerType !== "touch" || this.selectedItem === null || this.look() || !this.gridEl?.contains(e.target as Node)) return false;
    this.tap = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    return true;
  }

  private finishGridTap(e: PointerEvent, tap: Tap): void {
    if (uiSize().toLayer(Math.hypot(e.clientX - tap.x, e.clientY - tap.y)) >= this.scale.slop()) return;
    const w = this.host.world();
    const selection = this.selection(w);
    if (!selection || !this.gridEl) return this.select(null);
    const cell = cellUnder(this.scale.mine, this.gridEl, e.clientX, e.clientY);
    const current = this.preview?.item ?? selection.item;
    const action = touchGridTap(this.preview ? { x: this.preview.item.x, y: this.preview.item.y } : null, cell, footprint(current));
    if (action.kind === "place") return this.placeSelected();
    this.setPreview(this.preview?.source ?? (selection.own ? "grid" : this.offGridSelection()!.source), { ...current, x: action.at.x, y: action.at.y });
  }

  private placeSelected(): void {
    const d = this.preview;
    if (!d || !this.gridEl) throw new Error("No placement preview to place");
    this.preview = null;
    this.run((w) => this.dropOnGrid(w, d), true);
    if (this.error) {
      this.preview = d;
      this.onChange();
    }
  }

  private drawPreview(grid: HTMLElement, me: Vehicle): void {
    const d = this.preview;
    if (!d) return;
    if (d.item.id !== this.selectedItem) {
      this.preview = null;
      return;
    }
    const m = this.scale.mine;
    const size = footprint(d.item);
    const box = rectOf(m, d.item.x, d.item.y, size.w, size.h);
    fillGhost(d.ghost, this.looks.own, d.item, m, box, this.ghostTone(d, true), null);
    d.ghost.style.cssText = pxStyle(box);
    clearFan(grid);
    this.drawFan(grid, me, d.item);
    grid.append(d.ghost);
  }

  private rotate(): void {
    if (!this.drag) return;
    this.drag.moved = true;
    this.drag.item = { ...this.drag.item, rot: nextTurn(this.drag.item) };
    this.drag.grab = { x: 0, y: 0 };
    if (this.lastPointer) this.onMove(this.lastPointer);
  }

  private rotateSelected(byKey = false): void {
    if (this.look() || !this.gridEl?.isConnected || this.selectedItem === null) return;
    const item = this.shown(this.host.world()).items.find((it) => it.id === this.selectedItem);
    if (!item || item.kind !== "part") return;
    if (byKey) keyPress(this.root.querySelector<HTMLElement>('[data-action="rotate"]'));
    const id = item.id;
    let turned = item;
    const turns = turnsToTry(item);
    for (const [i, rot] of turns.entries()) {
      const to = { x: item.x, y: item.y, rot };
      const last = i === turns.length - 1;
      let fits = true;
      this.run((w) => {
        try {
          return this.moveGridItem(w, id, to);
        } catch (err) {
          fits = false;
          if (last) throw err;
          return w;
        }
      }, !last);
      if (fits) return;
    }
  }

  private onMove(e: PointerEvent): void {
    if (!this.ownsPointer(e)) return;
    this.lastPointer = e;
    if (!this.drag) return;
    if (
      uiSize().toLayer(Math.hypot(
        e.clientX - this.drag.start.x,
        e.clientY - this.drag.start.y,
      )) >=
      this.scale.slop()
    )
      this.drag.moved = true;
    const spot = this.spotAt(e.clientX, e.clientY);
    if (spot) this.drag.item = { ...this.drag.item, x: spot.x, y: spot.y };
    this.paintGhost(e, spot !== null);
  }

  private paintGhost(e: PointerEvent, onGrid: boolean): void {
    const d = this.drag!;
    const m = this.scale.mine;
    const size = footprint(d.item);
    const box = rectOf(m, d.item.x, d.item.y, size.w, size.h);
    fillGhost(d.ghost, this.looks.own, d.item, m, box, this.ghostTone(d, onGrid), this.gridEl);
    this.ghostFan(d, onGrid);
    d.ghost.style.width = `${box.width}px`;
    d.ghost.style.height = `${box.height}px`;
    const at = this.ghostCorner(e, box, onGrid);
    d.ghost.style.left = `${at.x}px`;
    d.ghost.style.top = `${at.y}px`;
  }

  private ghostTone(d: Drag, onGrid: boolean): string {
    if (!onGrid) return "";
    return this.placementProblem(d) === null ? "ok" : "no";
  }

  private ghostFan(d: Drag, onGrid: boolean): void {
    if (!this.gridEl) return;
    clearFan(this.gridEl);
    if (onGrid) this.drawFan(this.gridEl, this.shown(this.host.world()), d.item);
  }

  private ghostCorner(e: PointerEvent, box: PixelRect, onGrid: boolean): { x: number; y: number } {
    const g = this.gridEl ? uiSize().layerRect(this.gridEl) : null;
    if (onGrid && g) return { x: g.left + box.left, y: g.top + box.top };
    const at = uiSize().layerPoint(e.clientX, e.clientY);
    return { x: at.x - this.scale.mine.cellW / 2, y: at.y - this.scale.mine.cellH / 2 };
  }


  private placementProblem(d: Drag): Refusal | null {
    if (d.source === "grid")
      return planItemMove(this.shown(this.host.world()), d.id, { x: d.item.x, y: d.item.y, rot: d.item.rot }).error;
    return pickupProblem(plannedTruck(this.host.world(), this.mine(this.host.world())), this.plan, d.item);
  }

  private spotAt(cx: number, cy: number): Spot | null {
    if (!this.gridEl || !this.drag) return null;
    const r = this.gridEl.getBoundingClientRect();
    if (cx < r.left || cy < r.top || cx >= r.right || cy >= r.bottom)
      return null;
    const at = cellUnder(this.scale.mine, this.gridEl, cx, cy);
    return { x: at.x - this.drag.grab.x, y: at.y - this.drag.grab.y, rot: this.drag.item.rot };
  }

  private onCancel(e: PointerEvent): void {
    if (this.tap?.pointerId === e.pointerId) this.tap = null;
    if (!this.ownsPointer(e)) return;
    this.endPress();
    const d = this.drag;
    this.endHold();
    if (!d) return;
    this.drag = null;
    d.ghost.remove();
    this.onChange();
  }

  private onDrop(e: PointerEvent): void {
    const tap = this.tap;
    if (tap?.pointerId === e.pointerId) {
      this.tap = null;
      return this.finishGridTap(e, tap);
    }
    if (!this.ownsPointer(e)) return;
    const press = this.endPress();
    if (press) {
      this.endHold();
      return this.clickItem(this.clicked(press.source, press.id, press.item));
    }
    const d = this.drag;
    this.endHold();
    if (!d) return;
    this.drag = null;
    d.ghost.remove();
    const shown = this.shown(this.host.world());
    this.showFan(shown, this.selectedGun(shown));
    if (this.finishSelection(d)) return;
    this.run(this.dropCommand(e, d), true);
  }

  private dropCommand(e: PointerEvent, d: Drag): (w: World) => World {
    if (this.gridEl !== null && this.inside(e)) return (w) => this.dropOnGrid(w, d);
    const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest("[data-drop]")?.getAttribute("data-drop");
    return d.source === "grid" ? offGridCommand(target, d.id, this.gridTruck ?? undefined) : (w) => w;
  }

  private dropOnGrid(w: World, d: Drag): World {
    const to = { x: d.item.x, y: d.item.y, rot: d.item.rot };
    if (d.source === "grid") return this.moveGridItem(w, d.id, to);
    if (d.source === "storage") return takeFromStore(w, d.item, d.id, to, this.gridTruck ?? undefined);
    const from = d.source === "truck" ? this.truck! : this.loot!;
    this.requirePickupFits(d);
    return takeDropped(withPlanQueued(w, this.plan, this.gridTruck ?? undefined), { source: d.source, from, id: d.id, item: d.item }, to);
  }

  private requirePickupFits(d: Drag): void {
    const cause = d.source === "truck" || d.source === "loot" ? pickupProblem(plannedTruck(this.host.world(), this.mine(this.host.world())), this.plan, d.item) : null;
    if (cause) throw new Refused({ id: "badLayout", cause });
  }

  private finishSelection(drag: Drag): boolean {
    if (drag.moved) return false;
    const item = drag.source === "grid" ? this.shown(this.host.world()).items.find((entry) => entry.id === drag.id) : drag.item;
    if (item) this.clickItem(this.clicked(drag.source, drag.id, item));
    return true;
  }

  private inside(e: PointerEvent): boolean {
    const r = this.gridEl!.getBoundingClientRect();
    return (
      e.clientX >= r.left &&
      e.clientY >= r.top &&
      e.clientX < r.right &&
      e.clientY < r.bottom
    );
  }

  private moveGridItem(w: World, itemId: string, to: Spot): World {
    if (this.instant) return instantMoveItem(w, itemId, to);
    if (atGarage(w, this.gridTruck ?? undefined)) return moveItem(w, itemId, to, this.gridTruck ?? undefined);
    if (fieldMoveIsInstant(plannedTruck(w, this.mine(w)), this.plan, itemId, to)) {
      this.host.apply(moveItem(w, itemId, to, this.gridTruck ?? undefined));
      return w;
    }
    this.planMove(w, itemId, to);
    return w;
  }

  private planMove(w: World, itemId: string, to: Spot): void {
    if (this.look()) return;
    const next = planAfterMove(plannedTruck(w, this.mine(w)), this.plan, itemId, to);
    if (Object.keys(next).length > 0) startRefit(w, next, this.gridTruck ?? undefined);
    this.plan = next;
  }

  private look(): Msg | null {
    return lookOrTurnReason(this.host.world(), this.host.getTurnPhase() !== null, this.looking);
  }

  private run(cmd: (w: World) => World, quiet = false): void {
    if (this.look()) throw new Error("Inventory command in look mode");
    try {
      const failed = runCommand(this.host.world(), cmd, (next, w) => {
        if (next === w) return;
        this.plan = {};
        this.host.apply(next);
      });
      this.error = failed === null || (quiet && !(failed instanceof Refused)) ? null : commandFailure(this.host.world(), failed);
    } finally {
      this.onChange();
    }
  }
}

function sourceIdOf(source: ItemSource, item: GridItem): string {
  if (source === "grid" || source === "truck") return item.id;
  return item.kind === "part" ? item.part.id : item.kind === "good" ? item.good : item.id;
}

function offGridCommand(target: string | null | undefined, itemId: string, truckId?: string): (w: World) => World {
  if (target === "storage") return (w) => storeItem(w, itemId, truckId);
  return target === "dump" ? (w) => dumpItem(w, itemId, truckId) : (w) => w;
}

export class InventoryScreen {
  readonly root = panel("modal dialog");
  readonly view: InventoryView;

  constructor(private host: UiHost) {
    this.root.classList.add("inventory-screen");
    this.root.style.display = "none";
    window.addEventListener("resize", () => this.render());
    this.view = new InventoryView(host, () => this.render(), true);
  }

  isOpen(): boolean {
    return this.root.style.display !== "none";
  }

  toggle(): void {
    if (this.isOpen()) return this.close();
    this.view.setLoot(null);
    this.root.style.display = "";
    this.render();
  }

  openLoot(stockId: string): void {
    this.view.setLoot(stockId);
    this.root.style.display = "";
    this.render();
  }

  openDowned(world: World, vehicleId: string): boolean {
    const downed = world.vehicles.find((v) => v.id === vehicleId);
    if (!downed || !canLootTruck(world, playerVehicle(world), downed)) return false;
    this.view.setTruck(downed.id, "downed");
    this.root.style.display = "";
    this.render();
    return true;
  }

  openLookedOver(world: World, vehicleId: string): boolean {
    const target = world.vehicles.find((v) => v.id === vehicleId);
    if (!target || !knowsCargo(world, playerVehicle(world), target)) return false;
    this.view.setTruck(target.id, "look");
    this.root.style.display = "";
    this.render();
    return true;
  }

  close(): void {
    this.view.clearSelection();
    this.root.style.display = "none";
    this.root.replaceChildren();
    this.view.commitPlan();
  }

  render(): void {
    if (!this.isOpen()) return;
    this.renderBench();
  }

  private closeButton(): HTMLElement {
    return el("button", { class: "close", title: keyTip(t("inv.close"), "I"), onclick: () => this.close() }, t("inv.close"));
  }

  private renderBench(): void {
    this.view.setHead({ title: el("h3", { class: "inv-title" }, t("inv.title")), close: this.closeButton() });
    this.root.replaceChildren(this.view.render());
    this.view.fitTo(this.root);
  }
}

function fromButton(e: Event): boolean {
  return (e.target as Element).closest("button") !== null;
}

function claimMark(shop: string): HTMLElement {
  const mark = createIcon("parts");
  mark.classList.add("claim-mark");
  bindAttr(mark, "title", t("loot.claimed", { shop: siteName(shop) }));
  return mark;
}
