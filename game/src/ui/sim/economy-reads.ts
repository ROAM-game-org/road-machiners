import { TIME } from "../../data/time";
import { marketLayout, type EconGood, type EconLine, type Economy, type EconTrade, type EconShop, type SampleEvent } from "../../sim/progression/sim-economy";
import type { Sample } from "../../sim/progression/sim-mode";

const TURNS_PER_HOUR = TIME.turnsPerDay / 24;
const SLOTS = new Map(marketLayout().map(({ shop, good }, i) => [`${shop}|${good}`, i]));

export type Series = { turns: number[]; stock: number[]; buy: number[]; events: { turn: number; kind: SampleEvent["kind"] }[] };
export type Need = { shop: EconShop; good: EconGood; empty: boolean; hours: number; why: string; series: Series };
export type LineAlert = { shop: EconShop; line: EconLine; why: string };

export class MarketHistory {
  private samples: Sample[] = [];

  reset(samples: Sample[]): void {
    this.samples = [...samples];
  }

  add(sample: Sample): void {
    this.samples.push(sample);
  }

  get first(): number {
    return this.samples[0]?.turn ?? 0;
  }

  series(shop: string, good: EconGood, economy: Economy): Series {
    const slot = SLOTS.get(`${shop}|${good.good}`);
    if (slot === undefined) throw new Error(`The market history has no slot for ${good.good} at ${shop}`);
    const turns = this.samples.map((s) => s.turn);
    const stock = this.samples.map((s) => s.market[slot * 2]);
    const buy = this.samples.map((s) => s.market[slot * 2 + 1]);
    if (economy.turn > (turns[turns.length - 1] ?? -1)) {
      turns.push(economy.turn);
      stock.push(good.stock);
      buy.push(good.buy);
    }
    const events = this.samples.flatMap((s) => s.events.filter((e) => e.shop === shop && e.good === good.good).map((e) => ({ turn: s.turn, kind: e.kind })));
    return { turns, stock, buy, events };
  }
}

export function hoursSince(series: Series, holds: (stock: number) => boolean): number {
  let start = series.stock.length;
  while (start > 0 && holds(series.stock[start - 1])) start--;
  if (start === series.stock.length) return 0;
  return Math.round((series.turns[series.turns.length - 1] - series.turns[start]) / TURNS_PER_HOUR);
}

const crates = (n: number): string => `${n} ${n === 1 ? "crate" : "crates"}`;

