import { ECONOMY } from "../data/goods";
import { SHOPS, SHORT_PRESSURE, siteRecipes, type Recipe, type ShopDef } from "../data/market";
import { knowsMarket, goodStock, pressureOf, shopState, stockShort, type ShopState } from "../sim/market";
import { onRelief, recipeRunning } from "../sim/production";
import { liveRoadNews } from "../sim/road-news";
import { PAINT_SCHEMES, PAINT_SLOTS, PALETTE, PALETTE_IDS, samePaint, type PaletteId, type TruckPaint } from "../data/chassis";
import { playerVehicle, vehicleById } from "../sim/damage";
import { basicsRepairCost, chassisPrice, chassisTradeIn, repairCost, supplyRoom, type Supply } from "../sim/economy";
import { fuelCap, suppliesCap } from "../sim/stats";
import { getResources } from "../sim/resources";
import type { CrimeCase, RoadNews, Vehicle, World } from "../sim/types";
import { caseOwed, deskRows, payAtDesk, settleAtDesk, type SettlementQuote } from "../sim/crime";
import { list, num, PLUS, SPACE, t, type Msg } from "../text/msg";
import { chassisAbilityLine, chassisAbilityName, chassisName, factionName, goodName, refusalText, siteName, vehicleTitle } from "../text/names";
import { chassisMap, chassisPortrait, chassisStats, createIcon, createItemIcon, createItemTipIcon, diffStats, itemTip, statGrid } from "./cards";
import { el, type Child } from "./dom";
import { caseVictimName, clock, estimateText, estimateTitle, gameHours, GOODS_COLUMNS, PROFIT_HEAD_TITLE, saleEstimate, type SaleEstimate } from "./format";
import { seesAll } from "./see-all";
import { RowSlots, type SlotRow } from "./row-slots";
import { coinEl, fuelLiters, moneyEl, moneyMsg, moneyNum } from "./units";

export type ShopCommand = (w: World) => World;

export type ShopButtons = {
  button(label: Msg, cmd: ShopCommand, reason?: Msg | null, key?: string, title?: Msg | null): HTMLElement;
  priceButton(w: World, verb: Msg, price: number, cmd: ShopCommand, reason?: Msg | null, key?: string): HTMLElement;
};

export function repairBar(w: World, buttons: ShopButtons, repair: { basics: ShopCommand; all: ShopCommand }, truck: Vehicle = playerVehicle(w)): HTMLElement {
  const button = (verb: Msg, cost: number, cmd: ShopCommand, key: string) =>
    cost === 0 ? buttons.button(verb, cmd, t("trade.nothingToRepair"), key) : buttons.priceButton(w, verb, cost, cmd, null, key);
  return el(
    "div",
    { class: "town-repair" },
    createIcon("tools"),
    button(t("trade.repairBasicsVerb"), basicsRepairCost(w, truck), repair.basics, "repairBasics"),
    button(t("trade.repairAllVerb"), repairCost(w, truck), repair.all, "repairAll"),
  );
}

export type SupplyLimit = { room: number; tag: HTMLElement | null };

type SupplyBuy = (w: World, k: Supply, n: number) => World;

export function supplyRow(w: World, k: Supply, buttons: ShopButtons, buy: SupplyBuy, truck: Vehicle = playerVehicle(w)): HTMLElement {
  return limitedSupplyRow(w, k, buttons, buy, truck, { room: supplyRoom(w, k, truck), tag: null });
}

export function limitedSupplyRow(w: World, k: Supply, buttons: ShopButtons, buy: SupplyBuy, truck: Vehicle, limit: SupplyLimit): HTMLElement {
  const room = limit.room;
  const price = ECONOMY.supplyPrice[k];
  const afford = Math.min(room, Math.floor(w.player.money / price));
  const amount = (n: number) => supplyAmount(k, n);
  const reason = room < 1 ? t("trade.full") : shortBy(w.player.money, price);
  return supplyLine(k, getResources(w, truck)[k], supplyCap(w, k, truck), null, price, shortBy(w.player.money, price) === null, [
    buttons.button(t("trade.plusAmount", { amount: amount(1) }), (x) => buy(x, k, 1), reason),
    buttons.button(afford > 0 ? t("trade.fill", { amount: amount(afford) }) : t("trade.fillBare"), (x) => buy(x, k, afford), reason),
  ], limit.tag);
}

