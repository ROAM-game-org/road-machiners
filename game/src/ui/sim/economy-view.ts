import type { Economy, EconFlow, EconGood, EconLine, EconNews, EconShop } from "../../sim/progression/sim-economy";
import { devEl as el } from "../dom";
import { toPx, type Viewport } from "../map-geometry";
import { token } from "../tokens";

type Tone = "bad" | "warn" | "";
type Point = { x: number; y: number };

const GOOD_TOKENS = ["--path-plan", "--path-accelerate", "--path-radio", "--path-dest", "--map-engine", "--map-deck", "--map-bay", "--path-hold", "--map-side"];
const EDGE = { width: 1, alpha: 0.6, spread: 3 };
const SHIPMENT = { width: 2, alpha: 0.8, end: 3, dash: [6, 4] };
const TOWN = { ring: 12, width: 2, color: "--select" };

const RUN_TONE: Record<EconLine["run"], Tone> = { running: "", worn: "warn", fallback: "warn", stopped: "bad" };

function toneOfGood(good: EconGood): Tone {
  const tags = good.tags.join(" ").toLowerCase();
  if (tags.includes("ration") || tags.includes("short")) return "bad";
  return tags.includes("slow") ? "warn" : "";
}

function toneOfTag(tag: string): Tone {
  const lower = tag.toLowerCase();
  if (lower.includes("ration") || lower.includes("short")) return "bad";
  return lower.includes("slow") ? "warn" : "";
}

function toneClass(base: string, tone: Tone): string {
  return tone === "" ? base : `${base} ${tone}`;
}

function signed(units: number): string {
  if (units > 0) return `+${units}`;
  return units < 0 ? `−${-units}` : "0";
}

function meter(good: EconGood, tone: Tone): HTMLElement {
  const bar = el("span");
  bar.style.width = `${Math.min(100, Math.max(0, (good.stock / good.target) * 100))}%`;
  return el("div", { class: tone === "bad" ? "meter s broken" : "meter s" }, bar);
}

function swatch(token: string): HTMLElement {
  const dot = el("span", { class: "sim-swatch" });
  dot.style.setProperty("--swatch", `var(${token})`);
  return dot;
}

function newsLine(n: EconNews): HTMLElement {
  const when = n.hoursAgo < 1 ? "Now" : `${n.hoursAgo} h ago`;
  return el("li", {}, el("span", { class: "sim-when num" }, when), el("span", {}, `${n.kindText}: ${n.units} ${n.goodName}, ${n.from} to ${n.to}`));
}

function goodTokens(economy: Economy): Map<string, string> {
  const ids = [...new Set(economy.shops.flatMap((s) => s.goods.map((g) => g.good)))].sort();
  return new Map(ids.map((id, i) => [id, GOOD_TOKENS[i % GOOD_TOKENS.length]!]));
}

export function shopAt(economy: Economy, view: Viewport, at: Point, radius: number): EconShop | null {
  const gap = (s: EconShop) => {
    const px = toPx(view, s);
    return Math.hypot(px.x - at.x, px.y - at.y);
  };
  const near = economy.shops.filter((s) => gap(s) <= radius).sort((a, b) => gap(a) - gap(b));
  return near[0] ?? null;
}

export function drawEconomy(ctx: CanvasRenderingContext2D, view: Viewport, economy: Economy, selected: string | null, truckAt: (id: string) => Point | null): void {
  const colors = goodTokens(economy);
  const colorOf = (good: string): string => token(colors.get(good) ?? failUnknown(good));
  drawEdges(ctx, view, economy, colorOf);
  drawShipments(ctx, view, economy, colorOf, truckAt);
  const chosen = economy.shops.find((s) => s.id === selected);
  if (chosen) drawTown(ctx, toPx(view, chosen));
}

function failUnknown(good: string): never {
  throw new Error(`The economy names the good ${good}, which no shop trades`);
}

