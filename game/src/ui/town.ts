
import { GOOD_IDS } from "../data/goods";
import { CONTRACTS, SHOPS, SHORT_PRESSURE, shopDef, siteRecipes, type Recipe, type ShopDef } from "../data/market";
import { RULES } from "../data/rules";
import type { TruckPaint } from "../data/chassis";
import { partDef, type PartKind } from "../data/parts";
import { playerVehicle } from "../sim/damage";
import {
  buyChassis,
  paintPrice,
  repaint,
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
  repairAll,
  repairBasics,
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
import { freeCells, goodsCount, mountCellsOf } from "../sim/grid";
import { canStowPart, cargoRoom, spareParts } from "../sim/inventory";
import { fitsClaim } from "../sim/claims";
import { acceptContract, deliverContract, goodStock, haulShort, isMet, knowsMarket, onOrder, pressureOf, searchRefusal, shopAt, shopState, stockShort, type Contract, type SearchRefusal, type ShopState } from "../sim/market";
import { escortBlocked, escortFit } from "../sim/escort-job";
import type { CrimeCase, PartInstance, RoadNews, Vehicle, World } from "../sim/types";
import { onRelief, recipeRunning } from "../sim/production";
import { liveRoadNews } from "../sim/road-news";
import { compareBase, createBareItemIcon, createIcon, createItemIcon, createItemTipIcon, itemTip, type IconName } from "./cards";
import { PartRows, type PartRow } from "./part-rows";
import { caption, keepFocus, priceEl, priceHead, priceSpan, limitedSupplyRow, reasonButton, repairBar, shortBy, supplyAmount, supplyCap, supplyLine, supplyRow, truckCards, livePaintPlan, paintTab, planWithSlot, type PriceHint } from "./shop-rows";
import { el, isBrowserChord, panel } from "./dom";
import { ArtBand } from "./art-band";
import { callError } from "./dialogue";
import { TOWN_ART } from "../data/quest-art";
import { TOWN_SECTIONS, type TownSection } from "../data/quests";
import { barDrivers, pickTownSection, townSections, type SectionAccess } from "../sim/quests";
import { callVehicle } from "../sim/dialogue";
import { hostileToPlayer } from "../sim/world";
import { clock, escortStatusText, estimateText, estimateTitle, gameHours, GOODS_COLUMNS, lotTitle, PROFIT_HEAD_TITLE, saleEstimate, surveyPlacesLeft, type SaleEstimate } from "./format";
import { InventoryView, truckChips } from "./inventory";
import { contractRow } from "./contract-row";
import { buyChart, chartsOnSale, sheetAt, sheetId, sheetTiles, type Sheet, type SheetOffer } from "../sim/charts";
import { MapView, observeBox } from "./map-view";
import { toPx, type Viewport } from "./map-geometry";
import { token } from "./tokens";
import { QUESTS, startQuest } from "../sim/quests";
import { localsAt } from "../sim/dialogue-rules";
import type { UiHost } from "./host";
import { coinEl, moneyEl, moneyMsg } from "./units";
import { list, num, SPACE, t, type Msg } from "../text/msg";
import { driverName, factionName, goodName, localName, localRole, placeProse, refusalText, siteName, templateName, vehicleTitle } from "../text/names";
import { commandFailure, stanceTag } from "./format";
import { seesAll } from "./see-all";
import { ESCAPE, keyLabel } from "./input-mode";
import { deskAt, deskRows, payAtDesk, settleAtDesk, type SettlementQuote } from "../sim/crime";
import { vehicleById } from "../sim/damage";

export type Tab = "people" | "market" | "buyParts" | "sellParts" | "trucks" | "paint" | "contracts" | "charts";

export type GarageTab = "buyParts" | "sellParts" | "trucks" | "paint";

export type MarketTab = "goods" | "charts";

export type StockFilter = "all" | Exclude<PartKind, "core" | "accessory">;

export function kindFilter(kind: PartKind): Exclude<StockFilter, "all"> {
  if (kind === "core") throw new Error("Built-in parts are never in stock");
  return kind === "accessory" ? "armor" : kind;
}

export const STOCK_FILTERS: StockFilter[] = ["all", "weapon", "engine", "armor", "cargo", "scanner", "store", "utility"];

const GARAGE_TABS: GarageTab[] = ["buyParts", "sellParts", "trucks", "paint"];

export const GARAGE_ONLY: GarageTab[] = ["trucks", "paint"];

const CHARTS_SIZE = 640;

const CHOICE_KEYS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9"];

type TownPage = TownSection | null;

type ClosedAt = { shopId: string; turn: number };

type TownChoice = { id: string; label: Msg; reason: Msg | null; go: () => void };

export type TownFrame = { band: HTMLElement; picture: HTMLElement; heading: Msg; art: string | null };

export function townPageOnOpen(kept: TownPage, closedAt: ClosedAt | null, shopId: string, turn: number, access: Record<TownSection, SectionAccess>): TownPage {
  if (kept === null || closedAt === null) return null;
  if (closedAt.shopId !== shopId || closedAt.turn !== turn) return null;
  return access[kept].open ? kept : null;
}

export class TownScreen {
  private root = panel("modal dialog");
  private page: TownPage = null;
  private closedAt: ClosedAt | null = null;
  private garageTab: GarageTab = "buyParts";
  private marketTab: MarketTab = "goods";
  private stockFilter: StockFilter = "all";
  private error: Msg | null = null;
  private choices: TownChoice[] = [];
  private paintPlan: TruckPaint | null = null;
  private rows = new PartRows(() => this.render());
  private band = new ArtBand();
  private sheet: Sheet | null = null;
  private hoverSheet: Sheet | null = null;
  private chartOffers: SheetOffer[] = [];
  private chartsBox: HTMLElement | null = null;
  private chartsView = new MapView({ kind: "fit" }, CHARTS_SIZE, CHARTS_SIZE, (ctx, view) => this.drawSheets(ctx, view));

  private inventory: InventoryView;

  constructor(private host: UiHost) {
    this.root.classList.add("town-screen", "town-page", "ink-page");
    this.root.style.display = "none";
    window.addEventListener("resize", () => this.render());
    window.addEventListener("keydown", (e) => this.onKey(e), true);
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
    const shopId = shopAt(this.host.world());
    if (shopId) this.host.apply(enterTown(this.host.world()));
    this.root.style.display = "";
    this.error = null;
    this.paintPlan = null;
    this.rows.collapse();
    const w = this.host.world();
    this.page = shopId ? townPageOnOpen(this.page, this.closedAt, shopId, w.turn, townSections(w, shopId)) : null;
    this.normalizeGarageTab();
    const page = this.page;
    if (page === null) return this.render();
    this.run((x) => pickTownSection(x, null, page), true);
  }

  close(): void {
    if (this.isOpen()) {
      const w = this.host.world();
      const shopId = shopAt(w);
      this.closedAt = shopId ? { shopId, turn: w.turn } : null;
    }
    this.inventory.clearSelection();
    this.band.clear();
    this.root.style.display = "none";
    this.root.classList.remove("under-quest");
    this.root.replaceChildren();
  }

  back(): void {
    if (!this.isOpen()) return;
    const from = this.page;
    if (from === null) return this.close();
    this.page = null;
    this.rows.collapse();
    this.run((x) => pickTownSection(x, from, null), true);
  }

  frame(): TownFrame {
    if (!this.isOpen()) throw new Error("The town page is closed, so a quest cannot borrow its frame");
    const w = this.host.world();
    const shopId = shopAt(w);
    if (!shopId) throw new Error("The town page is open away from a shop");
    const art = this.artKey(shopId);
    const band = this.bandOf(w, art, shopDef(shopId).kind !== "garage");
    const picture = band.querySelector<HTMLElement>(".art-band");
    if (!picture) throw new Error("The town band has no picture strip");
    return { band, picture, heading: this.heading(shopId), art };
  }

  render(): void {
    if (!this.isOpen()) return;
    this.rows.keepPlace(this.root, () => this.draw());
  }

  private onKey(e: KeyboardEvent): void {
    const index = CHOICE_KEYS.indexOf(e.code);
    if (index < 0 || !this.takesKeys(e)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    this.pickChoice(index);
  }

  private takesKeys(e: KeyboardEvent): boolean {
    if (!this.isOpen() || isBrowserChord(e) || e.repeat) return false;
    const w = this.host.world();
    return !w.player.call && !w.player.quests.live;
  }

  private pickChoice(index: number): void {
    const choice = this.choices[index];
    if (!choice) return;
    if (!choice.reason) return choice.go();
    this.error = choice.reason;
    this.render();
  }

  private normalizeGarageTab(): void {
    const shopId = shopAt(this.host.world());
    const def = shopId ? shopDef(shopId) : null;
    if (def && def.kind !== "garage" && GARAGE_ONLY.includes(this.garageTab)) this.garageTab = "buyParts";
  }

  private go(to: TownSection): void {
    const w = this.host.world();
    const shopId = shopAt(w);
    if (!shopId) throw new Error("A town page choice was picked away from a shop");
    const access = townSections(w, shopId)[to];
    if (!access.open) {
      this.error = sectionReason(access.reason);
      return this.render();
    }
    this.page = to;
    this.rows.collapse();
    this.run((x) => pickTownSection(x, null, to), true);
    this.rows.toTop(this.root);
  }

  private draw(): void {
    const w = this.host.world();
    const shopId = shopAt(w);
    if (!shopId) {
      const desk = deskAt(w);
      return desk ? this.drawDesk(w, desk) : this.close();
    }
    const underQuest = w.player.quests.live !== null;
    this.root.classList.toggle("under-quest", underQuest);
    this.root.classList.toggle("on-section", this.page !== null);
    if (!underQuest) this.drawPage(w, shopId, this.page);
  }

  private drawPage(w: World, shopId: string, page: TownPage): void {
    const truck = this.showsTruck(w, shopId, page) ? el("div", { class: "town-truck" }, this.inventory.render()) : null;
    this.choices = page === null ? this.frontChoices(w, shopId) : this.sectionChoices(shopId, page);
    this.root.replaceChildren(
      this.bandOf(w, this.artKey(shopId), shopDef(shopId).kind !== "garage"),
      el(
        "div",
        { class: "ink-body" },
        el("div", { class: "ink-head" }, el("h2", { class: "quest-place" }, this.heading(shopId)), el("p", { class: "qt-line" }, proseOf(shopId, page))),
        page === null ? null : this.sectionPanel(w, shopId, shopDef(shopId), page, truck),
        el("div", { class: "ink-choices quest-choices" }, ...this.choices.map((c, i) => choiceButton(c, i))),
        el("div", { class: "ink-status bad" }, this.error),
      ),
    );
    if (truck) this.inventory.fitTo(truck);
  }

  private artKey(shopId: string): string | null {
    const art = TOWN_ART[shopId];
    return (this.page === null ? null : art?.sections[this.page]) ?? art?.band ?? null;
  }

  private drawDesk(w: World, desk: string): void {
    this.root.classList.remove("under-quest");
    this.choices = [{ id: "leave", label: t("town.go.leave"), reason: null, go: () => this.close() }];
    this.root.replaceChildren(
      this.bandOf(w, TOWN_ART[desk]?.band ?? null, true),
      el(
        "div",
        { class: "ink-body" },
        el("div", { class: "ink-head" }, el("h2", { class: "quest-place" }, siteName(desk))),
        el("div", { class: "ink-panel" }, this.deskBody(w)),
        el("div", { class: "ink-choices quest-choices" }, ...this.choices.map((c, i) => choiceButton(c, i))),
        el("div", { class: "ink-status bad" }, this.error),
      ),
    );
  }

  private deskBody(w: World): HTMLElement {
    const rows = deskRows(w);
    const cases = rows.cases.map((c) => this.caseRow(w, c));
    const ids = rows.cases.map((c) => c.id);
    const payAll = rows.cases.length > 1 ? el("div", { class: "desk-all" }, this.priceButton(w, t("desk.payAll"), rows.owed, (x) => payAtDesk(x, ids))) : null;
    const settles = rows.settlements.map((q) => this.settleRow(w, q));
    return el(
      "div",
      { class: "desk-body" },
      cases.length > 0 ? el("div", { class: "desk-group" }, ...cases, payAll) : null,
      settles.length > 0 ? el("div", { class: "desk-group" }, ...settles) : null,
      cases.length === 0 && settles.length === 0 ? el("p", { class: "dim" }, t("desk.empty")) : null,
    );
  }

  private caseRow(w: World, c: CrimeCase): HTMLElement {
    const victim = w.vehicles.some((v) => v.id === c.victim) ? vehicleTitle(w, vehicleById(w, c.victim)) : t("log.someDriver");
    return el(
      "div",
      { class: "row desk-case" },
      el("span", {}, t(`desk.case.${c.offense}`, { victim })),
      el("span", { class: "dim" }, t("desk.filed", { issuer: issuerName(w, c), site: siteName(c.site), when: clock(c.turn).full })),
      this.priceButton(w, t("desk.pay"), c.owed, (x) => payAtDesk(x, [c.id])),
    );
  }

  private settleRow(w: World, q: SettlementQuote): HTMLElement {
    const short = shortBy(w.player.money, q.price);
    const reason = q.refusal && q.refusal.id !== "noMoney" ? refusalText(w, q.refusal) : short;
    const label = [t("desk.settle"), SPACE, priceSpan(q.price, short === null)];
    return el(
      "div",
      { class: "row desk-settle" },
      el("span", {}, factionName(q.faction)),
      el("span", { class: "tag bad" }, t("band.hostile")),
      reasonButton(label, () => this.run((x) => settleAtDesk(x, q.faction)), reason, "", t("desk.settleAfter", { faction: factionName(q.faction) })),
    );
  }

  private bandOf(w: World, art: string | null, freeCells: boolean): HTMLElement {
    const chips = truckChips(w, { freeCells });
    return el("div", { class: "ink-band" }, this.band.frame(art), el("div", { class: "ink-chips" }, chips));
  }

  private heading(shopId: string): Msg {
    return this.page === null ? siteName(shopId) : t(`town.section.${this.page}`);
  }

  private frontChoices(w: World, shopId: string): TownChoice[] {
    const access = townSections(w, shopId);
    const sections = TOWN_SECTIONS.map((section): TownChoice => {
      const a = access[section];
      return { id: section, label: t(`town.go.${section}`), reason: a.open ? null : sectionReason(a.reason), go: () => this.go(section) };
    });
    return [...sections, { id: "leave", label: t("town.go.leave"), reason: null, go: () => this.back() }];
  }

  private sectionChoices(shopId: string, page: TownSection): TownChoice[] {
    const locals = page === "people" ? localsAt(shopId).map((l): TownChoice => ({
      id: `local:${l.id}`,
      label: list([localName(l.id), localRole(l.id)]),
      reason: null,
      go: () => this.run((w) => startQuest(w, QUESTS, l.quest, "start"), true),
    })) : [];
    return [...locals, { id: "back", label: t("town.back"), reason: null, go: () => this.back() }];
  }

  private showsTruck(w: World, shopId: string, page: TownPage): boolean {
    if (page === "garage") return true;
    return page === "market" && !this.chartsShown(shopId);
  }

  private chartsShown(shopId: string): boolean {
    return this.marketTab === "charts" && shopDef(shopId).charts;
  }

  private sectionPanel(w: World, shopId: string, def: ShopDef, page: TownSection, truck: HTMLElement | null): HTMLElement | null {
    if (page === "market" && !truck) return el("div", { class: "ink-panel" }, this.marketTabs(def), this.charts(w, shopId));
    if (truck) {
      const shop = page === "garage" ? this.garage(w, shopId, def) : this.market(w, shopId, def);
      return el("div", { class: "ink-panel wide" }, el("div", { class: "town-split" }, truck, el("div", { class: "town-shop" }, shop)));
    }
    if (page === "board") return el("div", { class: "ink-panel" }, this.contracts(w, shopId));
    if (page === "bar") return el("div", { class: "ink-panel" }, this.bar(w, shopId));
    return null;
  }

  private garage(w: World, shopId: string, def: ShopDef): HTMLElement {
    const tabs = GARAGE_TABS.filter((tab) => def.kind === "garage" || !GARAGE_ONLY.includes(tab));
    const buttons = tabs.map((tab) =>
      el(
        "button",
        {
          class: this.garageTab === tab ? "on" : "",
          "data-garage-tab": tab,
          onclick: () => {
            this.garageTab = tab;
            this.paintPlan = null;
            this.showList();
          },
        },
        createIcon(TAB_ICON[tab]),
        t(`trade.tab.${tab}`),
      ),
    );
    const body = { buyParts: () => this.buyParts(w, shopId), sellParts: () => this.sellParts(w), trucks: () => this.trucks(w, shopId), paint: () => this.paint(w) }[this.garageTab]();
    return el("div", {}, this.repairBar(w), el("div", { class: "tabs sub" }, ...buttons), body);
  }

  private bar(w: World, shopId: string): HTMLElement {
    const drivers = barDrivers(w, shopId);
    if (drivers.length === 0) return el("div", { class: "dim" }, sectionReason("noDrivers"));
    return el("div", { class: "bar-list" }, ...drivers.map((v) => this.barRow(w, v)));
  }

  private barRow(w: World, v: Vehicle): HTMLElement {
    const quiet = list([v.brain ? templateName(v.brain.templateId) : null, factionName(v.faction)].filter((part) => part !== null));
    const reason = w.player.call ? t("town.reason.onCall") : callError(w, v.id);
    return el(
      "div",
      { class: "bar-row row", "data-driver": v.id },
      createIcon("driver"),
      el("span", { class: "bar-name" }, driverName(v)),
      el("span", { class: "bar-quiet", title: quiet }, quiet),
      el("span", { class: "tag dim" }, stanceTag(w, v, hostileToPlayer(w, v))),
      reasonButton([t("town.bar.radio")], () => this.run((x) => callVehicle(x, v.id), true), reason),
    );
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

  private hintMounts(defId: string): (on: boolean) => void {
    return (on) => this.inventory.hintMounts(on ? mountCellsOf(defId) : null);
  }

  private marketTabs(def: ShopDef): HTMLElement | null {
    if (!def.charts) return null;
    const tabs: MarketTab[] = ["goods", "charts"];
    const buttons = tabs.map((tab) =>
      el(
        "button",
        {
          class: this.marketTab === tab ? "on" : "",
          "data-market-tab": tab,
          onclick: () => {
            this.marketTab = tab;
            this.showList();
          },
        },
        createIcon(tab === "charts" ? TAB_ICON.charts : TAB_ICON.market),
        t(`trade.tab.${tab === "charts" ? "charts" : "market"}`),
      ),
    );
    return el("div", { class: "tabs sub" }, ...buttons);
  }

  private market(w: World, shopId: string, def: ShopDef): HTMLElement {
    const state = shopState(w, shopId);
    return el(
      "div",
      {},
      this.marketTabs(def),
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
    const held = onOrder(w, shopId, g);
    const buyReason = (n: number) => (held ? t("trade.onOrder") : stock < n ? stockReason(stock) : this.lotReason(w, shopId, g, n));
    return el(
      "div",
      { class: "trade buy" },
      caption(GOODS_COLUMNS.buy, true),
      stock > 0 && !held ? priceEl(buy, shortBy(w.player.money, buy) === null, hint) : el("span", { class: "price" }),
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
      this.stockedBuyCell(w, shopId, g, marketHint(w, def, state, g), stock),
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
      profitCell(tradeEstimate(w, held, sell, g)),
    );
  }

  private buyParts(w: World, shopId: string): HTMLElement {
    const me = playerVehicle(w);
    const stock = shopState(w, shopId).stock;
    const shown = stock.filter((p) => this.stockFilter === "all" || kindFilter(partDef(p.defId).kind) === this.stockFilter);
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
      onHover: this.hintMounts(p.defId),
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

  private paint(w: World): HTMLElement {
    const current = w.player.paint;
    const plan = livePaintPlan(current, this.paintPlan);
    const buy = plan ? this.priceButton(w, t("goods.buy"), paintPrice(w), (x) => repaint(x, plan), null, "repaint") : null;
    return paintTab({
      current,
      plan,
      chassisId: playerVehicle(w).chassisId,
      pick: (slot, id) => {
        this.paintPlan = planWithSlot(current, this.paintPlan, slot, id);
        this.render();
      },
      pickScheme: (scheme) => {
        this.paintPlan = { ...scheme };
        this.render();
      },
      buy,
    });
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
  procure: { now: "contract.deliver", at: "contract.deliverAt" },
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
  if (c.kind === "survey") return surveyPlacesLeft(c);
  if (c.kind === "haul" || c.kind === "procure") return t("contract.needMore", { n: c.units - (goodsCount(playerVehicle(w))[c.good] ?? 0), good: goodName(c.good) });
  if (c.kind === "search") return t("contract.handOverFirst");
  if (c.kind === "claim") return playerVehicle(w).items.some((it) => it.kind === "part" && it.part.id === c.partId) ? t("contract.unmountFirst") : t("contract.needsPart");
  if (c.kind === "rescue") return t("contract.notMet");
  throw new Error(`An ${c.kind} contract is never handed in at a counter`);
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
  paint: "paint",
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

function sectionReason(reason: "noLocals" | "noDrivers"): Msg {
  return t(reason === "noLocals" ? "town.reason.noLocals" : "town.reason.noDrivers");
}

function stockCount(stock: PartInstance[], f: StockFilter): number {
  return f === "all" ? stock.length : stock.filter((p) => kindFilter(partDef(p.defId).kind) === f).length;
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

export function marketHint(w: World, def: ShopDef, state: ShopState, good: string): PriceHint | null {
  return knowsMarket(w) ? pressureHint(def, state, good) : null;
}

export function tradeEstimate(w: World, held: number, sell: number, good: string): SaleEstimate {
  return knowsMarket(w) ? saleEstimate(held, sell, w.player.costBasis[good]) : { kind: "none" };
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
  return Object.entries(goods).map(([good, n]) => crateIcon(good, n));
}

function crateIcon(good: string, n: number): HTMLElement {
  return el("span", { class: "recipe-good" }, n > 1 ? el("span", { class: "num" }, num(n, "int")) : null, createItemIcon(good));
}

export function newsWell(w: World): HTMLElement | null {
  const news = liveRoadNews(w);
  if (news.length === 0) return null;
  return el("div", { class: "road-news" }, el("div", { class: "news-head dim" }, t("news.head")), ...[...news].reverse().map((n) => newsRow(w, n)));
}

const NEWS_VERB = { robbed: "news.robbed", destroyed: "news.destroyed", knockedOut: "news.knockedOut" } as const;

const NEWS_REASON = {
  robbed: "news.reason.robbed",
  destroyed: "news.reason.destroyed",
  knockedOut: "news.reason.knockedOut",
} as const satisfies Record<RoadNews["kind"], string>;

function newsRow(w: World, n: RoadNews): HTMLElement {
  return el(
    "div",
    { class: "news-row row", title: t(NEWS_REASON[n.kind]) },
    crateIcon(n.good, n.units),
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
  if (c.kind === "haul" || c.kind === "procure") return (goodsCount(me)[c.good] ?? 0) >= c.units;
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

  private hintMounts(defId: string): (on: boolean) => void {
    return (on) => this.inventory.hintMounts(on ? mountCellsOf(defId) : null);
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
      profitCell(tradeEstimate(w, held, sell, g)),
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
      onHover: this.hintMounts(p.defId),
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

function proseOf(shopId: string, page: TownPage): Msg {
  return page === null ? placeProse(shopId) : t(`town.line.${page}`);
}

function choiceButton(c: TownChoice, i: number): HTMLElement {
  const check = c.reason ? el("span", { class: "quest-check" }, c.reason) : null;
  const button = reasonButton([check, t("quest.choice", { n: i + 1, text: c.label })], c.go, c.reason);
  button.className = c.id === "back" || c.id === "leave" ? "quest-choice compact" : "quest-choice";
  button.dataset.townGo = c.id;
  return button;
}

function issuerName(w: World, c: CrimeCase): Msg {
  if (c.issuer.kind === "faction") return factionName(c.issuer.faction);
  const id = c.issuer.id;
  return w.vehicles.some((v) => v.id === id) ? vehicleTitle(w, vehicleById(w, id)) : t("log.someDriver");
}
