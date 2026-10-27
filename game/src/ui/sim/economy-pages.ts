import { TIME } from "../../data/time";
import type { EconFlow, EconGood, EconLine, EconShipment, EconShop, EconTrade, Economy } from "../../sim/progression/sim-economy";
import { devEl as el } from "../dom";
import { moneyAmount, moneyDelta, moneyText } from "../units";
import { sparkOf, type SparkSize } from "./economy-draw";
import { tradeSkipReason, whyShort, type MarketHistory } from "./economy-reads";
import { swatch } from "./run-chart";

const TURNS_PER_HOUR = TIME.turnsPerDay / 24;

export type Nav = { town(id: string): void; good(id: string): void; truck(id: string): void };
export type Ctx = { economy: Economy; history: MarketHistory; colors: Map<string, string>; nav: Nav };
export type Tone = "bad" | "warn" | "good" | "";

const RUN_TONE: Record<EconLine["run"], Tone> = { running: "", worn: "warn", fallback: "warn", stopped: "bad" };
const EVENT_LOOK = { surge: "--good", breakdown: "--path-hold", robbed: "--danger-bright", destroyed: "--danger-bright", knockedOut: "--danger-bright" };
const EVENT_WORD = { surge: "Surge", breakdown: "Breakdown", robbed: "Robbed haul", destroyed: "Truck destroyed", knockedOut: "Truck knocked out" };

export function toneClass(base: string, tone: Tone): string {
  return tone === "" ? base : `${base} ${tone}`;
}

export function levelTone(good: EconGood): Tone {
  if (good.stock <= 0) return "bad";
  return good.stock <= good.shortBelow ? "warn" : "";
}

export function link(label: string | Node, action: () => void, extra = ""): HTMLElement {
  return el("span", { class: `sim-link ${extra}`.trim(), role: "button", tabindex: 0, onclick: action }, label);
}

export function goodLink(ctx: Ctx, id: string, name: string): HTMLElement {
  return link(el("span", { class: "sim-good" }, swatch(ctx.colors.get(id)!), name), () => ctx.nav.good(id));
}

export function townLink(ctx: Ctx, shop: EconShop): HTMLElement {
  return link(shop.name, () => ctx.nav.town(shop.id));
}

function hoursText(turns: number): string {
  return `${Math.max(1, Math.round(turns / TURNS_PER_HOUR))} h`;
}

function trendHead(ctx: Ctx): string {
  return `Last ${hoursText(ctx.economy.turn - ctx.history.first)}`;
}

export function stockSpark(ctx: Ctx, shop: EconShop, good: EconGood, size: SparkSize): HTMLElement {
  const series = ctx.history.series(shop.id, good, ctx.economy);
  const span = { first: ctx.history.first, last: ctx.economy.turn };
  const title = `${good.name}, ${shop.name}: ${good.stock} of ${good.target} now, from ${Math.min(...series.stock)} to ${Math.max(...series.stock)} over ${hoursText(span.last - span.first)}`;
  return sparkOf({ series, span, size, of: "stock", target: good.target, shortBelow: good.shortBelow }, title);
}

export function priceSpark(ctx: Ctx, shop: EconShop, good: EconGood, size: SparkSize): HTMLElement {
  const series = ctx.history.series(shop.id, good, ctx.economy);
  const span = { first: ctx.history.first, last: ctx.economy.turn };
  const title = `${good.name}, ${shop.name}: buy price from ${moneyText(Math.min(...series.buy))} to ${moneyText(Math.max(...series.buy))} over ${hoursText(span.last - span.first)}`;
  return sparkOf({ series, span, size, of: "buy" }, title);
}

function legend(ctx: Ctx, rows: { shop: EconShop; good: EconGood }[]): HTMLElement | null {
  const kinds = new Set(rows.flatMap((r) => ctx.history.series(r.shop.id, r.good, ctx.economy).events.map((e) => e.kind)));
  if (kinds.size === 0) return null;
  return el("div", { class: "sim-event-key" }, ...[...kinds].map((k) => el("span", {}, swatch(EVENT_LOOK[k]), EVENT_WORD[k])));
}