function drawEdges(ctx: CanvasRenderingContext2D, view: Viewport, economy: Economy, colorOf: (good: string) => string): void {
  const placeOf = (name: string): Point => {
    const shop = economy.shops.find((s) => s.name === name);
    if (!shop) throw new Error(`The economy has an edge at ${name}, which is not a shop`);
    return toPx(view, shop);
  };
  const seen = new Map<string, number>();
  ctx.save();
  ctx.globalAlpha = EDGE.alpha;
  ctx.lineWidth = EDGE.width;
  for (const edge of economy.edges) {
    const key = [edge.from, edge.to].sort().join("|");
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);
    const from = placeOf(edge.from);
    const to = placeOf(edge.to);
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const push = index * EDGE.spread;
    const dx = (-(to.y - from.y) / length) * push;
    const dy = ((to.x - from.x) / length) * push;
    ctx.strokeStyle = colorOf(edge.good);
    stroke(ctx, { x: from.x + dx, y: from.y + dy }, { x: to.x + dx, y: to.y + dy });
  }
  ctx.restore();
}

function drawShipments(ctx: CanvasRenderingContext2D, view: Viewport, economy: Economy, colorOf: (good: string) => string, truckAt: (id: string) => Point | null): void {
  ctx.save();
  ctx.globalAlpha = SHIPMENT.alpha;
  ctx.setLineDash(SHIPMENT.dash);
  for (const s of economy.shipments) {
    const from = truckAt(s.truck) ?? toPx(view, s.fromXY);
    const to = toPx(view, s.toXY);
    ctx.lineWidth = SHIPMENT.width;
    ctx.strokeStyle = colorOf(s.good);
    stroke(ctx, from, to);
    ctx.setLineDash([]);
    ctx.fillStyle = colorOf(s.good);
    ctx.beginPath();
    ctx.arc(to.x, to.y, SHIPMENT.end, 0, Math.PI * 2);
    ctx.fill();
    ctx.setLineDash(SHIPMENT.dash);
  }
  ctx.restore();
}

function drawTown(ctx: CanvasRenderingContext2D, at: Point): void {
  ctx.beginPath();
  ctx.arc(at.x, at.y, TOWN.ring, 0, Math.PI * 2);
  ctx.lineWidth = TOWN.width;
  ctx.strokeStyle = token(TOWN.color);
  ctx.stroke();
}

