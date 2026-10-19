import { partDef, type PartKind } from "../data/parts";
import { haulerOf, playerVehicle, truckFor } from "../sim/damage";
import { chassisPrice, chassisSwapRefusal, type Supply } from "../sim/economy";
import { canDriveOn, driveOn, outpostTrucks, reachedOutpostAt, type Outpost } from "../sim/fury-road";
import { goodsCount, MOUNT_CELLS } from "../sim/grid";
import { gatesShut } from "../sim/outpost-gates";
import { outpostBuyChassis, outpostBuyGood, outpostBuyPart, outpostBuySupply, outpostGoodPrice, haulerTakes, outpostGoodRoom, outpostPartPrice, outpostRepairAll, outpostRepairBasics } from "../sim/outposts";
import type { PartInstance, World } from "../sim/types";
import { num, SPACE, t, type Msg } from "../text/msg";
import { goodName, refusalText, siteName } from "../text/names";
import { chassisPortrait, compareBase, createIcon, createItemTipIcon, itemTip } from "./cards";
import { el, panel } from "./dom";
import { commandFailure, GOODS_COLUMNS } from "./format";
import type { UiHost } from "./host";
import { InventoryView, truckChips } from "./inventory";
import { PartRows, type PartRow } from "./part-rows";
import { TAB_ICON, type Tab } from "./town";
import { caption, keepFocus, priceEl, priceHead, priceSpan, reasonButton, repairBar, shortBy, supplyRow, truckCards, type ShopCommand } from "./shop-rows";

const REPAIR_GOOD = "parts";
const OUTPOST_TABS = ["market", "buyParts", "trucks"] as const satisfies readonly Tab[];
type OutpostTab = (typeof OUTPOST_TABS)[number];
const GOOD_LOT = 4;

function goodsHead(): HTMLElement {
  const c = GOODS_COLUMNS;
  return el("div", { class: "goods-head row dim" }, el("span", {}, c.good), priceHead(c.buy), el("span", {}), el("span", { class: "end" }, c.held), el("span", {}));
}

export function outpostControls(w: World): { leave: boolean; driveOn: boolean } {
  return { leave: !gatesShut(w), driveOn: canDriveOn(w) };
}

export class OutpostScreen {
  private root = panel("modal dialog");
  private error: Msg | null = null;
  private tab: OutpostTab = "market";
  private shown: "truck" | "hauler" = "truck";
  private rows = new PartRows(() => this.render());
  private inventory: InventoryView;

  constructor(private host: UiHost) {
    this.root.classList.add("town-screen", "outpost-screen");
    this.root.style.display = "none";
    window.addEventListener("resize", () => this.render());
    this.inventory = new InventoryView(host, () => this.render(), false);
  }

  isOpen(): boolean {
    return this.root.style.display !== "none";
  }

  open(): void {
    this.root.style.display = "";
    this.error = null;
    this.rows.collapse();
    this.render();
  }

  close(): void {
    if (!outpostControls(this.host.world()).leave) return;
    this.leave();
  }

  private leave(): void {
    this.inventory.clearSelection();
    this.root.style.display = "none";
    this.root.replaceChildren();
  }

  render(): void {
    if (!this.isOpen()) return;
    this.rows.keepPlace(this.root, () => this.draw());
  }

  button(label: Msg, cmd: ShopCommand, reason: Msg | null = null, key = "", title: Msg | null = null): HTMLElement {
    return reasonButton([label], () => this.run(cmd), reason, key, title);
  }

  priceButton(w: World, verb: Msg, price: number, cmd: ShopCommand, reason: Msg | null = null, key = ""): HTMLElement {
    const short = shortBy(w.player.money, price);
    return reasonButton([verb, SPACE, priceSpan(price, short === null)], () => this.run(cmd), reason ?? short, key);
  }

  private draw(): void {
    const w = this.host.world();
    const post = reachedOutpostAt(w);
    if (!post) return this.leave();
    if (this.shown === "hauler" && !this.haulerHere(w)) this.shown = "truck";
    const id = this.truckId(w);
    this.inventory.showTruck(id ?? null);
    const mine = truckFor(w, id);
    const truck = el(
      "div",
      { class: "town-truck" },
      this.truckSwitch(w),
      repairBar(w, this, { basics: (x) => outpostRepairBasics(x, id), all: (x) => outpostRepairAll(x, id) }, mine),
      this.inventory.render(),
    );
    const shop = el(
      "div",
      { class: "town-shop" },
      el("div", { class: "tabs" }, ...this.tabButtons()),
      this.error ? el("div", { class: "bad" }, this.error) : null,
      el("div", { class: "outpost-body" }, this.tabBody(w, post)),
      this.driveOnButton(w),
    );
    this.root.replaceChildren(...this.leaveButton(w), el("h3", {}, siteName(post.id), truckChips(w, { freeCells: true }, id)), el("div", { class: "town-split" }, truck, shop));
    this.inventory.fitTo(truck);
  }

  private leaveButton(w: World): HTMLElement[] {
    const { leave } = outpostControls(w);
    this.root.classList.toggle("pinned", !leave);
    return leave ? [el("button", { class: "close", onclick: () => this.close() }, t("trade.leave"))] : [];
  }

  private haulerHere(w: World): boolean {
    return w.furyRoad !== null && reachedOutpostAt(w, haulerOf(w)) !== null;
  }

  private truckId(w: World): string | undefined {
    return this.shown === "hauler" && w.furyRoad ? haulerOf(w).id : undefined;
  }