function lineRow(shop: EconShop, line: EconLine): HTMLElement {
  const needs = line.missing.length > 0 ? `Needs ${line.missing.map((m) => `${m.need} ${m.name}, has ${m.have}`).join(", ")}` : null;
  return el("div", { class: "sim-line-row" },
    el("span", {}, line.name),
    el("span", { class: toneClass("tag", RUN_TONE[line.run]) }, line.runText),
    el("span", { class: "dim num" }, `Every ${Number(line.everyHours.toFixed(1))} h`),
    el("span", { class: "sim-recipe" }, line.inputs.length === 0 ? `Makes ${line.outputs.join(", ")}` : `${line.inputs.join(", ")} to ${line.outputs.join(", ")}`),
    needs ? el("span", { class: "sim-recipe-event bad" }, needs) : null,
    line.event ? el("span", { class: "sim-recipe-event dim" }, shop.event ? `${line.event}, ${shop.event.hoursLeft} h left` : line.event) : null);
}

function goodRows(ctx: Ctx, shop: EconShop, good: EconGood): HTMLElement[] {
  const tone = levelTone(good);
  const row = el("tr", {},
    el("td", {}, goodLink(ctx, good.good, good.name)),
    el("td", { class: toneClass("num", tone) }, String(good.stock), el("span", { class: "dim" }, ` of ${good.target}`)),
    el("td", {}, stockSpark(ctx, shop, good, "row")),
    el("td", { class: "num" }, moneyAmount(good.buy)),
    el("td", { class: "num" }, moneyAmount(good.sell)),
    el("td", {}, priceSpark(ctx, shop, good, "cell")),
    el("td", { class: "sim-tags" }, ...good.tags.filter((t) => t.id !== "short").map((t) => el("span", { class: "tag" }, t.text))));
  if (tone === "") return [row];
  return [row, el("tr", { class: "sim-why-row" }, el("td", { colspan: 7, class: toneClass("sim-why", tone) }, whyShort(ctx.economy, shop, good)))];
}

function goodsTable(ctx: Ctx, shop: EconShop): HTMLElement {
  const heads = ["", "Stock", trendHead(ctx), "Buy, M's", "Sell, M's", "Buy trend", ""];
  const head = el("tr", {}, ...heads.map((h, i) => el("th", { class: i === 1 || i === 3 || i === 4 ? "num" : "" }, h)));
  return el("table", { class: "sim-econ-table sim-econ-goods" }, el("thead", {}, head), el("tbody", {}, ...shop.goods.flatMap((g) => goodRows(ctx, shop, g))));
}

function flowRows(flows: EconFlow[], flowHours: number): HTMLElement {
  const hours = Math.round(flowHours);
  if (flows.length === 0) return el("div", { class: "dim" }, `No stock changes in ${hours} h`);
  const signed = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);
  const rows = flows.map((f) => el("div", { class: "sim-row" }, el("span", {}, `${f.name}, ${f.causeText}`), el("span", { class: f.units < 0 ? "num bad" : "num good" }, signed(f.units))));
  return el("div", { class: "sim-econ-group" }, el("span", { class: "sim-label" }, `Stock changes, last ${hours} h`), ...rows);
}

export function head(title: Node | string, back: { label: string; go: () => void }, note: string | null): HTMLElement {
  return el("div", { class: "sim-head" }, el("span", { class: "sim-card-title" }, title), note ? el("span", { class: "sim-note" }, note) : null, el("button", { class: "btn-s", onclick: back.go }, back.label));
}

export function townPage(ctx: Ctx, shop: EconShop, back: { label: string; go: () => void }): HTMLElement {
  const event = shop.event ? `${shop.event.text}, ${shop.event.hoursLeft} h left` : null;
  const lines = shop.lines.length === 0 ? el("div", { class: "dim" }, "No production") : el("div", { class: "sim-econ-group" }, ...shop.lines.map((l) => lineRow(shop, l)));
  return el("div", { class: "sim-econ-body" }, head(shop.name, back, event), lines, goodsTable(ctx, shop), legend(ctx, shop.goods.map((good) => ({ shop, good }))), flowRows(shop.flows, ctx.economy.flowHours));
}

type Role = "Makes" | "Uses" | "Trades";

function roleOf(ctx: Ctx, shop: EconShop, good: string): Role {
  if (shop.lines.some((l) => l.outputGoods.includes(good))) return "Makes";
  return ctx.economy.edges.some((e) => e.good === good && e.toId === shop.id) ? "Uses" : "Trades";
}

