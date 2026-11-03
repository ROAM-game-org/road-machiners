import { TIME } from "../../data/time";
import type { Economy, EconShipment, EconShop, SampleEvent } from "../../sim/progression/sim-economy";
import { atlasOf } from "../../sim/atlas";
import { buildRoadNetwork, otherEnd, shortestPath, type RoadNetwork, type RoadPath } from "../../sim/road-network";
import type { Terrain } from "../../sim/terrain";
import { dist, type Vec } from "../../sim/vec";
import { devEl as el } from "../dom";
import { toPx, toTile, type Viewport } from "../map-geometry";
import { token } from "../tokens";
import type { Series } from "./economy-reads";

const TURNS_PER_HOUR = TIME.turnsPerDay / 24;
const px = (name: string): number => parseFloat(token(name));
const SIZES = { row: { width: px("--space-10") * 5, height: px("--space-8") }, cell: { width: px("--space-9") * 2, height: px("--space-7") } };
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
const EDGE = { width: 1.5, wide: 2.5, alpha: 0.75, spread: 4, arrow: 8, halo: 1.5 };
const SHIPMENT = { width: 2, alpha: 0.9, faded: 0.2, end: 3, dash: [6, 4], halo: 1.5 };
const HALO = "--surface-sunk";

export type Route = { points: Vec[]; reach: number[] };
export type Spot = { id: string; x: number; y: number };

function routeOf(points: Vec[]): Route {
  const reach = [0];
  for (let i = 1; i < points.length; i++) reach.push(reach[i - 1]! + dist(points[i - 1]!, points[i]!));
  return { points, reach };
}

export function routeLength(route: Route): number {
  return route.reach[route.reach.length - 1]!;
}

export function pointAtShare(route: Route, share: number): { at: Vec; from: Vec; to: Vec } {
  const target = routeLength(route) * share;
  let i = 1;
  while (i < route.points.length - 1 && route.reach[i]! < target) i++;
  const from = route.points[i - 1]!;
  const to = route.points[i]!;
  const span = route.reach[i]! - route.reach[i - 1]!;
  const t = span === 0 ? 0 : (target - route.reach[i - 1]!) / span;
  return { at: { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, from, to };
}

export function nearestOnRoute(route: Route, p: Vec): { at: Vec; along: number; gap: number; next: number } {
  let best = { at: route.points[0]!, along: 0, gap: Infinity, next: 1 };
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1]!;
    const b = route.points[i]!;
    const span = route.reach[i]! - route.reach[i - 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = span === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (span * span)));
    const at = { x: a.x + dx * t, y: a.y + dy * t };
    const gap = dist(at, p);
    if (gap < best.gap) best = { at, along: route.reach[i - 1]! + span * t, gap, next: i };
  }
  return best;
}

export function remainingFrom(route: Route, p: Vec): Vec[] {
  const near = nearestOnRoute(route, p);
  return [near.at, ...route.points.slice(near.next)];
}

export class RoadPaths {
  private readonly net: RoadNetwork;
  private readonly routes = new Map<string, Route>();

  constructor(terrain: Terrain) {
    this.net = buildRoadNetwork(atlasOf(terrain), terrain.size);
  }

  between(from: Spot, to: Spot): Route {
    const key = `${from.id}|${to.id}`;
    const known = this.routes.get(key);
    if (known) return known;
    const made = this.build(from, to);
    this.routes.set(key, made);
    return made;
  }

  private nodesOf(id: string): number[] {
    const nodes = this.net.nodes.filter((n) => (n.site === id || n.entry === id) && this.net.incident[n.id]!.length > 0).map((n) => n.id);
    if (nodes.length === 0) throw new Error(`${id} has no road node`);
    return nodes;
  }

  private build(from: Spot, to: Spot): Route {
    const goals = this.nodesOf(to.id);
    const paths = this.nodesOf(from.id).flatMap((start) => {
      const path = shortestPath(this.net, start, goals);
      return path ? [path] : [];
    });
    const best = paths.sort((a, b) => a.length - b.length)[0];
    if (!best) throw new Error(`No road runs from ${from.id} to ${to.id}`);
    return routeOf([{ x: from.x, y: from.y }, ...this.walk(best), { x: to.x, y: to.y }]);
  }

  private walk(path: RoadPath): Vec[] {
    const points: Vec[] = [];
    path.edges.forEach((id, i) => {
      const edge = this.net.edges[id]!;
      if (otherEnd(edge, path.nodes[i]!) !== path.nodes[i + 1]) throw new Error(`The road path breaks between nodes ${path.nodes[i]} and ${path.nodes[i + 1]}`);
      points.push(...(edge.from === path.nodes[i] ? edge.points : [...edge.points].reverse()));
    });
    if (path.edges.length === 0) points.push(this.net.nodes[path.nodes[0]!]!.pos);
    return points;
  }
}
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

