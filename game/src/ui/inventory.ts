
import { chassisDef } from "../data/chassis";
import { isShield, partDef } from "../data/parts";
import { STRIP } from "../data/salvage";
import { isJunk, maxHp } from "../sim/wear";
import { playerVehicle, truckFor } from "../sim/damage";
import { instantMoveItem } from "../sim/cheats";
import { canRebuild, partRepairCost, repairPart } from "../sim/economy";
import { reachedOutpostAt } from "../sim/chaos-highway";
import { outpostRepairPart } from "../sim/outposts";
import {
  freeCells,
  gridOf,
  isMounted,
  type Cell,
  type Spot,
} from "../sim/grid";
import {
  dumpItem,
  installSpot,
  fieldMoveIsInstant,
  moveItem,
  planItemMove,
  plannedRefitTurns,
  plannedTruck,
  refitTurnsLeft,
  plannedVehicle,
  startRefit,
  stowSpot,
  storePart,
  takeFromStorage,
  type RefitLayout,
} from "../sim/inventory";
import { cancelRefit, startRepair, startStrip, startWeld, stripYield } from "../sim/jobs";
import { vehicleHasPerk } from "../sim/progress";
import { PERK_NUMBERS } from "../data/skills";
import { repairPlan } from "../sim/repair";
import { shopAt } from "../sim/market";
import { atGarage } from "../sim/garage";
import { needsSearch, takeAllLoot, takeStores } from "../sim/locations";
import { canLootTruck, claimedPartIn, claimOn, hasStores, hiddenUnits } from "../sim/salvage";
import { gaveUp, isKnockedOut } from "../sim/defeat";
import { REGION } from "../data/region";
import type {
  GridItem,
  PartInstance,
  SalvageStock,
  Vehicle,
  World,
} from "../sim/types";
import { keyLabel, phoneMode, touchMode } from "./input-mode";
import { disabledWith, el, panel, uiRoot } from "./dom";
import { lookReason } from "./unstuck-reason";
import { uiSize } from "./ui-size";
import type { UiHost } from "./host";
import { itemLookId } from "../render/partLooks";
import { baselinePart, conditionMeter, conditionRow, conditionTag, createIcon, createItemIcon, diffStats, footprint as footprintEl, itemIconEl, itemLore, partIconEl, partStats, statGrid, toneStyle } from "./cards";
import { loadMass } from "../sim/mass";
import {
  blockerIds,
  clearFan,
  fanSvg,
  nextRot,
  weaponDefOf,
  gridEl,
  itemBox,
  itemName,
  itemState,
  lootGoodItem,
  lootPartItem,
  markWorking,
  markTaken,
  refitMarks,
  removalMarks,
  takenMarks,
  workMarkOf,
  storageItem,
  footprint,
  cellUnder,
  GridScale,
  pxStyle,
  rectOf,
  type PixelRect,
} from "./inventory-draw";
import { fillGhost, garageLooks, type GarageLooks } from "./garage-draw";
import { fuelLiters, kg, moneyEl, moneyMsg, pricedEl } from "./units";
import { maxSpeedSteps } from "../sim/stats";
import { getSearchAction, powerChip } from "./hud-readout";
import {
  canFieldPatch,
  patchBlocker,
  stripBlocker,
  weldBlocker,
  doubleClickCommand,
  dragStartOf,
  planAfterMove,
  withPlanQueued,
  takeDropped,
  pickupProblem,
  pickupTruck,
  HOLD_TO_DRAG_MS,
  isDoubleClick,
  needsHold,
  selectionAfterClick,
  touchGridTap,
  type ClickedItem,
  type ItemSource,
  type LastClick,
  isRotateKey,
} from "./inventory-moves";
import type { Refusal } from "../sim/types";
import { bindAttr, setText, unbindAttr } from "../text/language";
import { t, verbatim, type Msg } from "../text/msg";
import { chassisAbilityLine, chassisAbilityName, chassisName, goodName, partName, refusalText, siteName, vehicleTitle } from "../text/names";
import { Refused } from "../sim/world";
import { commandFailure, parcelTitle } from "./format";


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

