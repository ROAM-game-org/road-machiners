
import { ECONOMY, GOOD_IDS } from "../data/goods";
import { CONTRACTS, SHOPS, SHORT_PRESSURE, shopDef, siteRecipes, type Recipe, type ShopDef } from "../data/market";
import { RULES } from "../data/rules";
import { partDef, type PartKind } from "../data/parts";
import { playerVehicle } from "../sim/damage";
import {
  buyChassis,
  buyGood,
  buyPrice,
  buyStockPart,
  buySupply,
  buyTruckGood,
  buyTruckPart,
  buyTruckSupply,
  chassisPrice,
  endTrade,
  enterTown,
  getLotTradePrice,
  partTradePrice,
  basicsRepairCost,
  repairAll,
  repairBasics,
  repairCost,
  sellGood,
  sellPart,
  sellPrice,
  sellTruckGood,
  sellTruckPart,
  supplyRoom,
  rationing,
  serviceRoom,
  canTradeWith,
  garageChassis,
  truckGoodPrice,
  truckPartPrice,
  truckGoodsForSale,
  truckSupplyForSale,
  truckSupplyPrice,
  type Supply,
} from "../sim/economy";
import { freeCells, goodsCount, MOUNT_CELLS, mountedParts } from "../sim/grid";
import { canStowPart, cargoRoom, spareParts } from "../sim/inventory";
import { fitsClaim } from "../sim/claims";
import { acceptContract, deliverContract, fitsFetch, goodStock, haulShort, isMet, pressureOf, searchRefusal, shopAt, shopState, stockShort, type Contract, type SearchRefusal, type ShopState } from "../sim/market";
import { escortBlocked, escortFit } from "../sim/escort-job";
import type { PartInstance, RoadNews, Vehicle, World } from "../sim/types";
import { onRelief, recipeRunning } from "../sim/production";
import { liveRoadNews } from "../sim/road-news";
import { compareBase, createBareItemIcon, createIcon, createItemIcon, createItemTipIcon, itemTip, type IconName } from "./cards";
import { PartRows, type PartRow } from "./part-rows";
import { caption, keepFocus, priceEl, priceHead, priceSpan, limitedSupplyRow, reasonButton, repairBar, shortBy, supplyAmount, supplyCap, supplyLine, supplyRow, truckCards, type PriceHint } from "./shop-rows";
import { el, panel } from "./dom";
import { escortStatusText, gameHours, estimateText, estimateTitle, GOODS_COLUMNS, lotTitle, PROFIT_HEAD_TITLE, saleEstimate, type SaleEstimate } from "./format";
import { InventoryView, truckChips } from "./inventory";
import { contractRow } from "./contract-row";
import { buyChart, chartsOnSale, sheetAt, sheetId, sheetTiles, type Sheet, type SheetOffer } from "../sim/charts";
import { MapView, observeBox } from "./map-view";
import { toPx, type Viewport } from "./map-geometry";
import { token } from "./tokens";
import { QUESTS, startQuest } from "../sim/quests";
import { localsAt } from "../sim/dialogue-rules";
import type { UiHost } from "./host";
import { coinEl, fuelLiters, moneyEl, moneyMsg, moneyNum } from "./units";
import { fuelCap, suppliesCap } from "../sim/stats";
import { list, num, SPACE, t, type Msg } from "../text/msg";
import { ESCAPE, keyLabel } from "./input-mode";
import { goodName, localName, localRole, refusalText, siteName, vehicleTitle } from "../text/names";
import { commandFailure } from "./format";
import { seesAll } from "./see-all";
import { vehicleHasPerk } from "../sim/progress";

export type Tab = "people" | "market" | "buyParts" | "sellParts" | "trucks" | "contracts" | "charts";

export type StockFilter = "all" | Exclude<PartKind, "core">;

export const STOCK_FILTERS: StockFilter[] = ["all", "weapon", "engine", "armor", "cargo", "scanner", "store", "utility"];

const GARAGE_ONLY: Tab[] = ["trucks"];

const CHARTS_SIZE = 640;

export class TownScreen {
  private root = panel("modal dialog");
  private tab: Tab = "market";
  private stockFilter: StockFilter = "all";
  private error: Msg | null = null;
  private rows = new PartRows(() => this.render());
  private sheet: Sheet | null = null;
  private hoverSheet: Sheet | null = null;
  private chartOffers: SheetOffer[] = [];
  private chartsBox: HTMLElement | null = null;
  private chartsView = new MapView({ kind: "fit" }, CHARTS_SIZE, CHARTS_SIZE, (ctx, view) => this.drawSheets(ctx, view));

  private inventory: InventoryView;