export type PriceHint = { tone: "good" | "bad" | ""; title: Msg };

export function shortBy(have: number, price: number): Msg | null {
  return have >= price ? null : t("trade.needMore", { price: moneyMsg(price - have) });
}

export function supplyAmount(k: Supply, n: number): Msg {
  return k === "fuel" ? t("trade.liters", { n: fuelLiters(n) }) : num(Math.round(n * 10) / 10, "dec");
}

export function supplyCap(w: World, k: Supply, truck: Vehicle = playerVehicle(w)): number {
  return k === "fuel" ? fuelCap(truck) : suppliesCap(truck);
}

export function supplyUnit(k: Supply): Msg {
  return k === "fuel" ? t("trade.perUnit", { unit: supplyAmount(k, 1) }) : t("trade.eachUnit");
}

export function supplyLine(k: Supply, have: number, cap: number, theirs: HTMLElement | null, price: number, payable: boolean, buttons: HTMLElement[], tag: HTMLElement | null = null): HTMLElement {
  const amount = (n: number) => supplyAmount(k, n);
  return el(
    "div",
    { class: "good-row row" },
    el(
      "div",
      { class: "good-name supply" },
      createIcon(k),
      el("div", { class: "service-meter" }, el("span", {}, t("trade.ofCap", { have: amount(have), cap: amount(cap) })), bar(have / cap)),
      tag,
    ),
    theirs,
    el("div", { class: "trade buy wide" }, caption(GOODS_COLUMNS.buy, true), priceEl(price, payable, { tone: "", title: supplyUnit(k) }), ...buttons),
  );
}

export function priceSpan(price: number, payable: boolean): HTMLElement {
  return el("span", { class: payable ? "" : "bad" }, moneyEl(price));
}

export function reasonAttrs(reason: Msg | null, title: Msg | null): Record<string, Msg | string | undefined> {
  return { class: "btn-s", "aria-disabled": reason ? "true" : undefined, title: reason ?? title ?? undefined };
}

export function reasonButton(label: Child[], click: () => void, reason: Msg | null, key = "", title: Msg | null = null): HTMLElement {
  return el("button", { ...reasonAttrs(reason, title), "data-key": key || undefined, onclick: () => reason || click() }, ...label);
}

export function priceEl(price: number, payable = true, hint: PriceHint | null = null): HTMLElement {
  return el("span", { class: `price ${priceTone(payable, hint)}`.trim(), title: hint?.title }, moneyNum(price));
}

export function priceTone(payable: boolean, hint: PriceHint | null): string {
  return payable ? (hint?.tone ?? "") : "bad";
}

export function caption(text: Msg, coin = false): HTMLElement {
  return el("span", { class: "cap" }, text, coin ? coinEl() : null);
}

export function priceHead(label: Msg): HTMLElement {
  return el("span", { class: "price-head" }, label, coinEl());
}

export function keepFocus(root: HTMLElement, render: () => void): void {
  const key = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.key : undefined;
  render();
  if (!key) return;
  root.querySelector<HTMLElement>(`button[data-key="${key}"]:not(:disabled)`)?.focus({ preventScroll: true });
}

export function bar(share: number): HTMLElement {
  return el("div", { class: "meter" }, el("div", { style: `width:${Math.max(0, Math.min(1, share)) * 100}%` }));
}

function paletteHex(id: PaletteId): string {
  return `#${PALETTE[id].toString(16).padStart(6, "0")}`;
}

export function paletteStyle(id: PaletteId): string {
  return `--paint:${paletteHex(id)}`;
}

export function schemeStyle(scheme: TruckPaint): string {
  return PAINT_SLOTS.map((slot) => `--paint-${slot}:${paletteHex(scheme[slot])}`).join(";");
}

export function planWithSlot(current: TruckPaint, plan: TruckPaint | null, slot: PaintSlot, id: PaletteId): TruckPaint {
  return { ...(plan ?? current), [slot]: id };
}

export function livePaintPlan(current: TruckPaint, plan: TruckPaint | null): TruckPaint | null {
  return plan && !samePaint(plan, current) ? plan : null;
}

export type PaintSlot = (typeof PAINT_SLOTS)[number];