export class InventoryView {
  private drag: Drag | null = null;
  private press: Press | null = null;
  private preview: Drag | null = null;
  private tap: Tap | null = null;
  private lastClick: LastClick = null;
  private lastPointer: PointerEvent | null = null;
  private holdId: number | null = null;
  private stopScroll: ((e: TouchEvent) => void) | null = null;
  holdChanged: () => void = () => {};
  private error: Msg | null = null;
  private gridEl: HTMLElement | null = null;
  private root: HTMLElement = el("div");
  private inspection = el("div", { class: "inv-inspection" });
  private selectedItem: string | null = null;
  private loot: string | null = null;
  private truck: string | null = null;
  private gridTruck: string | null = null;
  private scale = new GridScale();
  private looks: GarageLooks = { own: null, other: null };
  private plan: RefitLayout = {};

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
      else this.rotateSelected();
    });
    window.addEventListener("contextmenu", (e) => {
      if (!this.drag) return;
      e.preventDefault();
      this.rotate();
    });
  }

  fitTo(box: HTMLElement): void {
    this.scale.reset();
    this.render();
    const trucks = [...this.root.querySelectorAll(".inv-truck")];
    if (trucks.length === 0) throw new Error("Inventory view is not rendered");
    const over = uiSize().toLayer(Math.max(...trucks.map((t) => t.getBoundingClientRect().bottom)) - box.getBoundingClientRect().bottom);
    if (over <= 0) return;
    this.scale.shrinkBy(over);
    this.render();
  }

  setLoot(stockId: string | null): void {
    this.loot = stockId;
    this.truck = null;
  }

  setTruck(vehicleId: string | null): void {
    this.truck = vehicleId;
    this.loot = null;
  }

  render(): HTMLElement {
    const w = this.host.world();
    const me = this.shown(w);
    const g = gridOf(me);
    this.showSelection(w);
    this.looks = garageLooks(this.host.garageRenders?.() ?? null, w, me, this.otherItems(w), this.truck);
    const grid = gridEl(g, me.chassisId, this.scale.measure(me, true), this.looks.own);
    grid.append(...this.gridItems(w, me));
    this.gridEl = grid;
    this.showFan(me, this.selectedGun(me));
    this.drawPreview(grid, me);
    this.root.replaceChildren(
      el(
        "div",
        { class: "inv-wrap" },
        el(
          "div",
          { class: "inv-truck" },
          el("div", { class: "truck-shell" }, grid),
        ),
        el(
          "div",
          { class: "inv-side" },
          ...this.refitBanner(w),
          this.sideList(w),
          ...(this.dumpZone ? [el("div", { class: "inv-dump", "data-drop": "dump" }, t("inv.dumpShort"))] : []),
          this.inspection,
        ),
        ...(this.truck ? [this.truckEl(w, this.truck)] : []),
      ),
      this.error ? el("div", { class: "bad" }, this.error) : el("div"),
    );
    return this.root;
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
      if (!fromButton(e) && (core || e.detail === 0)) click();
    });
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter") click();
    });
    this.hoverFan(node, me, it, mounted);
    if (!core)
      node.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        if (!this.gridEl) throw new Error("Grid item pressed without a grid");
        const at = cellUnder(this.scale.mine, this.gridEl, e.clientX, e.clientY);
        const grab = { x: at.x - it.x, y: at.y - it.y };
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
    return [...v.items].sort((a, b) => Number(marks.has(a.id)) - Number(marks.has(b.id))).map(node);
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
    grid.append(fanSvg(me, it, this.scale.mine));
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
      ...(stock ? [...stock.parts.map(lootPartItem), ...Object.keys(stock.goods).map(lootGoodItem)] : []).map((item) => ({ source: "loot" as const, item })),
      ...(target ? target.items : []).map((item) => ({ source: "truck" as const, item })),
    ];
  }

  private showSelection(w: World): void {
    const selection = this.selection(w);
    if (!selection) {
      this.selectedItem = null;
      this.inspection.replaceChildren();
    } else if (selection.own) this.showItem(w, selection.item, selection.mounted);
    else this.showTruckItem(w, selection.item, false);
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
    this.selectedItem = double ? c.item.id : selectionAfterClick(this.selectedItem, c.item.id);
    this.onChange();
  }

  private clicked(source: ItemSource, id: string, item: GridItem): ClickedItem {
    return { source, id, item, stockId: this.loot, truckId: this.truck, own: this.gridTruck ?? undefined };
  }

  showTruck(id: string | null): void {
    if (this.gridTruck === id) return;
    this.gridTruck = id;
    this.plan = {};
    this.selectedItem = null;
    this.preview = null;
  }

  private mine(w: World): Vehicle {
    return truckFor(w, this.gridTruck ?? undefined);
  }

  private refitBanner(w: World): HTMLElement[] {
    const me = this.mine(w);
    const running = me.job?.kind === "refit" ? [this.bannerEl(t("inv.refitLeft", { n: refitTurnsLeft(w, me) }), t("inv.cancelRefit"), disabledWith(this.look(), () => this.run(cancelRefit)), t("inv.cancelRefitTitle"))] : [];
    if (Object.keys(this.plan).length === 0) return running;
    return [
      ...running,
      el(
        "div",
        { class: "inv-refit" },
        el("button", { class: "btn-s", ...disabledWith(this.look(), () => this.run((world) => startRefit(world, this.plan, this.gridTruck ?? undefined))) }, t("inv.refitPlanned", { n: plannedRefitTurns(w, me, this.plan) })),
        el("button", { class: "btn-s", onclick: () => this.cancelPlan() }, t("inv.cancelPlan")),
      ),
    ];
  }

  private bannerEl(text: Msg, label: Msg, action: ReturnType<typeof disabledWith>, title?: Msg): HTMLElement {
    return el("div", { class: "inv-refit" }, el("span", {}, text), el("button", { title, ...action }, label));
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

  private sideList(w: World): HTMLElement | null {
    if (this.loot) return this.lootEl(w, this.loot);
    return !this.instant && atGarage(w, this.gridTruck ?? undefined) ? this.storageEl(w) : null;
  }

  private loreParagraph(item: GridItem): HTMLElement {
    return el("p", { class: "dim" }, itemLore(itemLookId(item)));
  }

  private showItem(w: World, item: GridItem, mounted: boolean): void {
    this.inspection.replaceChildren(
      el("div", { class: "card-head" }, createItemIcon(itemLookId(item)), el("div", { class: "card-name" }, el("b", {}, this.itemTitle(w, item)), el("span", { class: "dim" }, itemState(item, mounted)))),
      el("div", { class: "inv-actions" }, ...this.itemActions(w, item, mounted)),
      ...(item.kind === "part" ? partDetails(w, this.mine(w), item.part, mounted) : []),
      this.loreParagraph(item),
    );
    if (!phoneMode()) this.inspection.lastElementChild?.scrollIntoView({ block: "nearest" });
  }

  hintMounts(cells: readonly Cell[] | null): void {
    if (!this.gridEl) return;
    if (cells) this.gridEl.dataset.hint = cells.join(" ");
    else delete this.gridEl.dataset.hint;
  }

  private itemActions(w: World, item: GridItem, mounted: boolean): HTMLElement[] {
    if (item.kind !== "part") return this.cargoActions(w, item);
    if (!this.mine(w).items.some((it) => it.id === item.id)) return [];
    const buttons: (HTMLElement | null)[] = [
      canFieldPatch(this.mine(w), mounted, item.part.id) ? this.patchButton(w, this.mine(w), item.part) : null,
      shopAt(w) || this.atOutpost(w) ? this.repairButton(w, item.part) : null,
      !mounted && partDef(item.part.defId).kind !== "core"
        ? this.stripButton(w, this.mine(w), item.part)
        : null,
    ];
    return buttons.filter((b): b is HTMLElement => b !== null);
  }

  private patchButton(
    w: World,
    me: Vehicle,
    part: PartInstance,
  ): HTMLElement | null {
    if (isJunk(part)) return null;
    if (!fieldPatchable(part)) return shopOnlyPatch(part);
    const plan = repairPlan(w, me, part.id);
    if (plan.needed === 0) return null;
    const reason = patchBlocker(w, me, part);
    return el(
      "button",
      {
        class: "inv-patch",
        title: reason ? undefined : t("inv.patchYield", { parts: plan.parts, needed: plan.needed, hp: Math.round(plan.hp) }),
        onpointerdown: (e: Event) => e.stopPropagation(),
        ...disabledWith(this.look() ?? reason, () => this.run((world) => startRepair(world, part.id))),
      },
      t("inv.patchLabel", { turns: plan.turns, parts: plan.parts }),
    );
  }

  private atOutpost(w: World): boolean {
    return reachedOutpostAt(w, this.mine(w)) !== null;
  }

  private repairButton(w: World, part: PartInstance): HTMLElement | null {
    if (!isJunk(part)) return this.garageButton(w, part, "repair", t("inv.repairTitle", { hp: maxHp(part) }));
    return canRebuild(w, part) ? this.garageButton(w, part, "rebuild", t("inv.rebuildTitle")) : null;
  }

  private garageButton(w: World, part: PartInstance, action: "repair" | "rebuild", title: Msg): HTMLElement | null {
    const cost = partRepairCost(w, part);
    if (cost === 0) return null;
    const short = w.player.money < cost;
    return el(
      "button",
      {
        class: "inv-patch",
        title: short ? undefined : title,
        onpointerdown: (e: Event) => e.stopPropagation(),
        ...disabledWith(this.look() ?? (short ? t("trade.needMore", { price: moneyMsg(cost - w.player.money) }) : null), () =>
          this.run((world) => (this.atOutpost(world) ? outpostRepairPart(world, part.id, this.gridTruck ?? undefined) : repairPart(world, part.id))),
        ),
      },
      pricedEl(t(`inv.verb.${action}`), cost),
    );
  }

  private stripButton(
    w: World,
    me: Vehicle,
    part: PartInstance,
  ): HTMLElement {
    return el(
      "button",
      {
        class: "inv-patch",
        onpointerdown: (e: Event) => e.stopPropagation(),
        ...disabledWith(this.look() ?? stripBlocker(w, me), () => this.run((world) => startStrip(world, part.id))),
      },
      t("inv.stripLabel", { turns: STRIP.turns, parts: stripYield(me, part) }),
    );
  }

  private itemTitle(w: World, item: GridItem): Msg {
    return item.kind === "parcel" ? parcelTitle(w, item) : itemName(item);
  }

  private cargoActions(w: World, item: Exclude<GridItem, { kind: "part" }>): HTMLElement[] {
    const me = this.mine(w);
    return item.kind === "good" && item.good === "scrap" && vehicleHasPerk(w, me, "welder") ? [this.weldButton(w, me)] : [];
  }

  private weldButton(w: World, me: Vehicle): HTMLElement {
    const { scrap, turns } = PERK_NUMBERS.welder;
    const reason = weldBlocker(w, me);
    return el(
      "button",
      {
        class: "inv-patch",
        title: reason ? undefined : t("inv.weldSpends", { scrap }),
        onpointerdown: (e: Event) => e.stopPropagation(),
        ...disabledWith(this.look() ?? reason, () => this.run((world) => startWeld(world))),
      },
      t("inv.weldLabel", { part: partName(PERK_NUMBERS.welder.part), turns }),
    );
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
      ...chips,
    );
  }

  private lootPartChips(w: World, stock: SalvageStock): HTMLElement[] {
    const chips: HTMLElement[] = [];
    const claim = claimOn(w, stock);
    const claimed = claimedPartIn(w, stock);
    const taken = takenMarks(w, stock.parts);
    for (const p of stock.parts) {
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
    const chips = [
      ...this.lootPartChips(w, stock),
      ...this.lootGoodChips(stock),
      ...this.lootStoresButton(stock),
    ];
    return el(
      "div",
      { class: "inv-storage inv-loot" },
      el("h3", {}, site ? t("inv.salvageAt", { site: siteName(site.id) }) : t("inv.salvage")),
      ...(chips.length
        ? chips
        : [el("div", { class: "dim" }, hiddenUnits(stock) > 0 ? t("inv.nothingFound") : t("inv.nothingLeft"))]),
      ...(needsSearch(w, stock) ? [this.searchButton(w, stock)] : []),
      ...(chips.length
        ? [
            el(
              "button",
              {
                ...disabledWith(this.look(), () => this.run((world) => takeAllLoot(world, stockId))),
              },
              t("inv.takeAll"),
            ),
          ]
        : []),
    );
  }

  private searchButton(w: World, stock: SalvageStock): HTMLElement {
    const action = getSearchAction(w, stock);
    const blocked = !action.ready && action.combat === undefined;
    const reason = blocked ? (action.hint ?? refusalText(w, { id: "salvageOutOfReach" })) : null;
    return el("button", { class: "inv-search", ...disabledWith(this.look() ?? reason, () => this.host.searchStock(stock.id)) }, t("inv.searchMore"));
  }

  private truckEl(w: World, truckId: string): HTMLElement {
    const target = w.vehicles.find((v) => v.id === truckId);
    if (!target || !isKnockedOut(target))
      return el("div", { class: "inv-truck inv-target" }, el("h3", {}, t("inv.truckGone")));
    const grid = gridEl(gridOf(target), target.chassisId, this.scale.measure(target, false), this.looks.other);
    const removing = removalMarks(w, target);
    grid.append(...target.items.map((it) => markTaken(w, this.truckItemEl(target, it, grid), removing.get(it.id))));
    return el(
      "div",
      { class: "inv-truck inv-target" },
      el("h3", {}, gaveUp(target) ? t("inv.truckGaveUp", { truck: vehicleTitle(w, target) }) : t("inv.truckOut", { truck: vehicleTitle(w, target) })),
      el("div", { class: "truck-shell" }, grid),
    );
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

  private showTruckItem(w: World, item: GridItem, mounted: boolean): void {
    this.inspection.replaceChildren(
      el("div", { class: "card-head" }, createItemIcon(itemLookId(item)), el("div", { class: "card-name" }, el("b", {}, this.itemTitle(w, item)), el("span", { class: "dim" }, itemState(item, mounted)))),
      ...(item.kind === "part" ? partDetails(w, playerVehicle(w), item.part, false) : []),
      this.loreParagraph(item),
    );
    if (!phoneMode()) this.inspection.lastElementChild?.scrollIntoView({ block: "nearest" });
  }

  private startDrag(
    e: PointerEvent,
    source: Drag["source"],
    id: string,
    item: GridItem,
    grab: { x: number; y: number },
  ): void {
    if (e.button !== 0 || this.look()) return;
    if (dragStartOf(e.pointerType, false) === "hold") return this.startPress(e, source, id, item, grab);
    e.preventDefault();
    e.stopPropagation();
    this.beginDrag(e, source, id, item, grab);
  }

  private startPress(e: PointerEvent, source: ItemSource, id: string, item: GridItem, grab: Press["grab"]): void {
    if (this.look()) return;
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
    this.holdChanged();
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
    this.holdChanged();
    this.error = null;
    this.onMove(at);
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

  canRotate(): boolean {
    return this.drag !== null || this.preview !== null || this.selectedItem !== null;
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
    this.setPreview(this.preview.source, { ...this.preview.item, rot: nextRot(this.preview.item) });
  }

  private beginGridTap(e: PointerEvent): boolean {
    if (e.pointerType !== "touch" || this.selectedItem === null || !this.gridEl?.contains(e.target as Node)) return false;
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
    this.drag.item = { ...this.drag.item, rot: nextRot(this.drag.item) };
    this.drag.grab = { x: 0, y: 0 };
    if (this.lastPointer) this.onMove(this.lastPointer);
  }

  private rotateSelected(): void {
    if (this.look() || !this.gridEl?.isConnected || this.selectedItem === null) return;
    const item = this.shown(this.host.world()).items.find((it) => it.id === this.selectedItem);
    if (!item || item.kind !== "part") return;
    const id = item.id;
    let turned = item;
    for (let i = 0; i < 3; i++) {
      turned = { ...turned, rot: nextRot(turned) };
      const to = { x: item.x, y: item.y, rot: turned.rot };
      const last = i === 2;
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
    if (d.source === "storage") return takeFromStorage(w, d.id, to, this.gridTruck ?? undefined);
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
    return lookReason(this.host.world());
  }

  private run(cmd: (w: World) => World, quiet = false): void {
    if (this.look()) throw new Error("Inventory command in look mode");
    try {
      const w = this.host.world();
      const next = cmd(w);
      if (next !== w) {
        this.plan = {};
        this.host.apply(next);
      }
      this.error = null;
    } catch (err) {
      this.error = quiet && !(err instanceof Refused) ? null : commandFailure(this.host.world(), err);
    }
    this.onChange();
  }
}

function sourceIdOf(source: ItemSource, item: GridItem): string {
  if (source === "grid" || source === "truck") return item.id;
  return item.kind === "part" ? item.part.id : item.kind === "good" ? item.good : item.id;
}

function offGridCommand(target: string | null | undefined, itemId: string, truckId?: string): (w: World) => World {
  if (target === "storage") return (w) => storePart(w, itemId, truckId);
  return target === "dump" ? (w) => dumpItem(w, itemId, truckId) : (w) => w;
}

export class InventoryScreen {
  readonly root = panel("modal dialog");
  private view: InventoryView;

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
    this.view.setTruck(downed.id);
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

  private markRotate(button: HTMLElement): void {
    const look = lookReason(this.host.world());
    if (look) {
      button.setAttribute("aria-disabled", "true");
      bindAttr(button, "data-reason", look);
    } else if (this.view.canRotate()) {
      button.removeAttribute("aria-disabled");
      unbindAttr(button, "data-reason");
    } else {
      button.setAttribute("aria-disabled", "true");
      bindAttr(button, "data-reason", t(touchMode() ? "inv.rotateNeedsItem" : "inv.rotateNeedsItem.mouse"));
    }
  }

  render(): void {
    if (!this.isOpen()) return;
    const truck = el("div", { class: "inv-body" }, this.view.render());
    const rotate = el(
      "button",
      {
        class: "btn-s",
        "data-action": "rotate",
        onpointerdown: () => this.view.rotateHeld(),
        onclick: (e: Event) => {
          if ((e as MouseEvent).detail === 0) this.view.rotateHeld();
        },
      },
      el("kbd", { class: "key no-touch" }, verbatim(ROTATE_KEYCAP)),
      t("inv.rotate"),
    );
    this.view.holdChanged = () => this.markRotate(rotate);
    this.markRotate(rotate);
    this.root.replaceChildren(
      el("button", { class: "close", onclick: () => this.close() }, keyLabel(t("inv.close"), "I")),
      el("h3", {}, t("inv.title"), truckChips(this.host.world()), rotate),
      truck,
    );
    this.view.fitTo(truck);
  }
}

function featureChip(chassisId: string): HTMLElement | null {
  const name = chassisAbilityName(chassisId);
  return name ? el("span", { class: "chip", title: chassisAbilityLine(chassisId) ?? name }, name) : null;
}

export function truckChips(w: World, opts: { freeCells: boolean } = { freeCells: true }, truckId?: string): HTMLElement {
  const me = truckFor(w, truckId);
  const mass = loadMass(me);
  const rated = chassisDef(me.chassisId).ratedMass;
  return el(
    "span",
    { class: "chips" },
    el("span", { class: "chip" }, createIcon("truck"), chassisName(chassisDef(me.chassisId).id)),
    featureChip(me.chassisId),
    el("span", { class: "chip" }, moneyEl(w.player.money)),
    opts.freeCells ? el("span", { class: "chip", title: t("inv.freeCellsTitle") }, createIcon("cells"), t("inv.freeCells", { n: freeCells(me) })) : null,
    el(
      "span",
      { class: `chip${mass > rated ? " bad" : ""}`, title: t("inv.loadTitle") },
      createIcon("load"),
      t("speed.loadChip", { mass: kg(mass), rated: kg(rated) }),
    ),
    powerChipNode(w, me),
  );
}

function powerChipNode(w: World, me: Vehicle): HTMLElement {
  const chip = powerChip(maxSpeedSteps(w, me), me);
  return el("span", { class: `chip${chip.over ? " bad" : ""}`, title: chip.detail, "aria-label": chip.detail }, createIcon("power"), chip.text);
}

const ROTATE_KEYCAP = "R";

function fieldPatchable(part: PartInstance): boolean {
  const def = partDef(part.defId);
  return !isShield(def) || def.fieldRepair !== "none";
}

function shopOnlyPatch(part: PartInstance): HTMLElement | null {
  return part.hp < maxHp(part) ? el("button", { class: "inv-patch", ...disabledWith(t("inv.shopOnly"), () => {}) }, t("inv.verb.patch")) : null;
}

function partDetails(w: World, me: Vehicle, part: PartInstance, mounted: boolean): HTMLElement[] {
  const kind = partDef(part.defId).kind;
  const base = mounted ? null : baselinePart(me, kind);
  const row = conditionRow(part);
  return [
    ...(row ? [row] : []),
    conditionMeter(part),
    statGrid(diffStats(partStats(w, part), base ? partStats(w, base) : null)),
    base ? el("p", { class: "dim" }, t("inv.against", { part: partName(base.defId) }), conditionTag(base)) : el("span"),
  ];
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