  constructor(private host: UiHost) {
    this.root.classList.add("town-screen");
    this.root.style.display = "none";
    window.addEventListener("resize", () => this.render());
    this.inventory = new InventoryView(host, () => this.render(), false);
    this.chartsView.canvas.addEventListener("click", (e) => {
      this.sheet = this.sheetAt(e.clientX, e.clientY);
      this.render();
    });
    this.chartsView.canvas.addEventListener("pointermove", (e) => {
      const over = this.sheetAt(e.clientX, e.clientY);
      if (over && this.hoverSheet && sheetId(over) === sheetId(this.hoverSheet)) return;
      if (!over && !this.hoverSheet) return;
      this.hoverSheet = over;
      this.chartsView.update(this.host.world(), null);
    });
    this.chartsView.canvas.addEventListener("pointerleave", () => {
      this.hoverSheet = null;
      this.chartsView.update(this.host.world(), null);
    });
  }

  isOpen(): boolean {
    return this.root.style.display !== "none";
  }

  open(): void {
    if (shopAt(this.host.world())) this.host.apply(enterTown(this.host.world()));
    this.root.style.display = "";
    this.error = null;
    this.rows.collapse();
    this.render();
  }

  close(): void {
    this.inventory.clearSelection();
    this.root.style.display = "none";
    this.root.replaceChildren();
  }

  render(): void {
    if (!this.isOpen()) return;
    this.rows.keepPlace(this.root, () => this.draw());
  }

  private draw(): void {
    const w = this.host.world();
    const shopId = shopAt(w);
    if (!shopId) return this.close();
    const def = shopDef(shopId);
    this.normalizeTab(shopId, def);
    const shop = [el("div", { class: "tabs" }, ...this.tabButtons(shopId, def))];
    if (this.error) shop.push(el("div", { class: "bad" }, this.error));
    shop.push(this.tabBody(w, shopId, def));
    const truck = el(
      "div",
      { class: "town-truck" },
      this.repairBar(w),
      this.inventory.render(),
    );
    this.root.replaceChildren(
      el("button", { class: "close", onclick: () => this.close() }, keyLabel(t("trade.leave"), ESCAPE.key)),
      el("h3", {}, siteName(shopId), truckChips(w, { freeCells: def.kind !== "garage" })),
      el("div", { class: "town-split" }, truck, el("div", { class: "town-shop" }, ...shop)),
    );
    this.inventory.fitTo(truck);
  }

  private normalizeTab(shopId: string, def: ShopDef): void {
    if (def.kind !== "garage" && GARAGE_ONLY.includes(this.tab)) this.tab = "market";
    if (this.tab === "people" && localsAt(shopId).length === 0) this.tab = "market";
    if (this.tab === "charts" && !def.charts) this.tab = "market";
  }

  private tabButtons(shopId: string, def: ShopDef): HTMLElement[] {
    const people: Tab[] = localsAt(shopId).length > 0 ? ["people"] : [];
    const tabs: Tab[] = [...people, "market", "buyParts", "sellParts", ...(def.kind === "garage" ? GARAGE_ONLY : []), "contracts", ...(def.charts ? (["charts"] as Tab[]) : [])];
    return tabs.map((tab) =>
      el(
        "button",
        {
          class: this.tab === tab ? "on" : "",
          "data-tab": tab,
          onclick: () => {
            this.tab = tab;
            this.showList();
          },
        },
        createIcon(TAB_ICON[tab]),
        t(`trade.tab.${tab}`),
      ),
    );
  }

  private tabBody(w: World, shopId: string, def: ShopDef): HTMLElement {
    const body: Record<Tab, () => HTMLElement> = {
      people: () => peopleList(shopId, (cmd) => this.run(cmd, true)),
      market: () => this.market(w, shopId, def),
      buyParts: () => this.buyParts(w, shopId),
      sellParts: () => this.sellParts(w),
      trucks: () => this.trucks(w, shopId),
      contracts: () => this.contracts(w, shopId),
      charts: () => this.charts(w, shopId),
    };
    return body[this.tab]();
  }

  private showList(): void {
    this.rows.collapse();
    this.render();
    this.rows.toTop(this.root);
  }

  private run(cmd: (w: World) => World, announce = false): void {
    keepFocus(this.root, () => {
      try {
        const next = cmd(this.host.world());
        if (announce) this.host.announce(next);
        else this.host.apply(next);
        this.error = null;
        this.rows.collapse();
      } catch (e) {
        this.error = commandFailure(this.host.world(), e);
      }
      this.render();
    });
  }

  button(label: Msg, cmd: (w: World) => World, reason: Msg | null = null, key = "", title: Msg | null = null): HTMLElement {
    return reasonButton([label], () => this.run(cmd), reason, key, title);
  }

  priceButton(w: World, verb: Msg, price: number, cmd: (w: World) => World, reason: Msg | null = null, key = ""): HTMLElement {
    const short = shortBy(w.player.money, price);
    return reasonButton([verb, SPACE, priceSpan(price, short === null)], () => this.run(cmd), reason ?? short, key);
  }

  private hintMounts(kind: PartKind): (on: boolean) => void {
    return (on) => this.inventory.hintMounts(on ? MOUNT_CELLS[kind] : null);
  }