function joined(names: string[]): string {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function stockOf(economy: Economy, shop: string, good: string): number {
  const found = economy.shops.find((s) => s.id === shop)?.goods.find((g) => g.good === good);
  if (!found) throw new Error(`${shop} keeps no stock of ${good}`);
  return found.stock;
}

function lacking(line: EconLine): string {
  const needs = line.missing.map((m) => `${m.need} ${m.name}, has ${m.have}`);
  return `${line.name}: ${line.runText.toLowerCase()}. Needs ${joined(needs)}.`;
}

const LINE_WHY: Record<EconLine["run"], (line: EconLine) => string> = {
  stopped: lacking,
  fallback: lacking,
  worn: (line) => `${line.name}: worn and slow.`,
  running: (line) => `${line.name}: runs, but use takes the goods as fast as they are made.`,
};

export function lineWhy(shop: EconShop, line: EconLine): string {
  if (shop.event?.kind === "breakdown" && line.event) return `${line.event}, ${shop.event.hoursLeft} h left.`;
  return LINE_WHY[line.run](line);
}

function lostOnTheRoad(economy: Economy, shop: EconShop, good: EconGood): string | null {
  const lost = economy.news.filter((n) => n.toId === shop.id && n.good === good.good);
  if (lost.length === 0) return null;
  const units = lost.reduce((sum, n) => sum + n.units, 0);
  return `Haulers lost ${crates(units)} on the road here, ${Math.min(...lost.map((n) => n.hoursAgo))} h ago.`;
}

function onTheWay(economy: Economy, shop: EconShop, good: EconGood): string | null {
  const carrying = economy.shipments.filter((s) => s.toId === shop.id && s.good === good.good);
  if (carrying.length === 0) return null;
  const units = carrying.reduce((sum, s) => sum + s.units, 0);
  return `${carrying.length === 1 ? "1 truck brings" : `${carrying.length} trucks bring`} ${crates(units)}.`;
}

function makersWhy(economy: Economy, shop: EconShop, good: EconGood, makers: string[]): string {
  const held = makers.map((id) => ({ name: economy.shops.find((s) => s.id === id)!.name, stock: stockOf(economy, id, good.good) }));
  const out = held.filter((m) => m.stock <= 0).map((m) => m.name);
  if (out.length === held.length) return `${joined(out)} ${out.length === 1 ? "is" : "are"} out of it too.`;
  return lostOnTheRoad(economy, shop, good) ?? onTheWay(economy, shop, good) ?? `No truck hauls it here. ${joined(held.map((m) => `${m.name} holds ${crates(m.stock)}`))}.`;
}

function causeOf(economy: Economy, shop: EconShop, good: EconGood): string {
  const line = shop.lines.find((l) => l.outputGoods.includes(good.good));
  if (line) return lineWhy(shop, line);
  const makers = economy.edges.filter((e) => e.good === good.good && e.toId === shop.id).map((e) => e.fromId);
  if (makers.length > 0) return makersWhy(economy, shop, good, makers);
  return good.found ? "No town makes it. Only salvage that trucks sell here fills it." : "No town makes it.";
}

function drainOf(economy: Economy, shop: EconShop, good: EconGood): string {
  const drain = shop.flows.filter((f) => f.good === good.good && f.units < 0).sort((a, b) => a.units - b.units)[0];
  return drain ? ` ${drain.causeText} took ${-drain.units} in ${Math.round(economy.flowHours)} h.` : "";
}

export function whyShort(economy: Economy, shop: EconShop, good: EconGood): string {
  return `${causeOf(economy, shop, good)}${drainOf(economy, shop, good)}`;
}

export function needsOf(economy: Economy, history: MarketHistory): Need[] {
  const needs = economy.shops.flatMap((shop) => shop.goods.filter((g) => g.stock <= g.shortBelow).map((good) => {
    const series = history.series(shop.id, good, economy);
    const empty = good.stock <= 0;
    const hours = hoursSince(series, empty ? (s) => s <= 0 : (s) => s <= good.shortBelow);
    return { shop, good, empty, hours, why: whyShort(economy, shop, good), series };
  }));
  return needs.sort((a, b) => Number(b.empty) - Number(a.empty) || (a.empty ? b.hours - a.hours : b.good.pressure - a.good.pressure) || b.hours - a.hours);
}

export function lineAlertsOf(economy: Economy): LineAlert[] {
  return economy.shops.flatMap((shop) => shop.lines.filter((l) => l.run === "stopped" || l.run === "fallback").map((line) => ({ shop, line, why: lineWhy(shop, line) })));
}

export type Alert = { kind: "need"; need: Need } | { kind: "line"; alert: LineAlert };

const LINE_ORDER: Record<EconLine["run"], number> = { stopped: 0, fallback: 1, worn: 2, running: 2 };

export function rankedAlerts(needs: Need[], alerts: LineAlert[]): Alert[] {
  const lines = [...alerts].sort((a, b) => LINE_ORDER[a.line.run] - LINE_ORDER[b.line.run]).map((alert): Alert => ({ kind: "line", alert }));
  const empty = needs.filter((n) => n.empty).map((need): Alert => ({ kind: "need", need }));
  const short = needs.filter((n) => !n.empty).map((need): Alert => ({ kind: "need", need }));
  return [...empty, ...lines, ...short];
}

export function tradeSkipReason(trade: EconTrade): string | null {
  if (trade.worth) return null;
  if (trade.load === 0) return "Traders skip it: no crate fits their stake";
  return trade.net + trade.risk > 0 ? "Traders skip it: road risk eats the gain" : "Traders skip it: fuel eats the gain";
}