export function drawEconomy(ctx: CanvasRenderingContext2D, view: Viewport, economy: Economy, focus: Focus, truckAt: (id: string) => Point | null, paths: RoadPaths): void {
  const colors = goodTokens(economy);
  const colorOf = (good: string): string => token(colors.get(good) ?? failUnknown(good));
  ctx.save();
  drawEdges(ctx, view, economy, focus, colorOf, paths);
  drawShipments(ctx, view, economy, focus, colorOf, truckAt, paths);
  for (const shop of economy.shops) drawBadge(ctx, toPx(view, shop), shop, focus);
  ctx.restore();
}

function failUnknown(good: string): never {
  throw new Error(`The economy names the good ${good}, which no shop trades`);
}

function spotOf(economy: Economy, id: string): Spot {
  const shop = economy.shops.find((s) => s.id === id);
  if (!shop) throw new Error(`The economy names ${id}, which is not a shop`);
  return { id, x: shop.x, y: shop.y };
}

function drawEdges(ctx: CanvasRenderingContext2D, view: Viewport, economy: Economy, focus: Focus, colorOf: (good: string) => string, paths: RoadPaths): void {
  const seen = new Map<string, number>();
  ctx.save();
  ctx.globalAlpha = EDGE.alpha;
  const width = focus.good ? EDGE.wide : EDGE.width;
  for (const edge of economy.edges.filter((e) => (focus.good ? e.good === focus.good : e.fromId === focus.town || e.toId === focus.town))) {
    const key = [edge.fromId, edge.toId].sort().join("|");
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);
    const route = paths.between(spotOf(economy, edge.fromId), spotOf(economy, edge.toId));
    const line = shifted(route.points.map((p) => toPx(view, p)), index * EDGE.spread);
    strokeHaloed(ctx, line, colorOf(edge.good), width, EDGE.halo, []);
    if (focus.good) arrowHead(ctx, view, route, shift(index * EDGE.spread, line), colorOf(edge.good));
  }
  ctx.restore();
}

function shift(push: number, line: Point[]): Point {
  const first = line[0]!;
  const last = line[line.length - 1]!;
  const length = Math.hypot(last.x - first.x, last.y - first.y) || 1;
  return { x: (-(last.y - first.y) / length) * push, y: ((last.x - first.x) / length) * push };
}

function shifted(line: Point[], push: number): Point[] {
  if (push === 0) return line;
  const by = shift(push, line);
  return line.map((p) => ({ x: p.x + by.x, y: p.y + by.y }));
}

function arrowHead(ctx: CanvasRenderingContext2D, view: Viewport, route: Route, by: Point, color: string): void {
  const mid = pointAtShare(route, 0.5);
  const from = toPx(view, mid.from);
  const to = toPx(view, mid.to);
  const at = toPx(view, mid.at);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  for (const turn of [0, 2.5, -2.5]) ctx.lineTo(at.x + by.x + Math.cos(angle + turn) * EDGE.arrow, at.y + by.y + Math.sin(angle + turn) * EDGE.arrow);
  ctx.closePath();
  ctx.lineWidth = EDGE.halo;
  ctx.strokeStyle = token(HALO);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeHaloed(ctx: CanvasRenderingContext2D, line: Point[], color: string, width: number, halo: number, dash: number[]): void {
  ctx.setLineDash([]);
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";
  trace(ctx, line);
  ctx.lineWidth = width + halo * 2;
  ctx.strokeStyle = token(HALO);
  ctx.stroke();
  ctx.setLineDash(dash);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.setLineDash([]);
}

function trace(ctx: CanvasRenderingContext2D, line: Point[]): void {
  ctx.beginPath();
  line.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
}

function inFocus(s: EconShipment, focus: Focus): boolean {
  if (focus.good) return s.good === focus.good;
  return focus.town === null || s.fromId === focus.town || s.toId === focus.town;
}

function shipmentLine(view: Viewport, route: Route, truck: Point | null): Point[] {
  if (!truck) return route.points.map((p) => toPx(view, p));
  const rest = remainingFrom(route, toTile(view, truck.x, truck.y)).map((p) => toPx(view, p));
  return [truck, ...rest];
}

function drawShipments(ctx: CanvasRenderingContext2D, view: Viewport, economy: Economy, focus: Focus, colorOf: (good: string) => string, truckAt: (id: string) => Point | null, paths: RoadPaths): void {
  ctx.save();
  for (const s of economy.shipments) {
    const route = paths.between({ id: s.fromId, ...s.fromXY }, { id: s.toId, ...s.toXY });
    const line = shipmentLine(view, route, truckAt(s.truck));
    const to = line[line.length - 1]!;
    ctx.globalAlpha = inFocus(s, focus) ? SHIPMENT.alpha : SHIPMENT.faded;
    strokeHaloed(ctx, line, colorOf(s.good), SHIPMENT.width, SHIPMENT.halo, SHIPMENT.dash);
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