  private market(w: World, shopId: string, def: ShopDef): HTMLElement {
    const state = shopState(w, shopId);
    return el(
      "div",
      { class: "market" },
      seesAll() ? recipeLine(w, shopId) : null,
      el(
        "div",
        { class: "goods stocked" },
        goodsHead(false, true),
        ...def.supplies.map((k) => this.shopSupplyRow(w, shopId, k)),
        ...def.goods.map((g) => this.goodRow(w, shopId, def, state, g)),
      ),
      newsWell(w),
    );
  }

  private shopSupplyRow(w: World, shopId: string, k: Supply): HTMLElement {
    const short = rationing(w, shopId, k);
    const tag = short ? el("span", { class: "tag bad", title: rationingTip(k) }, t("trade.rationing")) : null;
    return limitedSupplyRow(w, k, this, buySupply, playerVehicle(w), { room: serviceRoom(w, shopId, k), tag });
  }

  private stockedBuyCell(w: World, shopId: string, g: string, hint: PriceHint | null, stock: number): HTMLElement {
    const buy = buyPrice(w, shopId, g);
    const buyReason = (n: number) => (stock < n ? stockReason(stock) : this.lotReason(w, shopId, g, n));
    return el(
      "div",
      { class: "trade buy" },
      caption(GOODS_COLUMNS.buy, true),
      stock > 0 ? priceEl(buy, shortBy(w.player.money, buy) === null, hint) : el("span", { class: "price" }),
      this.button(t("trade.plus", { n: 1 }), (x) => buyGood(x, g, 1), buyReason(1), `${g}:buy1`),
      this.button(t("trade.plus", { n: 5 }), (x) => buyGood(x, g, 5), buyReason(5), `${g}:buy5`, stock >= 5 ? lotTitle("buy", 5, getLotTradePrice(w, playerVehicle(w), shopId, g, 5, "buy")) : null),
    );
  }

  private lotReason(w: World, shopId: string, g: string, n: number): Msg | null {
    const me = playerVehicle(w);
    return shortBy(w.player.money, getLotTradePrice(w, me, shopId, g, n, "buy")) ?? (cargoRoom(me) < n ? t("trade.noRoom") : null);
  }

  private goodRow(w: World, shopId: string, def: ShopDef, state: ShopState, g: string): HTMLElement {
    const me = playerVehicle(w);
    const held = goodsCount(me)[g] ?? 0;
    const sell = sellPrice(w, shopId, g);
    const stock = goodStock(state, g);
    const sellReason = held === 0 ? t("trade.nothingToSell") : null;
    return el(
      "div",
      { class: "good-row row" },
      stockedGoodName(w, shopId, g),
      this.stockedBuyCell(w, shopId, g, pressureHint(def, state, g), stock),
      el(
        "div",
        { class: "trade sell" },
        caption(GOODS_COLUMNS.sell, true),
        priceEl(sell),
        this.button(t("trade.minus", { n: 1 }), (x) => sellGood(x, g, 1), sellReason, `${g}:sell1`),
        this.button(t("trade.all"), (x) => sellGood(x, g, held), sellReason, `${g}:sellAll`, held ? lotTitle("sell", held, getLotTradePrice(w, me, shopId, g, held, "sell")) : null),
      ),
      countCell("stock", stock),
      countCell("held", held),
      profitCell(saleEstimate(held, sell, w.player.costBasis[g])),
    );
  }

  private buyParts(w: World, shopId: string): HTMLElement {
    const me = playerVehicle(w);
    const stock = shopState(w, shopId).stock;
    const shown = stock.filter((p) => this.stockFilter === "all" || partDef(p.defId).kind === this.stockFilter);
    const rows = shown.map((p) => {
      const price = partTradePrice(w, me, p, "buy");
      const short = shortBy(w.player.money, price);
      return this.partRow(w, p, price, short === null, this.button(t("goods.buy"), (x) => buyStockPart(x, p.id), short));
    });
    return el(
      "div",
      {},
      el("div", { class: "tabs sub" }, ...this.stockFilterButtons(stock)),
      rows.length ? this.rows.list(rows) : el("div", { class: "dim" }, stock.length ? t("trade.noneOfKind") : t("trade.noStock")),
    );
  }

  private partRow(w: World, p: PartInstance, price: number, payable: boolean, action: HTMLElement): PartRow {
    return {
      world: w,
      part: p,
      base: compareBase(this.inventory.selectedPart(), p),
      price,
      payable,
      action,
      onHover: this.hintMounts(partDef(p.defId).kind),
    };
  }

  private stockFilterButtons(stock: PartInstance[]): HTMLElement[] {
    return STOCK_FILTERS.map((f) => this.stockFilterButton(f, stockCount(stock, f)));
  }

  private stockFilterButton(f: StockFilter, count: number): HTMLElement {
    const empty = count === 0 && f !== "all";
    return el(
      "button",
      {
        class: this.stockFilter === f ? "on" : "",
        title: empty ? t("trade.filterEmpty", { kind: t(`trade.filter.${f}`) }) : t(`trade.filter.${f}`),
        "aria-disabled": empty ? "true" : undefined,
        onclick: () => {
          if (empty) return;
          this.stockFilter = f;
          this.showList();
        },
      },
      f === "all" ? t("trade.filter.all") : filterIcon(f),
      el("span", { class: "count" }, num(count, "int")),
    );
  }

