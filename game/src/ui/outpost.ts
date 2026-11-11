import { runCommand } from "./run-command";
import { haulerOf, playerVehicle, truckFor } from "../sim/damage";
import { chassisPrice, chassisSwapRefusal, paintPrice, partTradePrice, type Supply } from "../sim/economy";
import { canDriveOn, driveOn, outpostTrucks, reachedOutpostAt, type Outpost } from "../sim/chaos-highway";
import { goodsCount } from "../sim/grid";
import { gatesShut } from "../sim/outpost-gates";
import { outpostBuyChassis, outpostBuyGood, outpostBuyPart, outpostBuySupply, outpostGoodPrice, haulerTakes, outpostGoodRoom, outpostPartPrice, outpostRepairAll, outpostRepairBasics, outpostRepaint, outpostSellGood, outpostSellPart, outpostGoodSellPrice } from "../sim/outposts";
import type { PartInstance, World } from "../sim/types";
import { num, t, type Msg } from "../text/msg";
import { ESCAPE, keyLabel } from "./input-mode";
import { goodName, refusalText, siteName } from "../text/names";
import { chassisPortrait, createIcon, createItemTipIcon, itemTip } from "./cards";
import { filteredStock, garagePartRow, goodSellCell, paintBody, partList, sellPartsBody, stockFilterChips, type GarageList, type StockFilter } from "./garage-tabs";
import { el, panel } from "./dom";
import { commandFailure, GOODS_COLUMNS } from "./format";
import type { UiHost } from "./host";
import { InventoryView, truckChips } from "./inventory";
import { PartRows, type PartRow } from "./part-rows";
import type { TruckPaint } from "../data/chassis";
import { RowSlots } from "./row-slots";
import { TAB_ICON, type Tab } from "./town";
import { buyButton, caption, keepFocus, priceHead, reasonButton, repairBar, shortBy, supplyRow, truckCards, type ShopCommand } from "./shop-rows";

const REPAIR_GOOD = "parts";
export const OUTPOST_TABS = ["market", "buyParts", "sellParts", "trucks", "paint"] as const satisfies readonly Tab[];
type OutpostTab = (typeof OUTPOST_TABS)[number];
const GOOD_LOT = 4;

function goodsHead(): HTMLElement {
  const c = GOODS_COLUMNS;
  return el("div", { class: "goods-head row dim" }, el("span", {}, c.good), priceHead(c.buy), priceHead(c.sell), el("span", { class: "end" }, c.held), el("span", {}));
}

export function outpostControls(w: World): { leave: boolean; driveOn: boolean } {
  return { leave: !gatesShut(w), driveOn: canDriveOn(w) };
}

export class OutpostScreen {
  private root = panel("modal dialog");
  private error: Msg | null = null;
  private tab: OutpostTab = "market";
  private shown: "truck" | "hauler" = "truck";
  private slots = new RowSlots();
  private rows = new PartRows(() => this.render(), this.slots);
  private inventory: InventoryView;
  private stockFilter: StockFilter = "all";
  private paintPlan: TruckPaint | null = null;

  constructor(private host: UiHost) {
    this.root.classList.add("town-screen", "outpost-screen");
    this.root.style.display = "none";
    window.addEventListener("resize", () => this.render());
    this.inventory = new InventoryView(host, () => this.render(), false);
  }

  isOpen(): boolean {
    return this.root.style.display !== "none";
  }

  private fresh(): void {
    this.paintPlan = null;
    this.rows.collapse();
    this.slots.forget();
  }

  open(): void {
    this.root.style.display = "";
    this.error = null;
    this.fresh();
    this.render();
  }

  close(): void {
    if (!outpostControls(this.host.world()).leave) return;
    this.leave();
  }

