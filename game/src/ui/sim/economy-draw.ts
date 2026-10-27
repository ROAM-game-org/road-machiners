import { TIME } from "../../data/time";
import type { Economy, EconShipment, EconShop, SampleEvent } from "../../sim/progression/sim-economy";
import { devEl as el } from "../dom";
import { toPx, type Viewport } from "../map-geometry";
import { token } from "../tokens";
import type { Series } from "./economy-reads";

const TURNS_PER_HOUR = TIME.turnsPerDay / 24;
const px = (name: string): number => parseFloat(token(name));
const SIZES = { row: { width: px("--space-10") * 5, height: px("--space-8") }, cell: { width: px("--space-9") * 2, height: px("--space-8") } };
const SPARK_LOOK = { line: "--ink", target: "--ink-muted", short: "--danger", surge: "--good", breakdown: "--path-hold", news: "--danger-bright" };
const SPARK_LINE = { width: 1.5, targetDash: [3, 3], pad: 2, shade: 0.12, band: 0.28, priceMargin: 0.2 };
const SITE_KINDS = new Set<SampleEvent["kind"]>(["surge", "breakdown"]);

export type SparkSize = keyof typeof SIZES;
export type Span = { first: number; last: number };
export type Spark = { series: Series; span: Span; size: SparkSize; of: "stock" | "buy"; target?: number; shortBelow?: number };
export type Point = { x: number; y: number };
export type Focus = { town: string | null; good: string | null };
export type Level = "empty" | "short" | "ok";

const GOOD_TOKENS = ["--path-plan", "--path-accelerate", "--path-radio", "--path-dest", "--map-engine", "--map-deck", "--map-bay", "--path-hold", "--map-side"];
const EDGE = { width: 1, wide: 2.5, alpha: 0.6, spread: 3 };
const SHIPMENT = { width: 2, alpha: 0.8, faded: 0.15, end: 3, dash: [6, 4] };
const BADGE = { radius: 9, disc: 8, offset: 13, selected: 15, selectWidth: 2, ring: "--ink-bright", text: "--surface-sunk" };
const LEVEL_FILL: Record<Level, string> = { empty: "--danger-bright", short: "--path-hold", ok: "--good-bright" };

export function goodTokens(economy: Economy): Map<string, string> {
  const ids = [...new Set(economy.shops.flatMap((s) => s.goods.map((g) => g.good)))].sort();
  return new Map(ids.map((id, i) => [id, GOOD_TOKENS[i % GOOD_TOKENS.length]!]));
}

export function levelOf(shop: EconShop, good: string | null): Level {
  const goods = good === null ? shop.goods : shop.goods.filter((g) => g.good === good);
  if (goods.some((g) => g.stock <= 0)) return "empty";
  return goods.some((g) => g.stock <= g.shortBelow) ? "short" : "ok";
}

export function shopAt(economy: Economy, view: Viewport, at: Point, radius: number): EconShop | null {
  const gap = (s: EconShop) => {
    const px = toPx(view, s);
    return Math.hypot(px.x - at.x, px.y - at.y);
  };
  const near = economy.shops.filter((s) => gap(s) <= radius).sort((a, b) => gap(a) - gap(b));
  return near[0] ?? null;
}

export function drawEconomy(ctx: CanvasRenderingContext2D, view: Viewport, economy: Economy, focus: Focus, truckAt: (id: string) => Point | null): void {
  const colors = goodTokens(economy);
  const colorOf = (good: string): string => token(colors.get(good) ?? failUnknown(good));
  ctx.save();
  drawEdges(ctx, view, economy, focus, colorOf);
  drawShipments(ctx, view, economy, focus, colorOf, truckAt);
  for (const shop of economy.shops) drawBadge(ctx, toPx(view, shop), shop, focus);
  ctx.restore();
}

function failUnknown(good: string): never {
  throw new Error(`The economy names the good ${good}, which no shop trades`);
}

function drawEdges(ctx: CanvasRenderingContext2D, view: Viewport, economy: Economy, focus: Focus, colorOf: (good: string) => string): void {
  const placeOf = (id: string): Point => {
    const shop = economy.shops.find((s) => s.id === id);
    if (!shop) throw new Error(`The economy has an edge at ${id}, which is not a shop`);
    return toPx(view, shop);
  };
  const seen = new Map<string, number>();
  ctx.save();
  ctx.globalAlpha = EDGE.alpha;
  ctx.lineWidth = focus.good ? EDGE.wide : EDGE.width;
  for (const edge of economy.edges.filter((e) => (focus.good ? e.good === focus.good : e.fromId === focus.town || e.toId === focus.town))) {
    const key = [edge.fromId, edge.toId].sort().join("|");
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);
    const from = placeOf(edge.fromId);
    const to = placeOf(edge.toId);
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const push = index * EDGE.spread;
    const dx = (-(to.y - from.y) / length) * push;
    const dy = ((to.x - from.x) / length) * push;
    ctx.strokeStyle = colorOf(edge.good);
    stroke(ctx, { x: from.x + dx, y: from.y + dy }, { x: to.x + dx, y: to.y + dy });
  }
  ctx.restore();
}

function inFocus(s: EconShipment, focus: Focus): boolean {
  if (focus.good) return s.good === focus.good;
  return focus.town === null || s.fromId === focus.town || s.toId === focus.town;
}