  private sellParts(w: World): HTMLElement {
    const me = playerVehicle(w);
    const sellable: PartInstance[] = [...w.player.storage, ...spareParts(me)];
    const rows = sellable.map((p) =>
      this.partRow(w, p, partTradePrice(w, me, p, "sell"), true, this.button(t("goods.sell"), (x) => sellPart(x, p.id))),
    );
    return el("div", {}, rows.length ? this.rows.list(rows) : el("div", { class: "dim" }, t("trade.noSpares")));
  }

  private supplyRow(w: World, k: Supply): HTMLElement {
    return supplyRow(w, k, this, buySupply);
  }

  private repairBar(w: World): HTMLElement {
    return repairBar(w, this, { basics: repairBasics, all: repairAll });
  }

  private trucks(w: World, shopId: string): HTMLElement {
    return truckCards(w, garageChassis(shopId), (id) => ({
      reason: chassisPrice(w, id) < 0 ? null : shortBy(w.player.money, chassisPrice(w, id)),
      swap: () => this.run((x) => buyChassis(x, id)),
    }));
  }

  private charts(w: World, shopId: string): HTMLElement {
    const offers = chartsOnSale(w, shopId);
    const picked = offers.find((o) => this.sheet && sheetId(o.sheet) === sheetId(this.sheet)) ?? null;
    if (!picked) this.sheet = null;
    this.chartOffers = offers;
    this.chartsView.update(w, null);
    const buy = picked
      ? this.priceButton(w, t("goods.buy"), picked.price, (x) => buyChart(x, picked.sheet), null, "buy-chart")
      : null;
    return el("div", { class: "charts" }, this.chartsMap(), buy);
  }

  private chartsMap(): HTMLElement {
    if (this.chartsBox) return this.chartsBox;
    const box = el("div", { class: "charts-map" }, this.chartsView.canvas);
    observeBox(box, this.chartsView);
    this.chartsBox = box;
    return box;
  }

  private sheetAt(clientX: number, clientY: number): Sheet | null {
    const p = this.chartsView.pick(clientX, clientY);
    if (!p) return null;
    const sheet = sheetAt(this.host.world().size, p);
    return this.chartOffers.some((o) => sheetId(o.sheet) === sheetId(sheet)) ? sheet : null;
  }

  private drawSheets(ctx: CanvasRenderingContext2D, view: Viewport): void {
    const trace = (sheet: Sheet) => {
      const b = sheetTiles(this.host.world().size, sheet);
      const from = toPx(view, { x: b.x0, y: b.y0 });
      const to = toPx(view, { x: b.x1, y: b.y1 });
      ctx.beginPath();
      ctx.rect(from.x, from.y, to.x - from.x, to.y - from.y);
    };
    ctx.lineWidth = 1;
    ctx.strokeStyle = token("--line-strong");
    for (const o of this.chartOffers) {
      trace(o.sheet);
      ctx.stroke();
    }
    const mark = (sheet: Sheet | null, stroke: string, fill: string | null) => {
      if (!sheet) return;
      trace(sheet);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    };
    mark(this.hoverSheet, token("--ink-bright"), null);
    mark(this.sheet, token("--accent"), token("--accent-wash"));
  }

  private contracts(w: World, shopId: string): HTMLElement {
    const board = shopState(w, shopId).contracts;
    const full = w.player.contracts.length >= CONTRACTS.maxActive;
    const refusal = (c: Contract): Msg | null => {
      if (full) return t("contract.full", { n: CONTRACTS.maxActive });
      return haulStockReason(w, c) ?? escortRefusal(w, c) ?? searchRefusalText(w, searchRefusal(w, c));
    };
    const accept = (c: Contract) => this.button(t("contract.accept"), (x) => acceptContract(x, c.id), refusal(c));
    return el(
      "div",
      {},
      el("h3", {}, t("contract.offers")),
      board.length
        ? el("div", { class: "jobs" }, ...board.map((c) => contractRow(w, c, accept(c), true)))
        : el("div", { class: "dim" }, t("contract.noOffers")),
      el("h3", {}, t("contract.yours", { n: w.player.contracts.length, max: CONTRACTS.maxActive })),
      w.player.contracts.length
        ? el("div", { class: "jobs" }, ...w.player.contracts.map((c) => contractRow(w, c, this.deliverCell(w, shopId, c))))
        : null,
    );
  }

  private deliverCell(w: World, shopId: string, c: Contract): HTMLElement {
    if (c.kind === "escort") return el("span", { class: "dim" }, escortStatusText(w, c));
    const destination = c.kind === "haul" ? c.to : c.shop;
    const verb = DELIVER_VERBS[c.kind];
    if (destination !== shopId) return el("span", { class: "dim" }, t(verb.at, { site: siteName(destination) }));
    return this.button(t(verb.now), (x) => deliverContract(x, c.id), canDeliver(w, c) ? null : notReady(w, c));
  }
}