export type PaintChoice = {
  current: TruckPaint;
  plan: TruckPaint | null;
  chassisId: string;
  pick: (slot: PaintSlot, id: PaletteId) => void;
  pickScheme: (scheme: TruckPaint) => void;
  buy: HTMLElement | null;
};

export function paintTab(choice: PaintChoice): HTMLElement {
  const shown = choice.plan ?? choice.current;
  return el(
    "div",
    { class: "paint-tab" },
    el("div", { class: "paint-preview" }, chassisPortrait(choice.chassisId, shown)),
    el("div", { class: "paint-slots" }, schemeRow(choice), ...PAINT_SLOTS.map((slot) => paintSlot(choice, slot)), el("div", { class: "paint-buy" }, choice.buy)),
  );
}

function schemeRow(choice: PaintChoice): HTMLElement {
  const chips = PAINT_SCHEMES.map((scheme, i) => {
    const current = samePaint(scheme, choice.current);
    return el(
      "button",
      {
        class: `btn-s${!current && choice.plan && samePaint(scheme, choice.plan) ? " planned" : ""}`,
        "data-scheme": String(i),
        "aria-pressed": String(current),
        "aria-label": num(i + 1, "int"),
        onclick: () => choice.pickScheme(scheme),
      },
      el("span", { class: "paint-scheme", style: schemeStyle(scheme) }, el("span", { class: "paint-scheme-body" }), el("span", { class: "paint-scheme-cab" }), el("span", { class: "paint-scheme-gear" })),
    );
  });
  return el("div", { class: "paint-slot", "data-slot": "scheme" }, el("span"), el("div", { class: "option-switch paint-switch", role: "group" }, ...chips));
}

function paintSlot(choice: PaintChoice, slot: PaintSlot): HTMLElement {
  const planned = choice.plan?.[slot];
  const swatches = PALETTE_IDS.map((id, i) =>
    el(
      "button",
      {
        class: `btn-s${planned === id && id !== choice.current[slot] ? " planned" : ""}`,
        "data-paint": id,
        "aria-pressed": String(choice.current[slot] === id),
        "aria-label": num(i + 1, "int"),
        onclick: () => choice.pick(slot, id),
      },
      el("span", { class: "paint-swatch", style: paletteStyle(id) }),
    ),
  );
  const name = SLOT_NAMES[slot]();
  return el("div", { class: "paint-slot", "data-slot": slot }, el("span", { class: "paint-slot-name" }, name), el("div", { class: "option-switch paint-switch", role: "group", "aria-label": name }, ...swatches));
}

const SLOT_NAMES: Record<PaintSlot, () => Msg> = { body: () => t("paint.body"), cab: () => t("paint.cab"), gear: () => t("paint.gear") };

export type SwapOffer = { reason: Msg | null; swap: () => void };

export function truckCards(w: World, ids: readonly string[], offer: (id: string) => SwapOffer, slots: RowSlots, list: string): HTMLElement {
  const mine = playerVehicle(w).chassisId;
  const cards = ids.map((id) => {
    const own = mine === id;
    const swap = own ? null : swapButton(w, id, offer);
    const card = el(
      "div",
      { class: `card tile truck-card${own ? " own" : ""}` },
      el("div", { class: "truck-pics" }, chassisPortrait(id, w.player.paint), chassisMap(id)),
      el(
        "div",
        { class: "truck-body" },
        el(
          "div",
          { class: "truck-head" },
          el("div", { class: "card-name" }, el("b", {}, chassisName(id))),
          swap ?? el("span", { class: "dim" }, t("vehicle.yours")),
        ),
        chassisFeatureRow(id),
        statGrid(diffStats(chassisStats(id), own ? null : chassisStats(mine))),
      ),
    );
    return { id, row: card, action: swap, done: t("trade.done.swapped") };
  });
  return el("div", { class: "cards trucks" }, ...slots.place(list, cards));
}

function chassisFeatureRow(id: string): HTMLElement | null {
  const name = chassisAbilityName(id);
  const line = chassisAbilityLine(id);
  if (!name || !line) return null;
  return el("div", { class: "dim chassis-feature" }, el("b", {}, name), SPACE, line);
}