function stroke(ctx: CanvasRenderingContext2D, from: Point, to: Point): void {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

export class EconomyView {
  readonly root = el("div", { class: "sim-economy panel" });
  private economy: Economy | null = null;
  private chosen: string | null = null;

  constructor(private readonly picked: (shop: EconShop | null) => void) {
    this.root.append(el("div", { class: "dim" }, "Waiting for the economy"));
  }

  get shown(): Economy | null {
    return this.economy;
  }

  get selected(): string | null {
    return this.chosen;
  }

  show(economy: Economy): void {
    this.economy = economy;
    this.render();
  }

  select(id: string | null): void {
    this.chosen = id;
    this.render();
    this.picked(this.shopOf(id));
  }

  private shopOf(id: string | null): EconShop | null {
    if (id === null || !this.economy) return null;
    const shop = this.economy.shops.find((s) => s.id === id);
    if (!shop) throw new Error(`The economy has no shop ${id}`);
    return shop;
  }

  private render(): void {
    const economy = this.economy;
    if (!economy) return;
    const shop = this.shopOf(this.chosen);
    this.root.replaceChildren(shop ? this.detail(shop, economy) : this.overview(economy));
    this.root.scrollTop = 0;
  }

  private overview(economy: Economy): HTMLElement {
    const colors = goodTokens(economy);
    const goods = new Map<string, string>();
    for (const shop of economy.shops) for (const g of shop.goods) goods.set(g.good, g.name);
    const rows = [...goods].sort((a, b) => a[1].localeCompare(b[1]));
    const head = el("tr", {}, el("th", {}), ...economy.shops.map((s) => el("th", { class: "sim-link", role: "button", tabindex: 0, onclick: () => this.select(s.id) }, s.name)));
    const body = rows.map(([id, name]) => el("tr", {}, el("th", { class: "sim-good" }, swatch(colors.get(id)!), name), ...economy.shops.map((s) => this.cell(s, id))));
    return el("div", { class: "sim-econ-body" },
      el("div", { class: "sim-econ-scroll" }, el("table", { class: "sim-econ-table" }, el("thead", {}, head), el("tbody", {}, ...body))),
      this.news(economy.news));
  }

  private cell(shop: EconShop, goodId: string): HTMLElement {
    const good = shop.goods.find((g) => g.good === goodId);
    if (!good) return el("td", { class: "sim-empty" });
    const tone = toneOfGood(good);
    const tags = good.tags.length > 0 ? `. ${good.tags.join(", ")}` : "";
    const title = `${good.name}, ${shop.name}: ${good.stock} of ${good.target}${tags}`;
    return el("td", { class: toneClass("sim-econ-cell", tone), title }, meter(good, tone), el("span", { class: "num" }, good.buyText));
  }

  private news(news: EconNews[]): HTMLElement {
    if (news.length === 0) return el("div", { class: "dim" }, "No road news");
    return el("ul", { class: "sim-news" }, ...news.map(newsLine));
  }

  private detail(shop: EconShop, economy: Economy): HTMLElement {
    const colors = goodTokens(economy);
    return el("div", { class: "sim-econ-body" },
      el("div", { class: "sim-head" },
        el("span", { class: "sim-card-title" }, shop.name),
        el("span", { class: "sim-note num" }, `Contracts ${shop.contracts}, parts ${shop.parts}`),
        el("button", { class: "btn-s", onclick: () => this.select(null) }, "All towns")),
      this.lines(shop.lines),
      this.goods(shop, colors),
      this.flows(shop.flows, economy.flowHours));
  }

  private lines(lines: EconLine[]): HTMLElement {
    if (lines.length === 0) return el("div", { class: "dim" }, "No production");
    const rows = lines.map((l) => el("div", { class: "sim-line-row" },
      el("span", {}, l.name),
      el("span", { class: toneClass("tag", RUN_TONE[l.run]) }, l.runText),
      el("span", { class: "dim num" }, `Every ${Number(l.everyHours.toFixed(1))} h`),
      el("span", { class: "sim-recipe" }, l.inputs.length === 0 ? `Makes ${l.outputs.join(", ")}` : `${l.inputs.join(", ")} to ${l.outputs.join(", ")}`),
      l.event ? el("span", { class: "sim-recipe-event dim" }, l.event) : null));
    return el("div", { class: "sim-econ-group" }, ...rows);
  }

  private goods(shop: EconShop, colors: Map<string, string>): HTMLElement {
    const head = el("tr", {}, el("th", {}), el("th", { class: "num" }, "Stock"), el("th", { class: "num" }, "Target"), el("th", { class: "num" }, "Buy"), el("th", { class: "num" }, "Sell"), el("th", {}));
    const rows = shop.goods.map((g) => {
      const tone = toneOfGood(g);
      return el("tr", {},
        el("td", { class: "sim-good" }, swatch(colors.get(g.good)!), g.name),
        el("td", { class: toneClass("num", tone) }, String(g.stock)),
        el("td", { class: "num dim" }, String(g.target)),
        el("td", { class: "num" }, g.buyText),
        el("td", { class: "num" }, g.sellText),
        el("td", { class: "sim-tags" }, ...g.tags.map((t) => el("span", { class: toneClass("tag", toneOfTag(t)) }, t))));
    });
    return el("table", { class: "sim-econ-table sim-econ-goods" }, el("thead", {}, head), el("tbody", {}, ...rows));
  }

  private flows(flows: EconFlow[], flowHours: number): HTMLElement {
    const hours = Math.round(flowHours);
    if (flows.length === 0) return el("div", { class: "dim" }, `No stock changes in ${hours} h`);
    const rows = flows.map((f) => el("div", { class: "sim-row" }, el("span", {}, `${f.name}, ${f.causeText}`), el("span", { class: f.units < 0 ? "num bad" : "num good" }, signed(f.units))));
    return el("div", { class: "sim-econ-group" }, el("span", { class: "sim-label" }, `Stock changes, last ${hours} h`), ...rows);
  }
}