function searchRefusalText(w: World, refusal: SearchRefusal | null): Msg | null {
  if (refusal === null) return null;
  return refusal === "oneSearch" ? t("contract.oneSearch") : refusalText(w, { id: refusal });
}

const DELIVER_VERBS = {
  haul: { now: "contract.deliver", at: "contract.deliverAt" },
  fetch: { now: "contract.deliver", at: "contract.deliverAt" },
  bounty: { now: "contract.claim", at: "contract.claimAt" },
  rescue: { now: "contract.claim", at: "contract.claimAt" },
  search: { now: "contract.claim", at: "contract.claimAt" },
  survey: { now: "contract.report", at: "contract.reportAt" },
  claim: { now: "contract.deliver", at: "contract.deliverAt" },
} as const;

function escortRefusal(w: World, c: Contract): Msg | null {
  if (c.kind !== "escort") return null;
  const blocked = escortBlocked(w, c);
  if (blocked === "escorting") return t("contract.alreadyEscorting");
  if (blocked !== "weak") return null;
  const fit = escortFit(w, c);
  return t("contract.needsStronger", { win: Math.round(fit.win * 100), need: Math.round(fit.need * 100) });
}

function notReady(w: World, c: Contract): Msg {
  if (c.kind === "survey") return t("contract.notSurveyed");
  if (c.kind === "haul") return t("contract.needMore", { n: c.units - (goodsCount(playerVehicle(w))[c.good] ?? 0), good: goodName(c.good) });
  if (c.kind === "fetch") return t("contract.needsPart");
  if (c.kind === "search") return t("contract.handOverFirst");
  if (c.kind === "claim") return playerVehicle(w).items.some((it) => it.kind === "part" && it.part.id === c.partId) ? t("contract.unmountFirst") : t("contract.needsPart");
  if (c.kind === "rescue") return t("contract.notMet");
  return bountyPays(w);
}

function bountyPays(w: World): Msg {
  return vehicleHasPerk(w, playerVehicle(w), "bountyTalk") ? t("contract.paysGiveUp") : t("contract.pays");
}

const FILTER_ICON: Record<Exclude<StockFilter, "all" | "weapon">, IconName> = {
  engine: "engine",
  armor: "armor",
  cargo: "cargo",
  scanner: "scanner",
  store: "supplies",
  utility: "utility",
};

export function filterIcon(f: Exclude<StockFilter, "all">): HTMLElement {
  return f === "weapon" ? createBareItemIcon("mg") : createIcon(FILTER_ICON[f]);
}

export const TAB_ICON: Record<Tab, IconName> = {
  people: "driver",
  market: "salt",
  buyParts: "parts",
  sellParts: "trade",
  trucks: "truck",
  contracts: "clock",
  charts: "journal",
};

function theyHave(have: number, n: number, amount: (n: number) => Msg): Msg | null {
  if (have >= n) return null;
  return have < 1 ? t("trade.theyNone") : t("trade.theyHave", { amount: amount(have) });
}

function theyLack(npc: Vehicle, price: number): Msg | null {
  const money = npc.resources!.money;
  return money >= price ? null : t("trade.theyLack", { price: moneyMsg(price - money) });
}

function stockCount(stock: PartInstance[], f: StockFilter): number {
  return f === "all" ? stock.length : stock.filter((p) => partDef(p.defId).kind === f).length;
}

const PROFIT_TONE = { gain: "better", loss: "worse", even: "same" } as const;

function goodsHead(withTheirs: boolean, withStock = false): HTMLElement {
  const c = GOODS_COLUMNS;
  return el(
    "div",
    { class: "goods-head row dim" },
    el("span", {}, c.good),
    withTheirs ? theirsHead() : null,
    priceHead(c.buy),
    priceHead(c.sell),
    withStock ? el("span", { class: "end" }, c.stock) : null,
    el("span", { class: "end" }, c.held),
    el("span", { class: "end", title: PROFIT_HEAD_TITLE, "aria-label": PROFIT_HEAD_TITLE }, c.profit, coinEl()),
  );
}

function suppliesHead(): HTMLElement {
  return el("div", { class: "goods-head row dim" }, el("span", {}), theirsHead(), priceHead(GOODS_COLUMNS.buy));
}

function theirsHead(): HTMLElement {
  return el("span", { class: "end" }, GOODS_COLUMNS.theirs);
}

function countCell(cls: "theirs" | "held" | "stock", n: number, text: Msg = num(n, "int")): HTMLElement {
  return el("div", { class: `count ${cls}` }, caption(GOODS_COLUMNS[cls]), el("span", { class: n === 0 ? "num dim" : "num" }, text));
}

function profitCell(e: SaleEstimate): HTMLElement {
  if (e.kind === "none") return el("div", { class: "profit" });
  const tone = e.kind === "unrecorded" ? "dim" : `delta ${PROFIT_TONE[e.kind]}`;
  return el("div", { class: "profit", title: estimateTitle(e) }, caption(GOODS_COLUMNS.profit, true), el("span", { class: `num ${tone}` }, estimateText(e)));
}