  private leave(): void {
    this.slots.forget();
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

  priceButton(w: World, verb: Msg, price: number, cmd: ShopCommand, reason: Msg | null = null, key = "", title: Msg | null = null): HTMLElement {
    return buyButton(w.player.money, verb, price, () => this.run(cmd), reason, key, title);
  }

  private draw(): void {
    const w = this.host.world();
    const post = reachedOutpostAt(w);
    if (!post) return this.leave();
    if (this.shown === "hauler" && !this.haulerHere(w)) this.shown = "truck";
    const id = this.truckId(w);
    this.inventory.showTruck(id ?? null);
    const mine = truckFor(w, id);
    const truckBody = el("div", { class: "truck-body" }, this.inventory.render());
    const truck = el(
      "div",
      { class: "town-truck" },
      this.truckSwitch(w),
      repairBar(w, this, { basics: (x) => outpostRepairBasics(x, id), all: (x) => outpostRepairAll(x, id) }, mine),
      truckBody,
    );
    const shop = el(
      "div",
      { class: "town-shop" },
      el("div", { class: "tabs" }, ...this.tabButtons()),
      this.stockChips(post),
      this.error ? el("div", { class: "bad" }, this.error) : null,
      el("div", { class: "shop-body" }, this.tabBody(w, post)),
      this.driveOnButton(w),
    );
    this.root.replaceChildren(...this.leaveButton(w), el("h3", {}, siteName(post.id), truckChips(w, {}, id)), el("div", { class: "town-split" }, truck, shop));
    this.inventory.fitTo(truckBody);
  }

  private leaveButton(w: World): HTMLElement[] {
    const { leave } = outpostControls(w);
    this.root.classList.toggle("pinned", !leave);
    return leave ? [el("button", { class: "close", onclick: () => this.close() }, keyLabel(t("trade.leave"), ESCAPE.key))] : [];
  }

  private haulerHere(w: World): boolean {
    return w.chaosHighway !== null && reachedOutpostAt(w, haulerOf(w)) !== null;
  }

  private truckId(w: World): string | undefined {
    return this.shown === "hauler" && w.chaosHighway ? haulerOf(w).id : undefined;
  }

  private truckSwitch(w: World): HTMLElement | null {
    if (!w.chaosHighway) return null;
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
            this.fresh();
            this.render();
          },
        },
        chassisPortrait(chassisId, w.player.paint),
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
            this.fresh();
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
    if (this.tab === "sellParts") return this.sellParts(w);
    if (this.tab === "paint") return this.paint(w);
    const id = this.truckId(w);
    const buy = (x: World, k: Supply, n: number) => outpostBuySupply(x, k, n, id);
    const mine = truckFor(w, id);
    return el("div", { class: "goods" }, goodsHead(), supplyRow(w, "fuel", this, buy, mine), supplyRow(w, "supplies", this, buy, mine), this.goodRow(w));
  }

  private trucks(w: World, post: Outpost): HTMLElement {
    const offer = outpostTrucks(w, post);
    const list = `trucks:${this.shown}`;
    if (offer.length === 0 && !this.slots.has(list)) return el("div", { class: "dim" }, t("outpost.soldOut"));
    return truckCards(w, offer, (id) => ({ reason: this.swapReason(w, id), swap: () => this.run((x) => outpostBuyChassis(x, id)) }), this.slots, list);
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
    this.host.apply(driveOn(w));
    this.leave();
  }

  private run(cmd: ShopCommand): void {
    keepFocus(this.root, () => {
      try {
        const failed = runCommand(this.host.world(), cmd, (next) => this.host.apply(next));
        this.error = failed === null ? null : commandFailure(this.host.world(), failed);
        if (failed === null) this.rows.collapse();
      } finally {
        this.render();
      }
    });
  }

  private goodRow(w: World): HTMLElement {
    const me = playerVehicle(w);
    const price = outpostGoodPrice();
    const room = outpostGoodRoom(me);
    const reason = (n: number) => shortBy(w.player.money, price * n) ?? (room < n ? t("trade.noRoom") : null);
    const held = goodsCount(me)[REPAIR_GOOD] ?? 0;
    const sell = outpostGoodSellPrice(w);
    return el(
      "div",
      { class: "good-row row" },
      el("div", { class: "good-name" }, createItemTipIcon(REPAIR_GOOD), el("b", { title: itemTip(REPAIR_GOOD) }, goodName(REPAIR_GOOD))),
      el(
        "div",
        { class: "trade buy" },
        caption(GOODS_COLUMNS.buy),
        buyButton(w.player.money, t("trade.plus", { n: 1 }), price, () => this.run((x) => outpostBuyGood(x, 1)), reason(1), `${REPAIR_GOOD}:buy1`),
        buyButton(w.player.money, t("trade.plus", { n: GOOD_LOT }), price * GOOD_LOT, () => this.run((x) => outpostBuyGood(x, GOOD_LOT)), reason(GOOD_LOT), `${REPAIR_GOOD}:buy${GOOD_LOT}`),
      ),
      goodSellCell({
        good: REPAIR_GOOD,
        one: sell,
        all: held ? sell * held : null,
        reason: held === 0 ? t("trade.nothingToSell") : null,
        sellOne: () => this.run((x) => outpostSellGood(x, 1)),
        sellAll: () => this.run((x) => outpostSellGood(x, held)),
      }),
      el("div", { class: "count held" }, caption(GOODS_COLUMNS.held), el("span", { class: held === 0 ? "num dim" : "num" }, num(held, "int"))),
    );
  }

  private stockChips(post: Outpost): HTMLElement | null {
    if (this.tab !== "buyParts" || post.stock.length === 0) return null;
    return stockFilterChips(post.stock, this.stockFilter, (f) => {
      this.stockFilter = f;
      this.fresh();
      this.render();
      this.rows.toTop(this.root);
    });
  }

  private stock(w: World, post: Outpost): HTMLElement {
    const list = `stock:${this.shown}:${this.stockFilter}`;
    if (post.stock.length === 0 && !this.slots.has(list)) return el("div", { class: "dim" }, t("outpost.soldOut"));
    const rows = filteredStock(post.stock, this.stockFilter).map((p) => this.partRow(w, p));
    return partList(this.partLists(), list, rows, t("trade.noneOfKind"));
  }

  private partLists(): GarageList {
    return { rows: this.rows, slots: this.slots, inventory: this.inventory };
  }

  private sellParts(w: World): HTMLElement {
    const id = this.truckId(w);
    return sellPartsBody({
      w,
      truck: truckFor(w, id),
      list: this.partLists(),
      price: (p) => partTradePrice(w, playerVehicle(w), p, "sell"),
      sell: (p) => this.run((x) => outpostSellPart(x, p.id, id)),
    });
  }

  private paint(w: World): HTMLElement {
    return paintBody({
      w,
      plan: this.paintPlan,
      setPlan: (plan) => {
        this.paintPlan = plan;
        this.render();
      },
      buy: (plan) => (plan ? this.priceButton(w, t("goods.buy"), paintPrice(w), (x) => outpostRepaint(x, plan), null, "repaint") : null),
    });
  }

  private partRow(w: World, p: PartInstance): PartRow {
    const id = this.truckId(w);
    const refused = id !== undefined && !haulerTakes(p) ? t("outpost.haulerRefuses") : null;
    return garagePartRow(w, this.partLists(), p, this.priceButton(w, t("goods.buy"), outpostPartPrice(w, p, id), (x) => outpostBuyPart(x, p.id, id), refused), t("trade.done.bought"));
  }
}