function drawShipments(ctx: CanvasRenderingContext2D, view: Viewport, economy: Economy, focus: Focus, colorOf: (good: string) => string, truckAt: (id: string) => Point | null): void {
  ctx.save();
  for (const s of economy.shipments) {
    const from = truckAt(s.truck) ?? toPx(view, s.fromXY);
    const to = toPx(view, s.toXY);
    ctx.globalAlpha = inFocus(s, focus) ? SHIPMENT.alpha : SHIPMENT.faded;
    ctx.lineWidth = SHIPMENT.width;
    ctx.strokeStyle = colorOf(s.good);
    ctx.setLineDash(SHIPMENT.dash);
    stroke(ctx, from, to);
    ctx.setLineDash([]);
    ctx.fillStyle = colorOf(s.good);
    ctx.beginPath();
    ctx.arc(to.x, to.y, SHIPMENT.end, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBadge(ctx: CanvasRenderingContext2D, at: Point, shop: EconShop, focus: Focus): void {
  const level = levelOf(shop, focus.good);
  const trades = focus.good === null || shop.goods.some((g) => g.good === focus.good);
  if (trades && (level !== "ok" || focus.good !== null)) fillBadge(ctx, at, shop, focus, level);
  if (shop.id !== focus.town) return;
  ring(ctx, at, BADGE.selected, token(BADGE.ring));
}

function ring(ctx: CanvasRenderingContext2D, at: Point, radius: number, color: string): void {
  ctx.beginPath();
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
  ctx.lineWidth = BADGE.selectWidth;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function fillBadge(ctx: CanvasRenderingContext2D, at: Point, shop: EconShop, focus: Focus, level: Level): void {
  ring(ctx, at, BADGE.radius, token(LEVEL_FILL[level]));
  if (focus.good !== null) return;
  const count = shop.goods.filter((g) => g.stock <= g.shortBelow).length;
  const disc = { x: at.x + BADGE.offset, y: at.y - BADGE.offset };
  ctx.beginPath();
  ctx.arc(disc.x, disc.y, BADGE.disc, 0, Math.PI * 2);
  ctx.fillStyle = token(LEVEL_FILL[level]);
  ctx.fill();
  ctx.font = `${token("--text-dense")} ${token("--font-mono")}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = token(BADGE.text);
  ctx.fillText(String(count), disc.x, disc.y);
}

function stroke(ctx: CanvasRenderingContext2D, from: Point, to: Point): void {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

type Box = { width: number; height: number; xOf: (turn: number) => number; yOf: (value: number) => number };

function valueRange(values: number[], target: number | undefined, of: Spark["of"]): [number, number] {
  if (of === "stock") return [0, Math.max(...values, target ?? 0, 1)];
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = (high - low) * SPARK_LINE.priceMargin || 1;
  return [Math.max(0, low - pad), high + pad];
}

function boxOf(spark: Spark, values: number[]): Box {
  const { width, height } = SIZES[spark.size];
  const [low, high] = valueRange(values, spark.target, spark.of);
  const span = Math.max(1, spark.span.last - spark.span.first);
  return {
    width,
    height,
    xOf: (turn) => ((turn - spark.span.first) / span) * width,
    yOf: (value) => SPARK_LINE.pad + (1 - (value - low) / (high - low)) * (height - 2 * SPARK_LINE.pad),
  };
}

function fill(ctx: CanvasRenderingContext2D, look: string, alpha: number, rect: [number, number, number, number]): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = token(look);
  ctx.fillRect(...rect);
  ctx.globalAlpha = 1;
}

function drawEvents(ctx: CanvasRenderingContext2D, spark: Spark, box: Box): void {
  for (const e of spark.series.events) {
    const x = box.xOf(e.turn);
    const start = box.xOf(e.turn - TURNS_PER_HOUR);
    if (SITE_KINDS.has(e.kind)) fill(ctx, SPARK_LOOK[e.kind as "surge" | "breakdown"], SPARK_LINE.band, [start, 0, Math.max(1, x - start), box.height]);
    else fill(ctx, SPARK_LOOK.news, 1, [Math.round(x), 0, 1, box.height]);
  }
}

function drawGuides(ctx: CanvasRenderingContext2D, spark: Spark, box: Box): void {
  if (spark.size === "row" && spark.shortBelow !== undefined && spark.shortBelow >= 0) fill(ctx, SPARK_LOOK.short, SPARK_LINE.shade, [0, box.yOf(spark.shortBelow), box.width, box.height - box.yOf(spark.shortBelow)]);
  if (spark.target === undefined) return;
  ctx.beginPath();
  ctx.setLineDash(SPARK_LINE.targetDash);
  ctx.moveTo(0, box.yOf(spark.target));
  ctx.lineTo(box.width, box.yOf(spark.target));
  ctx.lineWidth = 1;
  ctx.strokeStyle = token(SPARK_LOOK.target);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawLine(ctx: CanvasRenderingContext2D, spark: Spark, box: Box, values: number[]): void {
  ctx.beginPath();
  values.forEach((v, i) => ctx.lineTo(box.xOf(spark.series.turns[i]), box.yOf(v)));
  ctx.lineWidth = SPARK_LINE.width;
  ctx.lineJoin = "round";
  ctx.strokeStyle = token(SPARK_LOOK.line);
  ctx.stroke();
}

export function sparkOf(spark: Spark, title: string): HTMLElement {
  const values = spark.series[spark.of];
  const box = boxOf(spark, values);
  const canvas = el("canvas", { class: `sim-spark sim-spark-${spark.size}`, title }) as HTMLCanvasElement;
  const ratio = window.devicePixelRatio;
  canvas.width = Math.round(box.width * ratio);
  canvas.height = Math.round(box.height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas context");
  ctx.scale(ratio, ratio);
  drawEvents(ctx, spark, box);
  if (spark.of === "stock") drawGuides(ctx, spark, box);
  drawLine(ctx, spark, box, values);
  return canvas;
}