function haulStockReason(w: World, c: Contract): Msg | null {
  if (c.kind !== "haul" || !haulShort(w, c)) return null;
  return t("contract.noStock", { n: goodStock(shopState(w, c.shop), c.good) });
}

function rationingTip(k: Supply): Msg {
  const pct = Math.round(RULES.scrapPatch * 100);
  return k === "fuel" ? t("trade.rationingTip.fuel", { pct }) : t("trade.rationingTip.supplies", { pct });
}

function goodRoutesTip(good: string): Msg {
  const sites = (list: string[]) => list.map(siteName);
  const makers = Object.values(SHOPS).filter((s) => s.makes.includes(good)).map((s) => s.id);
  const users = Object.values(SHOPS).filter((s) => s.needs.includes(good)).map((s) => s.id);
  if (users.length === 0) return t("trade.goodMadeOnly", { makers: list(sites(makers)) });
  return t("trade.goodRoutes", { makers: list(sites(makers)), users: list(sites(users)) });
}

function recipeLine(w: World, shopId: string): HTMLElement {
  const event = shopState(w, shopId).event;
  return el("div", { class: "recipes" }, ...siteRecipes(shopId).map((r) => recipeChip(w, shopId, r, event?.recipe === r.id ? event.kind : null)));
}

function stockReason(stock: number): Msg {
  return stock === 0 ? t("trade.noGoodStock") : t("contract.noStock", { n: stock });
}

export function goodRoutesTitle(good: string): Msg | null {
  return seesAll() ? goodRoutesTip(good) : null;
}

export function showsRelief(w: World, shopId: string, good: string): boolean {
  return seesAll() && onRelief(w, shopId, good);
}

function stockedGoodName(w: World, shopId: string, g: string): HTMLElement {
  const relief = showsRelief(w, shopId, g) ? el("span", { class: "tag bad", title: t("trade.reliefTip") }, t("trade.relief")) : null;
  return el("div", { class: "good-name" }, createItemTipIcon(g), el("b", { title: goodRoutesTitle(g) ?? itemTip(g) }, goodName(g)), relief);
}

function recipeChip(w: World, shopId: string, r: Recipe, event: "surge" | "breakdown" | null): HTMLElement {
  const run = recipeRunning(w, shopId, r.id);
  const batch = run === "fallback" ? { inputs: {}, outputs: r.fallback ?? r.outputs } : { inputs: r.inputs, outputs: r.outputs };
  return el(
    "div",
    { class: run === "stopped" ? "recipe dim" : "recipe" },
    ...crateIcons(batch.inputs),
    Object.keys(batch.inputs).length > 0 ? el("span", { class: "recipe-gap" }) : null,
    ...crateIcons(batch.outputs),
    event ? eventTag(event) : null,
  );
}

function eventTag(event: "surge" | "breakdown"): HTMLElement {
  return event === "surge" ? el("span", { class: "tag good" }, t("recipe.surge")) : el("span", { class: "tag bad" }, t("recipe.breakdown"));
}

function crateIcons(goods: Record<string, number>): HTMLElement[] {
  return Object.entries(goods).map(([good, n]) => el("span", { class: "recipe-good" }, n > 1 ? el("span", { class: "num" }, num(n, "int")) : null, createItemIcon(good)));
}

function newsWell(w: World): HTMLElement | null {
  const news = liveRoadNews(w);
  if (news.length === 0) return null;
  return el("div", { class: "road-news" }, ...[...news].reverse().map((n) => newsRow(w, n)));
}

const NEWS_VERB = { robbed: "news.robbed", destroyed: "news.destroyed", knockedOut: "news.knockedOut" } as const;

function newsRow(w: World, n: RoadNews): HTMLElement {
  return el(
    "div",
    { class: "news-row row" },
    createItemIcon(n.good),
    el("span", { class: "bad" }, t(NEWS_VERB[n.kind])),
    el("span", {}, t("news.route", { from: siteName(n.from), to: siteName(n.to) })),
    el("span", { class: "num dim" }, t("news.ago", { h: gameHours(w.turn - n.turn) })),
  );
}

export function pressureHint(def: ShopDef, state: ShopState, good: string): PriceHint | null {
  if (stockShort(def.id, state, good)) return { tone: "bad", title: t("trade.hint.short") };
  if (pressureOf(def.id, good, goodStock(state, good)) <= -SHORT_PRESSURE) return { tone: "good", title: t("trade.hint.flooded") };
  if (def.makes.includes(good)) return { tone: "good", title: t("trade.hint.cheap") };
  if (def.needs.includes(good)) return { tone: "bad", title: t("trade.hint.dear") };
  return null;
}


function canDeliver(w: World, c: Contract): boolean {
  const me = playerVehicle(w);
  if (c.kind === "haul") return (goodsCount(me)[c.good] ?? 0) >= c.units;
  if (c.kind === "fetch")
    return spareParts(me).some((p) => fitsFetch(c, p)) || w.player.storage.some((p) => fitsFetch(c, p));
  if (c.kind === "claim") return spareParts(me).some((p) => fitsClaim(c, p)) || w.player.storage.some((p) => fitsClaim(c, p));
  return isMet(c);
}