function swapButton(w: World, id: string, makeOffer: (id: string) => SwapOffer): HTMLElement {
  const offer = makeOffer(id);
  const cost = chassisPrice(w, id);
  const price = cost < 0 ? el("span", { class: "good" }, PLUS, moneyEl(-cost)) : priceSpan(cost, offer.reason === null);
  const title = offer.reason ? null : t("trade.includesTradeIn", { price: moneyMsg(chassisTradeIn(w)) });
  return reasonButton([t("trade.swapVerb"), SPACE, price], offer.swap, offer.reason, "", title);
}

type DeskCommand = (cmd: (w: World) => World) => void;

export function deskBody(w: World, run: DeskCommand, slots: RowSlots): HTMLElement {
  const rows = deskRows(w);
  const cases = slots.place("cases", rows.cases.map((c) => caseRow(w, c, run)));
  const ids = rows.cases.map((c) => c.id);
  const payAllCommand = () => {
    slots.actOn("cases", ids);
    run((x) => payAtDesk(x, ids));
  };
  const payAll = rows.cases.length > 1 ? el("div", { class: "desk-all" }, payButton(w, t("desk.payAll"), rows.owed, priceSpan(rows.owed, w.player.money >= rows.owed), payAllCommand)) : null;
  const settles = slots.place("settles", rows.settlements.map((q) => settleRow(w, q, run)));
  return el(
    "div",
    { class: "desk-body" },
    cases.length > 0 ? el("div", { class: "desk-group" }, ...cases, payAll) : null,
    settles.length > 0 ? el("div", { class: "desk-group" }, ...settles) : null,
    cases.length === 0 && settles.length === 0 ? el("p", { class: "dim" }, t("desk.empty")) : null,
  );
}

function caseRow(w: World, c: CrimeCase, run: DeskCommand): SlotRow {
  const victim = caseVictimName(w, c);
  const price = caseOwed(c);
  const pay = payButton(w, t("desk.pay"), price, casePrice(c, w.player.money >= price), () => run((x) => payAtDesk(x, [c.id])));
  const row = el(
    "div",
    { class: "row desk-case" },
    el("span", {}, t(`desk.case.${c.offense}`, { victim })),
    el("span", { class: "dim" }, t("desk.filed", { issuer: issuerName(w, c), site: siteName(c.site), when: clock(c.turn).full })),
    casePay(pay, c),
  );
  return { id: c.id, row, action: pay, done: t("trade.done.paid") };
}

function payButton(w: World, verb: Msg, price: number, shown: HTMLElement, click: () => void): HTMLElement {
  return reasonButton([verb, SPACE, shown], click, shortBy(w.player.money, price));
}

function settleRow(w: World, q: SettlementQuote, run: DeskCommand): SlotRow {
  const short = shortBy(w.player.money, q.price);
  const reason = q.refusal && q.refusal.id !== "noMoney" ? refusalText(w, q.refusal) : short;
  const label = [t("desk.settle"), SPACE, priceSpan(q.price, short === null)];
  const settle = reasonButton(label, () => run((x) => settleAtDesk(x, q.faction)), reason, "", t("desk.settleAfter", { faction: factionName(q.faction) }));
  const row = el("div", { class: "row desk-settle" }, el("span", {}, factionName(q.faction)), el("span", { class: "tag bad" }, t("band.hostile")), settle);
  return { id: q.faction, row, action: settle, done: t("trade.done.settled") };
}

function issuerName(w: World, c: CrimeCase): Msg {
  if (c.issuer.kind === "faction") return factionName(c.issuer.faction);
  if (c.issuer.kind === "shop") return siteName(c.issuer.shop);
  const id = c.issuer.id;
  return w.vehicles.some((v) => v.id === id) ? vehicleTitle(w, vehicleById(w, id)) : t("log.someDriver");
}

export function casePrice(c: CrimeCase, payable: boolean): HTMLElement {
  if (c.restitution === 0) return priceSpan(caseOwed(c), payable);
  return el("span", { class: `case-price${payable ? "" : " bad"}` }, moneyEl(caseOwed(c)));
}

function casePay(button: HTMLElement, c: CrimeCase): HTMLElement {
  return c.restitution === 0 ? button : el("span", { class: "case-pay" }, button, casePriceTip(c));
}

