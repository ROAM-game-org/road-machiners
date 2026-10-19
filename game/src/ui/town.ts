
import { PLAYER_CHASSIS } from "../data/chassis";
import { ECONOMY, GOOD_IDS, PARCEL } from "../data/goods";
import { CONTRACTS, shopDef, type ShopDef } from "../data/market";
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
  canTradeWith,
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
import { acceptContract, deliverContract, fitsFetch, isMet, searchRefusal, shopAt, shopState, type Contract, type SearchRefusal, type ShopState } from "../sim/market";
import { escortBlocked, escortFit } from "../sim/escort-job";
import type { PartInstance, Vehicle, World } from "../sim/types";
import { compareBase, createBareItemIcon, createIcon, createItemTipIcon, itemTip, type IconName } from "./cards";
import { PartRows, type PartRow } from "./part-rows";
import { caption, keepFocus, priceEl, priceHead, priceSpan, reasonButton, repairBar, shortBy, supplyAmount, supplyCap, supplyLine, supplyRow, truckCards, type PriceHint } from "./shop-rows";
import { el, panel, type Child } from "./dom";
import { claimRivalMark, contractSummary, contractWindow, CRATE_NOTE, escortLeaves, escortStatusText, estimateText, estimateTitle, GOODS_COLUMNS, heldContractDue, lotTitle, nextSurveyClue, PROFIT_HEAD_TITLE, rescueWhere, saleEstimate, vehicleName, type SaleEstimate } from "./format";
import { InventoryView, truckChips } from "./inventory";
import { buyChart, chartsOnSale, sheetAt, sheetId, sheetTiles, type Sheet, type SheetOffer } from "../sim/charts";
import { MapView, observeBox } from "./map-view";
import { toPx, type Viewport } from "./map-geometry";
import { token } from "./tokens";
import { QUESTS, startQuest } from "../sim/quests";
import { localsAt } from "../sim/dialogue-rules";
import type { UiHost } from "./host";
import { coinEl, fuelLiters, kph, moneyEl, moneyMsg, moneyNum } from "./units";
import { fuelCap, suppliesCap, vehicleStats } from "../sim/stats";
import { num, PLUS, SPACE, t, type Msg } from "../text/msg";
import { goodName, localName, localRole, refusalText, siteName, vehicleTitle } from "../text/names";
import { commandFailure } from "./format";
import { vehicleHasPerk } from "../sim/progress";

export type Tab = "people" | "market" | "buyParts" | "sellParts" | "trucks" | "contracts" | "charts";

export type StockFilter = "all" | Exclude<PartKind, "core">;

export const STOCK_FILTERS: StockFilter[] = ["all", "weapon", "engine", "armor", "cargo", "scanner", "store", "utility"];

const GARAGE_ONLY: Tab[] = ["trucks"];