type TradeTab = "goods" | "parts" | "supplies";

const TRADE_TABS: TradeTab[] = ["goods", "parts", "supplies"];

const TRADE_TAB_ICON: Record<TradeTab, IconName> = { goods: "salt", parts: "parts", supplies: "fuel" };

const SUPPLY_STEP = 10;

export class TruckTradeScreen {
  private root = panel("modal dialog");
  private tab: TradeTab = "goods";
  private npcId: string | null = null;
  private error: Msg | null = null;
  private rows = new PartRows(() => this.render());
  private inventory: InventoryView;

  constructor(private host: UiHost) {
    this.root.classList.add("town-screen");
    this.root.style.display = "none";
    window.addEventListener("resize", () => this.render());
    this.inventory = new InventoryView(host, () => this.render(), true);
  }

  isOpen(): boolean {
    return this.npcId !== null;
  }

  openWith(npcId: string): boolean {
    if (!canTradeWith(this.host.world(), npcId)) return false;
    this.npcId = npcId;
    this.root.style.display = "";
    this.error = null;
    this.rows.collapse();
    this.render();
    return true;
  }

  close(): void {
    if (!this.npcId) return;
    const npcId = this.npcId;
    this.inventory.clearSelection();
    this.npcId = null;
    this.root.style.display = "none";
    this.root.replaceChildren();
    this.host.apply(endTrade(this.host.world(), npcId));
  }

  render(): void {
    if (!this.npcId) return;
    this.rows.keepPlace(this.root, () => this.draw());
  }

  private draw(): void {
    const w = this.host.world();
    const npc = w.vehicles.find((v) => v.id === this.npcId);
    if (!npc) throw new Error(`Trade partner ${this.npcId} is gone`);
    const side = [el("div", { class: "tabs" }, ...this.tabButtons())];
    if (this.error) side.push(el("div", { class: "bad" }, this.error));
    side.push(this.tabBody(w, npc));
    const truck = el("div", { class: "town-truck" }, this.inventory.render());
    this.root.replaceChildren(
      el("button", { class: "close", onclick: () => this.close() }, keyLabel(t("trade.leave"), ESCAPE.key)),
      el("h3", {}, vehicleTitle(w, npc), truckChips(w), partnerChips(npc)),
      el("div", { class: "town-split" }, truck, el("div", { class: "town-shop" }, ...side)),
    );
    this.inventory.fitTo(truck);
  }

  private tabButtons(): HTMLElement[] {
    return TRADE_TABS.map((tab) =>
      el(
        "button",
        { class: this.tab === tab ? "on" : "", "data-tab": tab, onclick: () => {
          this.tab = tab;
          this.rows.collapse();
          this.render();
          this.rows.toTop(this.root);
        } },
        createIcon(TRADE_TAB_ICON[tab]),
        t(`trade.tradeTab.${tab}`),
      ),
    );
  }

  private tabBody(w: World, npc: Vehicle): HTMLElement {
    if (this.tab === "goods") return this.goods(w, npc);
    if (this.tab === "parts") return this.parts(w, npc);
    return el("div", { class: "goods truck" }, suppliesHead(), this.supplyRow(w, npc, "fuel"), this.supplyRow(w, npc, "supplies"));
  }