export function casePriceTip(c: CrimeCase): HTMLElement {
  return el("span", { class: "tooltip case-price-tip", role: "tooltip" }, priceTipRow(t("desk.base"), c.owed, "base"), priceTipRow(t("desk.restitution"), c.restitution, "down"));
}

function priceTipRow(label: Msg, amount: number, tone: "base" | "down"): HTMLElement {
  return el("div", { class: `tooltip-row ${tone}` }, el("span", {}, label), el("span", { class: "num" }, moneyEl(amount)));
}

const PROFIT_TONE = { gain: "better", loss: "worse", even: "same" } as const;

export function goodsHead(withTheirs: boolean, withStock = false): HTMLElement {
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

export function suppliesHead(): HTMLElement {
  return el("div", { class: "goods-head row dim" }, el("span", {}), theirsHead(), priceHead(GOODS_COLUMNS.buy));
}

function theirsHead(): HTMLElement {
  return el("span", { class: "end" }, GOODS_COLUMNS.theirs);
}

export function countCell(cls: "theirs" | "held" | "stock", n: number, text: Msg = num(n, "int"), title: Msg | null = null): HTMLElement {
  return el("div", { class: `count ${cls}`, title: title ?? undefined }, caption(GOODS_COLUMNS[cls]), el("span", { class: n === 0 ? "num dim" : "num" }, text));
}

export function owedTitle(owed: number): Msg | null {
  return owed > 0 ? t("trade.owed", { n: owed }) : null;
}

export function marketHint(w: World, def: ShopDef, state: ShopState, good: string): PriceHint | null {
  return knowsMarket(w) ? pressureHint(def, state, good) : null;
}

export function tradeEstimate(w: World, held: number, sell: number, good: string): SaleEstimate {
  return knowsMarket(w) ? saleEstimate(held, sell, w.player.costBasis[good]) : { kind: "none" };
}

export function profitCell(e: SaleEstimate): HTMLElement {
  if (e.kind === "none") return el("div", { class: "profit" });
  const tone = e.kind === "unrecorded" ? "dim" : `delta ${PROFIT_TONE[e.kind]}`;
  return el("div", { class: "profit", title: estimateTitle(e) }, caption(GOODS_COLUMNS.profit, true), el("span", { class: `num ${tone}` }, estimateText(e)));
}

export function pressureHint(def: ShopDef, state: ShopState, good: string): PriceHint | null {
  if (stockShort(def.id, state, good)) return { tone: "bad", title: t("trade.hint.short") };
  if (pressureOf(def.id, good, goodStock(state, good)) <= -SHORT_PRESSURE) return { tone: "good", title: t("trade.hint.flooded") };
  if (def.makes.includes(good)) return { tone: "good", title: t("trade.hint.cheap") };
  if (def.needs.includes(good)) return { tone: "bad", title: t("trade.hint.dear") };
  return null;
}

function goodRoutesTip(good: string): Msg {
  const sites = (names: string[]) => names.map(siteName);
  const makers = Object.values(SHOPS).filter((s) => s.makes.includes(good)).map((s) => s.id);
  const users = Object.values(SHOPS).filter((s) => s.needs.includes(good)).map((s) => s.id);
  if (users.length === 0) return t("trade.goodMadeOnly", { makers: list(sites(makers)) });
  return t("trade.goodRoutes", { makers: list(sites(makers)), users: list(sites(users)) });
}

export function goodRoutesTitle(good: string): Msg | null {
  return seesAll() ? goodRoutesTip(good) : null;
}

export function showsRelief(w: World, shopId: string, good: string): boolean {
  return seesAll() && onRelief(w, shopId, good);
}

export function stockedGoodName(w: World, shopId: string, g: string): HTMLElement {
  const relief = showsRelief(w, shopId, g) ? el("span", { class: "tag bad", title: t("trade.reliefTip") }, t("trade.relief")) : null;
  return el("div", { class: "good-name" }, createItemTipIcon(g), el("b", { title: goodRoutesTitle(g) ?? itemTip(g) }, goodName(g)), relief);
}

export function recipeLine(w: World, shopId: string): HTMLElement {
  const event = shopState(w, shopId).event;
  return el("div", { class: "recipes" }, ...siteRecipes(shopId).map((r) => recipeChip(w, shopId, r, event?.recipe === r.id ? event.kind : null)));
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