  private truckSwitch(w: World): HTMLElement | null {
    if (!w.furyRoad) return null;
    const away = !this.haulerHere(w);
    const choice = (which: "truck" | "hauler", chassisId: string, reason: Msg | null) =>
      el(
        "button",
        {
          class: this.shown === which ? "on" : "",
          "data-truck": which,
          disabled: reason !== null,
          title: reason ?? undefined,
          onclick: () => {
            this.shown = which;
            this.render();
          },
        },
        chassisPortrait(chassisId),
        t(`outpost.${which}`),
      );
    return el("div", { class: "tabs truck-switch" }, choice("truck", playerVehicle(w).chassisId, null), choice("hauler", haulerOf(w).chassisId, away ? t("outpost.haulerAway") : null));
  }

  private tabButtons(): HTMLElement[] {
    return OUTPOST_TABS.map((tab) =>
      el(
        "button",
        {
          class: this.tab === tab ? "on" : "",
          "data-tab": tab,
          onclick: () => {
            this.tab = tab;
            this.rows.collapse();
            this.render();
            this.rows.toTop(this.root);
          },
        },
        createIcon(TAB_ICON[tab]),
        t(`trade.tab.${tab}`),
      ),
    );
  }

  private tabBody(w: World, post: Outpost): HTMLElement {
    if (this.tab === "trucks") return this.trucks(w, post);
    if (this.tab === "buyParts") return this.stock(w, post);
    const id = this.truckId(w);
    const buy = (x: World, k: Supply, n: number) => outpostBuySupply(x, k, n, id);
    const mine = truckFor(w, id);
    return el("div", { class: "goods" }, goodsHead(), supplyRow(w, "fuel", this, buy, mine), supplyRow(w, "supplies", this, buy, mine), this.goodRow(w));
  }

  private trucks(w: World, post: Outpost): HTMLElement {
    const offer = outpostTrucks(w, post);
    if (offer.length === 0) return el("div", { class: "dim" }, t("outpost.soldOut"));
    return truckCards(w, offer, (id) => ({ reason: this.swapReason(w, id), swap: () => this.run((x) => outpostBuyChassis(x, id)) }));
  }

  private swapReason(w: World, id: string): Msg | null {
    const refusal = chassisSwapRefusal(w, id);
    if (refusal?.id === "noMoney") return shortBy(w.player.money, chassisPrice(w, id));
    return refusal ? refusalText(w, refusal) : null;
  }

  private driveOnButton(w: World): HTMLElement | null {
    if (!outpostControls(w).driveOn) return null;
    return el("div", { class: "outpost-road" }, el("button", { class: "btn-l", onclick: () => this.driveOn() }, t("outpost.driveOn")));
  }

  private driveOn(): void {
    const w = this.host.world();
    this.leave();
    this.host.apply(driveOn(w));
  }

  private run(cmd: ShopCommand): void {
    keepFocus(this.root, () => {
      try {
        this.host.apply(cmd(this.host.world()));
        this.error = null;
        this.rows.collapse();
      } catch (e) {
        this.error = commandFailure(this.host.world(), e);
      }
      this.render();
    });
  }

  private goodRow(w: World): HTMLElement {
    const me = playerVehicle(w);
    const price = outpostGoodPrice();
    const room = outpostGoodRoom(me);
    const reason = (n: number) => shortBy(w.player.money, price * n) ?? (room < n ? t("trade.noRoom") : null);
    const held = goodsCount(me)[REPAIR_GOOD] ?? 0;
    return el(
      "div",
      { class: "good-row row" },
      el("div", { class: "good-name" }, createItemTipIcon(REPAIR_GOOD), el("b", { title: itemTip(REPAIR_GOOD) }, goodName(REPAIR_GOOD))),
      el(
        "div",
        { class: "trade buy wide" },
        caption(GOODS_COLUMNS.buy, true),
        priceEl(price, shortBy(w.player.money, price) === null),
        this.button(t("trade.plus", { n: 1 }), (x) => outpostBuyGood(x, 1), reason(1), `${REPAIR_GOOD}:buy1`),
        this.button(t("trade.plus", { n: GOOD_LOT }), (x) => outpostBuyGood(x, GOOD_LOT), reason(GOOD_LOT), `${REPAIR_GOOD}:buy${GOOD_LOT}`),
      ),
      el("div", { class: "count held" }, caption(GOODS_COLUMNS.held), el("span", { class: held === 0 ? "num dim" : "num" }, num(held, "int"))),
    );
  }

  private stock(w: World, post: Outpost): HTMLElement {
    if (post.stock.length === 0) return el("div", { class: "dim" }, t("outpost.soldOut"));
    return this.rows.list(post.stock.map((p) => this.partRow(w, p)));
  }

  private partRow(w: World, p: PartInstance): PartRow {
    const id = this.truckId(w);
    const price = outpostPartPrice(w, p, id);
    const short = shortBy(w.player.money, price);
    const refused = id !== undefined && !haulerTakes(p) ? t("outpost.haulerRefuses") : null;
    return {
      world: w,
      part: p,
      base: compareBase(this.inventory.selectedPart(), p),
      price,
      payable: short === null,
      action: this.button(t("goods.buy"), (x) => outpostBuyPart(x, p.id, id), refused ?? short),
      onHover: this.hintMounts(partDef(p.defId).kind),
    };
  }

  private hintMounts(kind: PartKind): (on: boolean) => void {
    return (on) => this.inventory.hintMounts(on ? MOUNT_CELLS[kind] : null);
  }
}