  private run(cmd: (w: World) => World): void {
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

  button(label: Msg, cmd: (w: World) => World, reason: Msg | null = null, key = ""): HTMLElement {
    return reasonButton([label], () => this.run(cmd), reason, key);
  }

  private hintMounts(kind: PartKind): (on: boolean) => void {
    return (on) => this.inventory.hintMounts(on ? MOUNT_CELLS[kind] : null);
  }

  private goods(w: World, npc: Vehicle): HTMLElement {
    const mine = goodsCount(playerVehicle(w));
    const listed = GOOD_IDS.filter((g) => truckGoodsForSale(npc, g) > 0 || (mine[g] ?? 0) > 0);
    if (listed.length === 0) return el("div", { class: "dim" }, t("trade.noGoods"));
    return el("div", { class: "goods truck" }, goodsHead(true), ...listed.map((g) => this.goodRow(w, npc, g, mine[g] ?? 0)));
  }

  private goodRow(w: World, npc: Vehicle, g: string, held: number): HTMLElement {
    const theirs = truckGoodsForSale(npc, g);
    const me = playerVehicle(w);
    const buy = truckGoodPrice(w, g, "buy");
    const sell = truckGoodPrice(w, g, "sell");
    const buyReason = (n: number) =>
      theyHave(theirs, n, (v) => num(v, "int")) ?? shortBy(w.player.money, buy * n) ?? (cargoRoom(me) < n ? t("trade.noRoom") : null);
    const sellReason = (n: number) => {
      if (held < Math.max(n, 1)) return t("trade.nothingToSell");
      if (cargoRoom(npc) < n) return t("trade.noRoomThem");
      return theyLack(npc, sell * n);
    };
    return el(
      "div",
      { class: "good-row row" },
      el(
        "div",
        { class: "good-name" },
        createItemTipIcon(g),
        el("b", { title: itemTip(g) }, goodName(g)),
      ),
      countCell("theirs", theirs),
      el(
        "div",
        { class: "trade buy" },
        caption(GOODS_COLUMNS.buy, true),
        priceEl(buy, shortBy(w.player.money, buy) === null),
        this.button(t("trade.plus", { n: 1 }), (x) => buyTruckGood(x, npc.id, g, 1), buyReason(1), `${g}:buy1`),
        this.button(t("trade.all"), (x) => buyTruckGood(x, npc.id, g, theirs), buyReason(Math.max(theirs, 1)), `${g}:buyAll`),
      ),
      el(
        "div",
        { class: "trade sell" },
        caption(GOODS_COLUMNS.sell, true),
        priceEl(sell),
        this.button(t("trade.minus", { n: 1 }), (x) => sellTruckGood(x, npc.id, g, 1), sellReason(1), `${g}:sell1`),
        this.button(t("trade.all"), (x) => sellTruckGood(x, npc.id, g, held), sellReason(held), `${g}:sellAll`),
      ),
      countCell("held", held),
      profitCell(saleEstimate(held, sell, w.player.costBasis[g])),
    );
  }

  private parts(w: World, npc: Vehicle): HTMLElement {
    const me = playerVehicle(w);
    const row = (p: PartInstance, price: number, reason: Msg | null, verb: Msg, cmd: (w: World) => World): PartRow => ({
      part: p,
      base: compareBase(this.inventory.selectedPart(), p),
      price,
      world: w,
      payable: reason === null,
      action: this.button(verb, cmd, reason),
      onHover: this.hintMounts(partDef(p.defId).kind),
    });
    const theirs = spareParts(npc).map((p) => {
      const price = truckPartPrice(w, p, "buy");
      const reason = shortBy(w.player.money, price) ?? (canStowPart(me, p) ? null : t("trade.noRoom"));
      return row(p, price, reason, t("goods.buy"), (x) => buyTruckPart(x, npc.id, p.id));
    });
    const mine = spareParts(me).map((p) => {
      const price = truckPartPrice(w, p, "sell");
      return row(p, price, theyLack(npc, price), t("goods.sell"), (x) => sellTruckPart(x, npc.id, p.id));
    });
    return el(
      "div",
      {},
      el("h3", {}, t("trade.theirSpares")),
      theirs.length ? this.rows.list(theirs) : el("div", { class: "dim" }, t("trade.nothingSpare")),
      el("h3", {}, t("trade.yourSpares")),
      mine.length ? this.rows.list(mine) : el("div", { class: "dim" }, t("trade.nothingSpare")),
    );
  }

  private supplyRow(w: World, npc: Vehicle, k: Supply): HTMLElement {
    const price = truckSupplyPrice(w, k);
    const offer = truckSupplyForSale(npc, k);
    const most = Math.min(offer, supplyRoom(w, k), Math.floor(w.player.money / price));
    const have = w.player[k];
    const cap = supplyCap(w, k);
    const amount = (n: number) => supplyAmount(k, n);
    const reasonFor = (n: number) =>
      theyHave(offer, n, amount) ?? (supplyRoom(w, k) < n ? t("trade.full") : null) ?? shortBy(w.player.money, price * n);
    return supplyLine(k, have, cap, countCell("theirs", offer, amount(offer)), price, shortBy(w.player.money, price) === null, [
      this.button(t("trade.plusAmount", { amount: amount(SUPPLY_STEP) }), (x) => buyTruckSupply(x, npc.id, k, SUPPLY_STEP), reasonFor(SUPPLY_STEP)),
      this.button(most > 0 ? t("trade.fill", { amount: amount(most) }) : t("trade.fillBare"), (x) => buyTruckSupply(x, npc.id, k, most), reasonFor(1)),
    ]);
  }
}

function partnerChips(npc: Vehicle): HTMLElement {
  const money = npc.resources!.money;
  return el(
    "span",
    { class: "chips" },
    el("span", { class: "dim" }, t("trade.them")),
    el("span", { class: "chip", title: t("trade.theirMoney") }, moneyEl(money)),
    el("span", { class: "chip", title: t("trade.theirCells") }, createIcon("cells"), t("inv.freeCells", { n: freeCells(npc) })),
  );
}

function peopleList(town: string, run: (cmd: (w: World) => World) => void): HTMLElement {
  return el(
    "div",
    { class: "people" },
    ...localsAt(town).map((l) =>
      el(
        "button",
        { class: "person", "data-local": l.id, onclick: () => run((w) => startQuest(w, QUESTS, l.quest, "start")) },
        createIcon("driver"),
        el("b", {}, localName(l.id)),
        el("span", { class: "dim" }, localRole(l.id)),
      ),
    ),
  );
}