function townRow(ctx: Ctx, shop: EconShop, good: EconGood): HTMLElement {
  const tone = levelTone(good);
  return el("tr", {},
    el("td", {}, townLink(ctx, shop)),
    el("td", { class: "dim" }, roleOf(ctx, shop, good.good)),
    el("td", { class: toneClass("num", tone) }, String(good.stock), el("span", { class: "dim" }, ` of ${good.target}`)),
    el("td", {}, stockSpark(ctx, shop, good, "row")),
    el("td", { class: "num" }, moneyAmount(good.buy)),
    el("td", { class: "num" }, moneyAmount(good.sell)),
    el("td", {}, priceSpark(ctx, shop, good, "cell")));
}

function townsTable(ctx: Ctx, goodId: string): HTMLElement {
  const heads = ["", "", "Stock", trendHead(ctx), "Buy, M's", "Sell, M's", "Buy trend"];
  const head = el("tr", {}, ...heads.map((h, i) => el("th", { class: i === 2 || i === 4 || i === 5 ? "num" : "" }, h)));
  const rows = ctx.economy.shops.flatMap((shop) => shop.goods.filter((g) => g.good === goodId).map((g) => townRow(ctx, shop, g)));
  return el("table", { class: "sim-econ-table sim-econ-goods" }, el("thead", {}, head), el("tbody", {}, ...rows));
}

function carryingRows(ctx: Ctx, goodId: string): HTMLElement {
  const carrying: EconShipment[] = ctx.economy.shipments.filter((s) => s.good === goodId);
  if (carrying.length === 0) return el("div", { class: "dim" }, "No truck carries it now");
  const rows = carrying.map((s) => el("div", { class: "sim-row" },
    link(s.truckName, () => ctx.nav.truck(s.truck)),
    el("span", {}, `${s.units} ${s.units === 1 ? "crate" : "crates"} from ${s.from} to ${s.to}`)));
  return el("div", { class: "sim-econ-group" }, el("span", { class: "sim-label" }, "On the road"), ...rows);
}

export function tradeText(trade: EconTrade): string {
  return `Buy at ${trade.from} for ${moneyText(trade.buy)}, sell at ${trade.to} for ${moneyText(trade.sell)}`;
}

function tradeRow(ctx: Ctx, trade: EconTrade): HTMLElement {
  const skipped = tradeSkipReason(trade);
  const title = `${moneyDelta(trade.gain)} a crate, ${trade.crates} on sale. Fuel ${moneyText(trade.fuel)}, road risk ${moneyText(trade.risk)}.`;
  return el("div", { class: "sim-trade", title },
    goodLink(ctx, trade.good, trade.goodName),
    el("span", {}, tradeText(trade),
      trade.risky ? el("span", { class: "tag warn" }, "Robbed on this road") : null,
      skipped ? el("span", { class: "tag bad" }, skipped) : null),
    el("span", { class: toneClass("num", skipped ? "bad" : "good") }, `${moneyDelta(trade.net)} on ${trade.load} ${trade.load === 1 ? "crate" : "crates"}`),
    el("span", { class: "dim num" }, `Fuel ${moneyText(trade.fuel)}`),
    el("span", { class: "dim num" }, trade.distanceText));
}

export function tradeRows(ctx: Ctx, trades: EconTrade[]): HTMLElement {
  if (trades.length === 0) return el("div", { class: "dim" }, ctx.economy.trader ? "No price gap pays" : "No trader truck is alive to judge a run");
  return el("div", { class: "sim-econ-group" }, ...trades.map((t) => tradeRow(ctx, t)));
}

export function goodPage(ctx: Ctx, goodId: string, back: { label: string; go: () => void }): HTMLElement {
  const sample = ctx.economy.shops.flatMap((s) => s.goods).find((g) => g.good === goodId);
  if (!sample) throw new Error(`The economy has no good ${goodId}`);
  const trades = ctx.economy.trades.filter((t) => t.good === goodId);
  const rows = ctx.economy.shops.flatMap((shop) => shop.goods.filter((g) => g.good === goodId).map((good) => ({ shop, good })));
  return el("div", { class: "sim-econ-body" },
    head(el("span", { class: "sim-good" }, swatch(ctx.colors.get(goodId)!), sample.name), back, null),
    townsTable(ctx, goodId),
    legend(ctx, rows),
    carryingRows(ctx, goodId),
    tradeRows(ctx, trades));
}
