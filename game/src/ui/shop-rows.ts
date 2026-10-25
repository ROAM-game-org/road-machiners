import { ECONOMY } from "../data/goods";
import { PAINT_SCHEMES, PAINT_SLOTS, PALETTE, PALETTE_IDS, samePaint, type PaletteId, type TruckPaint } from "../data/chassis";
import { playerVehicle, vehicleById } from "../sim/damage";
import { basicsRepairCost, chassisPrice, chassisTradeIn, repairCost, supplyRoom, type Supply } from "../sim/economy";
import { mountedParts } from "../sim/grid";
import { fuelCap, suppliesCap } from "../sim/stats";
import { getResources } from "../sim/resources";
import type { CrimeCase, Vehicle, World } from "../sim/types";
import { caseOwed, deskRows, payAtDesk, settleAtDesk, type SettlementQuote } from "../sim/crime";
import { num, PLUS, SPACE, t, type Msg } from "../text/msg";
import { chassisAbilityLine, chassisAbilityName, chassisName, factionName, refusalText, siteName, vehicleTitle } from "../text/names";
import { chassisMap, chassisPortrait, chassisStats, createIcon, diffStats, statGrid } from "./cards";
import { el, type Child } from "./dom";
import { clock, GOODS_COLUMNS } from "./format";
import { coinEl, fuelLiters, moneyEl, moneyMsg, moneyNum } from "./units";

export type ShopCommand = (w: World) => World;

export type ShopButtons = {
  button(label: Msg, cmd: ShopCommand, reason?: Msg | null, key?: string, title?: Msg | null): HTMLElement;
  priceButton(w: World, verb: Msg, price: number, cmd: ShopCommand, reason?: Msg | null, key?: string): HTMLElement;
};

export function repairBar(w: World, buttons: ShopButtons, repair: { basics: ShopCommand; all: ShopCommand }, truck: Vehicle = playerVehicle(w)): HTMLElement {
  const broken = mountedParts(truck).filter((p) => p.hp === 0).length;
  const button = (verb: Msg, cost: number, cmd: ShopCommand, key: string) =>
    cost === 0 ? buttons.button(verb, cmd, t("trade.nothingToRepair"), key) : buttons.priceButton(w, verb, cost, cmd, null, key);
  return el(
    "div",
    { class: "town-repair" },
    createIcon("tools"),
    broken ? el("span", { class: "bad" }, t("trade.broken", { n: broken })) : null,
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

export function truckCards(w: World, ids: readonly string[], offer: (id: string) => SwapOffer): HTMLElement {
  const mine = playerVehicle(w).chassisId;
  const cards = ids.map((id) => {
    const own = mine === id;
    return el(
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
          own ? el("span", { class: "dim" }, t("vehicle.yours")) : swapButton(w, id, offer),
        ),
        chassisFeatureRow(id),
        statGrid(diffStats(chassisStats(id), own ? null : chassisStats(mine))),
      ),
    );
  });
  return el("div", { class: "cards trucks" }, ...cards);
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

export function deskBody(w: World, run: DeskCommand): HTMLElement {
  const rows = deskRows(w);
  const cases = rows.cases.map((c) => caseRow(w, c, run));
  const ids = rows.cases.map((c) => c.id);
  const payAll = rows.cases.length > 1 ? el("div", { class: "desk-all" }, payButton(w, t("desk.payAll"), rows.owed, priceSpan(rows.owed, w.player.money >= rows.owed), () => run((x) => payAtDesk(x, ids)))) : null;
  const settles = rows.settlements.map((q) => settleRow(w, q, run));
  return el(
    "div",
    { class: "desk-body" },
    cases.length > 0 ? el("div", { class: "desk-group" }, ...cases, payAll) : null,
    settles.length > 0 ? el("div", { class: "desk-group" }, ...settles) : null,
    cases.length === 0 && settles.length === 0 ? el("p", { class: "dim" }, t("desk.empty")) : null,
  );
}

function caseRow(w: World, c: CrimeCase, run: DeskCommand): HTMLElement {
  const victim = w.vehicles.some((v) => v.id === c.victim) ? vehicleTitle(w, vehicleById(w, c.victim)) : t("log.someDriver");
  const price = caseOwed(c);
  return el(
    "div",
    { class: "row desk-case" },
    el("span", {}, t(`desk.case.${c.offense}`, { victim })),
    el("span", { class: "dim" }, t("desk.filed", { issuer: issuerName(w, c), site: siteName(c.site), when: clock(c.turn).full })),
    payButton(w, t("desk.pay"), price, casePrice(c, w.player.money >= price), () => run((x) => payAtDesk(x, [c.id]))),
  );
}

function payButton(w: World, verb: Msg, price: number, shown: HTMLElement, click: () => void): HTMLElement {
  return reasonButton([verb, SPACE, shown], click, shortBy(w.player.money, price));
}

function settleRow(w: World, q: SettlementQuote, run: DeskCommand): HTMLElement {
  const short = shortBy(w.player.money, q.price);
  const reason = q.refusal && q.refusal.id !== "noMoney" ? refusalText(w, q.refusal) : short;
  const label = [t("desk.settle"), SPACE, priceSpan(q.price, short === null)];
  return el(
    "div",
    { class: "row desk-settle" },
    el("span", {}, factionName(q.faction)),
    el("span", { class: "tag bad" }, t("band.hostile")),
    reasonButton(label, () => run((x) => settleAtDesk(x, q.faction)), reason, "", t("desk.settleAfter", { faction: factionName(q.faction) })),
  );
}

function issuerName(w: World, c: CrimeCase): Msg {
  if (c.issuer.kind === "faction") return factionName(c.issuer.faction);
  const id = c.issuer.id;
  return w.vehicles.some((v) => v.id === id) ? vehicleTitle(w, vehicleById(w, id)) : t("log.someDriver");
}

export function casePrice(c: CrimeCase, payable: boolean): HTMLElement {
  if (c.restitution === 0) return priceSpan(caseOwed(c), payable);
  return el(
    "span",
    { class: `case-price${payable ? "" : " bad"}` },
    moneyEl(caseOwed(c)),
    el("span", { class: "tooltip case-price-tip", role: "tooltip" }, priceTipRow(t("desk.base"), c.owed, "base"), priceTipRow(t("desk.restitution"), c.restitution, "down")),
  );
}

function priceTipRow(label: Msg, cents: number, tone: "base" | "down"): HTMLElement {
  return el("div", { class: `tooltip-row ${tone}` }, el("span", {}, label), el("span", { class: "num" }, moneyEl(cents)));
}