const PRESSURE_HINT_AT = 0.2;
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
      el("button", { class: "close", onclick: () => this.close() }, t("trade.leave")),
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
      trucks: () => this.trucks(w),
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
      {},
      el(
        "div",
        { class: "goods" },
        goodsHead(false),
        ...def.supplies.map((k) => this.supplyRow(w, k)),
        ...def.goods.map((g) => this.goodRow(w, shopId, def, state, g)),
      ),
    );
  }

  private goodRow(w: World, shopId: string, def: ShopDef, state: ShopState, g: string): HTMLElement {
    const me = playerVehicle(w);
    const held = goodsCount(me)[g] ?? 0;
    const buy = buyPrice(w, shopId, g);
    const sell = sellPrice(w, shopId, g);
    const hint = pressureHint(def, state, g);
    const buyReason = (n: number) => {
      const lot = getLotTradePrice(w, me, shopId, g, n, "buy");
      return shortBy(w.player.money, lot) ?? (cargoRoom(me) < n ? t("trade.noRoom") : null);
    };
    const sellReason = held === 0 ? t("trade.nothingToSell") : null;
    return el(
      "div",
      { class: "good-row row" },
      el(
        "div",
        { class: "good-name" },
        createItemTipIcon(g),
        el("b", { title: itemTip(g) }, goodName(g)),
      ),
      el(
        "div",
        { class: "trade buy" },
        caption(GOODS_COLUMNS.buy, true),
        priceEl(buy, shortBy(w.player.money, buy) === null, hint),
        this.button(t("trade.plus", { n: 1 }), (x) => buyGood(x, g, 1), buyReason(1), `${g}:buy1`),
        this.button(t("trade.plus", { n: 5 }), (x) => buyGood(x, g, 5), buyReason(5), `${g}:buy5`, lotTitle("buy", 5, getLotTradePrice(w, me, shopId, g, 5, "buy"))),
      ),
      el(
        "div",
        { class: "trade sell" },
        caption(GOODS_COLUMNS.sell, true),
        priceEl(sell),
        this.button(t("trade.minus", { n: 1 }), (x) => sellGood(x, g, 1), sellReason, `${g}:sell1`),
        this.button(t("trade.all"), (x) => sellGood(x, g, held), sellReason, `${g}:sellAll`, held ? lotTitle("sell", held, getLotTradePrice(w, me, shopId, g, held, "sell")) : null),
      ),
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

  private trucks(w: World): HTMLElement {
    return truckCards(w, PLAYER_CHASSIS, (id) => ({
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
      return escortRefusal(w, c) ?? searchRefusalText(w, searchRefusal(w, c));
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

function threatPips(threat: number): HTMLElement {
  return el("div", { class: "skill-level threat", title: t("contract.threat", { n: threat }) }, ...Array.from({ length: 3 }, (_, i) => el("i", { class: i < threat ? "on" : "" })));
}

function escortDetail(w: World, c: Extract<Contract, { kind: "escort" }>): Child[] {
  const trader = w.vehicles.find((v) => v.id === c.client);
  if (!trader) return [];
  return [el("span", {}, t("contract.trader", { who: vehicleName(w, c.client), n: kph(vehicleStats(w, trader).maxSpeed) })), threatPips(c.threat)];
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

const CONTRACT_ICON: Record<Contract["kind"], () => HTMLElement> = {
  haul: () => createIcon("cargo"),
  fetch: () => createIcon("parts"),
  claim: () => createIcon("parts"),
  bounty: () => createBareItemIcon("cannon"),
  search: () => createBareItemIcon(PARCEL.id),
  survey: () => createIcon("scanner"),
  escort: () => createIcon("truck"),
  rescue: () => createIcon("truck"),
};

const PROFIT_TONE = { gain: "better", loss: "worse", even: "same" } as const;

function goodsHead(withTheirs: boolean): DocumentFragment {
  const c = GOODS_COLUMNS;
  const head = el(
    "div",
    { class: "goods-head row dim" },
    el("span", {}, c.good),
    withTheirs ? theirsHead() : null,
    priceHead(c.buy),
    priceHead(c.sell),
    el("span", { class: "end" }, c.held),
    el("span", { class: "end", title: PROFIT_HEAD_TITLE, "aria-label": PROFIT_HEAD_TITLE }, c.profit, coinEl()),
  );
  const fragment = document.createDocumentFragment();
  fragment.append(head, el("div", { class: "goods-note dim" }, CRATE_NOTE));
  return fragment;
}

function suppliesHead(): HTMLElement {
  return el("div", { class: "goods-head row dim" }, el("span", {}), theirsHead(), priceHead(GOODS_COLUMNS.buy));
}

function theirsHead(): HTMLElement {
  return el("span", { class: "end" }, GOODS_COLUMNS.theirs);
}

function countCell(cls: "theirs" | "held", n: number, text: Msg = num(n, "int")): HTMLElement {
  return el("div", { class: `count ${cls}` }, caption(GOODS_COLUMNS[cls]), el("span", { class: n === 0 ? "num dim" : "num" }, text));
}

function profitCell(e: SaleEstimate): HTMLElement {
  if (e.kind === "none") return el("div", { class: "profit" });
  const tone = e.kind === "unrecorded" ? "dim" : `delta ${PROFIT_TONE[e.kind]}`;
  return el("div", { class: "profit", title: estimateTitle(e) }, caption(GOODS_COLUMNS.profit, true), el("span", { class: `num ${tone}` }, estimateText(e)));
}

function surveyLine(c: Contract): HTMLElement | null {
  const clue = c.kind === "survey" ? nextSurveyClue(c) : null;
  return clue ? el("span", { class: "dim contract-clue" }, clue) : null;
}

function escortClock(w: World, c: Extract<Contract, { kind: "escort" }>, posted: boolean): HTMLElement {
  if (posted) return el("span", { class: "price", title: t("contract.leavesTitle", { n: Math.max(0, c.deadline - w.turn) }) }, createIcon("clock"), escortLeaves(c));
  const status = escortStatusText(w, c);
  return status ? el("span", { class: "price dim", title: heldContractDue(c) }, createIcon("clock"), status) : el("span", {});
}

function contractRow(w: World, c: Contract, action: HTMLElement, posted = false): HTMLElement {
  const met = isMet(c);
  const clock = c.kind === "escort" ? escortClock(w, c, posted) : posted
    ? el("span", { class: "price", title: t("contract.windowTitle", { n: c.window }) }, createIcon("clock"), contractWindow(c))
    : el("span", { class: "price", title: met ? undefined : t("contract.dueTitle", { n: c.deadline - w.turn }) }, createIcon("clock"), heldContractDue(c));
  return el(
    "div",
    { class: "job" },
    CONTRACT_ICON[c.kind](),
    c.kind === "escort" && posted
      ? el("div", { class: "job-what" }, el("span", {}, contractSummary(c)), el("div", { class: "job-detail dim" }, ...escortDetail(w, c)))
      : contractSummaryCell(w, c),
    el("span", { class: "price good" }, PLUS, moneyEl(c.reward)),
    clock,
    action,
  );
}

function contractSummaryCell(w: World, c: Contract): HTMLElement {
  if (c.kind !== "rescue") return el("span", {}, contractSummary(c), surveyLine(c), claimRivalMark(w, c));
  const need = el("span", { class: "tag", title: t("contract.rescueAlt") }, t(`contract.need.${c.need}`));
  return el("span", {}, need, SPACE, contractSummary(c), c.fulfilled ? null : el("div", { class: "dim" }, rescueWhere(c)));
}

export function pressureHint(def: ShopDef, state: ShopState, good: string): PriceHint | null {
  const pressure = state.pressure[good] ?? 0;
  if (pressure >= PRESSURE_HINT_AT) return { tone: "bad", title: t("trade.hint.short") };
  if (pressure <= -PRESSURE_HINT_AT) return { tone: "good", title: t("trade.hint.flooded") };
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
      el("button", { class: "close", onclick: () => this.close() }, t("trade.leave")),
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
