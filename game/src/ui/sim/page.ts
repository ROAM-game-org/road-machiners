import "../style.css";
import "./sim.css";
import { FACTIONS } from "../../data/npc-behavior";
import type { Card, Frame, FromSim, Hud, LogEntry, Marker, ToSim } from "../../sim/progression/sim-mode";
import { clockOf } from "../../sim/sun";
import type { NpcFactionId } from "../../sim/types";
import type { Vec } from "../../sim/vec";
import { fetchMap } from "../../three/map-file";
import { devEl as el, uiRoot } from "../dom";
import { toPx, wheelZoomFactor, type Viewport } from "../map-geometry";
import { MapView, openScene } from "../map-view";
import { token } from "../tokens";

const MARKER = { radius: 5, ring: 9, hit: 10, nose: 9, line: 2 };
const LABEL = { gap: 8, padX: 4, padY: 2 };
const CLICK_SLOP = 4;
const LOG_WINDOW = 2000;
const GLIDE_MS = { least: 60, most: 1200 };
const SPEEDS: [string, number][] = [["Slow, 1 turn a second", 1000], ["Normal, 3 turns a second", 333], ["Fast, as fast as it runs", 0]];
const START_SPEED = 1;
const RANDOM_SEEDS = 1_000_000;
const LOOK = { player: "--select", outlaw: "--danger-bright", lawman: "--good-bright", town: "--path-contact", independent: "--ink-muted", combat: "--alarm", selected: "--accent-bright", out: "--surface-sunk" };

type Drag = { pointer: number; x: number; y: number; moved: number };

function seedFromUrl(): number {
  const params = new URLSearchParams(location.search);
  const text = params.get("seed");
  if (text === null) return newSeedInUrl(params);
  const seed = Number(text);
  if (text === "" || !Number.isInteger(seed)) throw new Error(`The seed "${text}" is not a whole number. Open the page as /sim.html?seed=<whole number>`);
  return seed;
}

function newSeedInUrl(params: URLSearchParams): number {
  const seed = Math.floor(Math.random() * RANDOM_SEEDS);
  params.set("seed", String(seed));
  history.replaceState(null, "", `?${params}`);
  return seed;
}

function lookOf(m: Marker): string {
  if (m.player) return LOOK.player;
  if (m.faction === "marshals") return LOOK.lawman;
  if (m.faction === "independent") return LOOK.independent;
  return FACTIONS[m.faction as NpcFactionId].outlaw ? LOOK.outlaw : LOOK.town;
}

function clockText(turn: number): string {
  const { day, hour } = clockOf(turn);
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `Day ${day} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

class Glide {
  private from = new Map<string, Vec>();
  private arrived = 0;
  private span: number = GLIDE_MS.least;
  markers: Marker[] = [];

  take(markers: Marker[], now: number): void {
    const t = this.progress(now);
    this.from = new Map(this.markers.map((m) => [m.id, this.placeAt(m, t)]));
    this.span = Math.min(GLIDE_MS.most, Math.max(GLIDE_MS.least, now - this.arrived));
    this.arrived = now;
    this.markers = markers;
  }

  progress(now: number): number {
    return Math.min(1, (now - this.arrived) / this.span);
  }

  placeAt(m: Marker, t: number): Vec {
    const from = this.from.get(m.id);
    if (!from) return m;
    return { x: from.x + (m.x - from.x) * t, y: from.y + (m.y - from.y) * t };
  }
}

class HudStrip {
  private readonly cells = { clock: el("b"), money: el("b"), worth: el("b"), xp: el("b"), doing: el("b") };
  readonly root = el("div", { class: "sim-hud" },
    this.cell("Time", this.cells.clock), this.cell("Money", this.cells.money), this.cell("Net worth", this.cells.worth),
    this.cell("XP", this.cells.xp), this.cell("Player", this.cells.doing));

  private cell(name: string, value: HTMLElement): HTMLElement {
    return el("span", { class: "sim-hud-cell" }, el("span", { class: "dim" }, name), value);
  }

  show(turn: number, hud: Hud): void {
    this.cells.clock.textContent = clockText(turn);
    this.cells.money.textContent = hud.money;
    this.cells.worth.textContent = hud.worth;
    this.cells.xp.textContent = String(hud.xp);
    this.cells.doing.textContent = hud.state === "driving" ? hud.doing : `${hud.state}, ${hud.doing}`;
  }
}

class SimPage {
  private readonly glide = new Glide();
  private entries: LogEntry[] = [];
  private selected: string | null = null;
  private hovered: string | null = null;
  private drag: Drag | null = null;
  private drawnView: Viewport | null = null;
  private readonly view = new MapView({ kind: "free" }, 1, 1, (ctx, view) => this.drawMarkers(ctx, view), 1);
  private readonly hud = new HudStrip();
  private readonly mapBox = el("div", { class: "sim-map" }, this.view.canvas, this.hud.root);
  private readonly status = el("div", { class: "sim-status" }, "Loading the map");
  private readonly failure = el("pre", { class: "sim-failure" });
  private readonly playButton = el("button", { class: "btn-s", title: "Space", onclick: () => this.togglePlay() }, "Play");
  private readonly stepButton = el("button", { class: "btn-s", title: "Period key", onclick: () => this.step() }, "Step");
  private readonly speed = el("select", { onchange: () => this.sendSpeed() }, ...SPEEDS.map(([name, gap], i) => el("option", { value: String(gap), selected: i === START_SPEED }, name))) as HTMLSelectElement;
  private readonly follow = el("input", { type: "checkbox", onchange: () => this.view.redraw() }) as HTMLInputElement;
  private readonly seedBox = el("input", { type: "number", class: "sim-seed", step: "1" }) as HTMLInputElement;
  private readonly quiet = el("input", { type: "checkbox", onchange: () => this.renderLog() }) as HTMLInputElement;
  private readonly onlySelected = el("input", { type: "checkbox", onchange: () => this.renderLog() }) as HTMLInputElement;
  private readonly card = el("div", { class: "sim-card panel" });
  private readonly log = el("ol", { class: "sim-log" });
  private readonly logCount = el("div", { class: "dim" });
  private matching = 0;
  private playing = false;
  private started = false;

  constructor(private readonly worker: Worker, seed: number) {
    worker.onmessage = (event: MessageEvent<FromSim>) => this.receive(event.data);
    worker.onerror = (event) => this.fail(0, `The sim worker failed: ${event.message}`);
    this.seedBox.value = String(seed);
    const run = el("form", { class: "sim-controls", onsubmit: (e: Event) => this.newRun(e) }, el("label", {}, "Seed ", this.seedBox), el("button", { class: "btn-s", type: "submit" }, "New run"));
    const controls = el("div", { class: "sim-controls" }, this.playButton, this.stepButton, this.speed, el("label", { title: "F key" }, this.follow, " follow the card's truck"));
    const filters = el("div", { class: "sim-filters" }, el("label", {}, this.quiet, " quiet events"), el("label", {}, this.onlySelected, " card's truck only"));
    const side = el("div", { class: "sim-side" }, run, controls, this.status, this.failure, legend(), this.card, filters, this.logCount, this.log);
    uiRoot().append(this.mapBox, side);
    uiRoot().classList.add("sim");
    this.playButton.setAttribute("disabled", "");
    this.stepButton.setAttribute("disabled", "");
    this.listen();
    this.renderCard(null);
  }

  async start(seed: number): Promise<void> {
    this.view.update(openScene((await fetchMap()).terrain), null);
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.mapBox);
    this.status.textContent = "Building the world";
    this.send({ kind: "start", seed });
    requestAnimationFrame(() => this.animate());
  }

  private newRun(e: Event): void {
    e.preventDefault();
    const seed = Number(this.seedBox.value);
    if (this.seedBox.value === "" || !Number.isInteger(seed)) return this.fail(0, `The seed "${this.seedBox.value}" is not a whole number`);
    location.search = `?seed=${seed}`;
  }

  private send(message: ToSim): void {
    this.worker.postMessage(message);
  }

  private sendSpeed(): void {
    this.send({ kind: "speed", gapMs: Number(this.speed.value) });
  }

  private receive(message: FromSim): void {
    if (message.kind === "frame") this.showFrame(message.frame);
    else if (message.kind === "card") this.renderCard(message.card);
    else if (message.kind === "ended") this.end(`The run ended at turn ${message.turn}: the player is ${message.reason}`);
    else this.fail(message.turn, message.message);
  }

  private showFrame(f: Frame): void {
    if (!this.started) this.begin(f);
    this.glide.take(f.markers, performance.now());
    this.status.textContent = `Turn ${f.turn}, ${f.markers.length} trucks on the map`;
    this.hud.show(f.turn, f.hud);
    this.addEntries(f.log);
    if (f.card) this.renderCard(f.card);
    this.view.redraw();
  }

  private begin(first: Frame): void {
    this.started = true;
    this.playButton.removeAttribute("disabled");
    this.stepButton.removeAttribute("disabled");
    this.sendSpeed();
    this.select(first.markers.find((m) => m.player)?.id ?? null);
  }

  private animate(): void {
    const now = performance.now();
    if (this.follow.checked) this.centerOnCard(now);
    if (this.glide.progress(now) < 1) this.view.redraw();
    requestAnimationFrame(() => this.animate());
  }

  private centerOnCard(now: number): void {
    const view = this.drawnView;
    const m = this.glide.markers.find((x) => x.id === this.selected);
    if (!view || !m) return;
    const at = toPx(view, this.glide.placeAt(m, this.glide.progress(now)));
    if (Math.hypot(view.width / 2 - at.x, view.height / 2 - at.y) >= 1) this.view.panBy(view.width / 2 - at.x, view.height / 2 - at.y);
  }

  private togglePlay(): void {
    if (!this.started || this.playButton.hasAttribute("disabled")) return;
    this.playing = !this.playing;
    this.playButton.textContent = this.playing ? "Pause" : "Play";
    this.send({ kind: this.playing ? "play" : "pause" });
  }

  private step(): void {
    if (this.started && !this.stepButton.hasAttribute("disabled")) this.send({ kind: "step" });
  }

  private end(text: string): void {
    this.playing = false;
    this.playButton.textContent = "Play";
    this.playButton.setAttribute("disabled", "");
    this.stepButton.setAttribute("disabled", "");
    this.failure.textContent = text;
  }

  private fail(turn: number, message: string): void {
    this.end(`Turn ${turn} failed:\n${message}`);
    this.failure.classList.add("bad");
  }

  private select(id: string | null): void {
    this.selected = id;
    this.send({ kind: "watch", id });
    this.view.redraw();
    if (this.onlySelected.checked) this.renderLog();
  }

  private shown(e: LogEntry): boolean {
    if (e.quiet && !this.quiet.checked) return false;
    return !this.onlySelected.checked || (this.selected !== null && e.ids.includes(this.selected));
  }

  private addEntries(entries: LogEntry[]): void {
    this.entries.push(...entries);
    const matching = entries.filter((e) => this.shown(e));
    this.matching += matching.length;
    this.log.prepend(...matching.slice(-LOG_WINDOW).map((e) => this.logLine(e)).reverse());
    while (this.log.childElementCount > LOG_WINDOW) this.log.lastElementChild!.remove();
    this.countLog();
  }

  private renderLog(): void {
    const matching = this.entries.filter((e) => this.shown(e));
    this.matching = matching.length;
    this.log.replaceChildren(...matching.slice(-LOG_WINDOW).map((e) => this.logLine(e)).reverse());
    this.countLog();
  }

  private countLog(): void {
    this.logCount.textContent = this.matching > LOG_WINDOW ? `Showing the newest ${LOG_WINDOW} of ${this.matching} matching events` : `${this.matching} matching events`;
  }

  private logLine(e: LogEntry): HTMLElement {
    const line = el("li", { class: e.tone, title: e.raw }, el("span", { class: "sim-when" }, clockText(e.turn)), e.text);
    const first = e.ids[0];
    if (first !== undefined) line.addEventListener("click", () => this.select(first));
    return line;
  }

  private renderCard(card: Card | null): void {
    if (!card) {
      this.card.replaceChildren(el("div", { class: "dim" }, "Click a truck or a log line to see its card"));
      return;
    }
    const rows = card.rows.map(([name, value]) => el("div", { class: "sim-row" }, el("span", { class: "dim" }, name), el("span", {}, value)));
    const sections = card.sections.filter((s) => s.lines.length > 0).map((s) => el("div", { class: "sim-section" }, el("div", { class: "panel-title" }, s.name), ...s.lines.map((line) => el("div", {}, line))));
    this.card.replaceChildren(el("div", { class: "panel-title" }, card.title), ...rows, ...sections);
  }

  private resize(): void {
    const box = this.mapBox.getBoundingClientRect();
    this.view.resize(Math.floor(box.width), Math.floor(box.height), window.devicePixelRatio);
  }

  private drawMarkers(ctx: CanvasRenderingContext2D, view: Viewport): void {
    this.drawnView = view;
    const t = this.glide.progress(performance.now());
    const placed = this.glide.markers.map((m) => ({ m, at: toPx(view, this.glide.placeAt(m, t)) }));
    for (const { m, at } of placed) this.drawMarker(ctx, view, m, at);
    for (const { m, at } of placed.filter(({ m }) => this.named(m))) drawLabel(ctx, at, m.name);
  }

  private named(m: Marker): boolean {
    return m.player || m.id === this.selected || m.id === this.hovered;
  }

  private drawMarker(ctx: CanvasRenderingContext2D, view: Viewport, m: Marker, at: { x: number; y: number }): void {
    const ahead = toPx(view, { x: m.x + Math.cos(m.heading), y: m.y + Math.sin(m.heading) });
    const tip = toPx(view, m);
    const angle = Math.atan2(ahead.y - tip.y, ahead.x - tip.x);
    const color = token(lookOf(m));
    ctx.lineWidth = MARKER.line;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(at.x, at.y);
    ctx.lineTo(at.x + Math.cos(angle) * MARKER.nose, at.y + Math.sin(angle) * MARKER.nose);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(at.x, at.y, MARKER.radius, 0, Math.PI * 2);
    ctx.fillStyle = m.out ? token(LOOK.out) : color;
    ctx.fill();
    ctx.stroke();
    if (m.combat) ring(ctx, at, MARKER.ring, token(LOOK.combat));
    if (m.id === this.selected) ring(ctx, at, MARKER.ring + MARKER.line, token(LOOK.selected));
  }

  private markerAt(clientX: number, clientY: number): Marker | null {
    const at = this.view.localPoint(clientX, clientY);
    const view = this.drawnView;
    if (!at || !view) return null;
    const t = this.glide.progress(performance.now());
    const gapOf = (m: Marker) => {
      const px = toPx(view, this.glide.placeAt(m, t));
      return Math.hypot(px.x - at.x, px.y - at.y);
    };
    const near = this.glide.markers.filter((m) => gapOf(m) <= MARKER.hit).sort((a, b) => gapOf(a) - gapOf(b));
    return near[0] ?? null;
  }

  private hover(clientX: number, clientY: number): void {
    const id = this.markerAt(clientX, clientY)?.id ?? null;
    this.view.canvas.classList.toggle("over-truck", id !== null);
    if (id === this.hovered) return;
    this.hovered = id;
    this.view.redraw();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement && e.target.type !== "checkbox") return;
    if (e.code === "Space") {
      e.preventDefault();
      this.togglePlay();
    } else if (e.key === ".") this.step();
    else if (e.key === "f") this.follow.checked = !this.follow.checked;
  }

  private listen(): void {
    const canvas = this.view.canvas;
    document.addEventListener("keydown", (e) => this.onKey(e));
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (e.deltaY === 0) return;
      const at = this.view.localPoint(e.clientX, e.clientY);
      this.view.zoomBy(wheelZoomFactor(e.deltaY, e.deltaMode), at?.x, at?.y);
    }, { passive: false });
    canvas.addEventListener("pointerdown", (e) => {
      const at = this.view.localPoint(e.clientX, e.clientY);
      if (!at) return;
      canvas.setPointerCapture(e.pointerId);
      this.drag = { pointer: e.pointerId, ...at, moved: 0 };
    });
    canvas.addEventListener("pointermove", (e) => {
      const drag = this.drag;
      if (!drag || drag.pointer !== e.pointerId) return this.hover(e.clientX, e.clientY);
      const at = this.view.localPoint(e.clientX, e.clientY);
      if (!at) return;
      this.follow.checked = false;
      this.view.panBy(at.x - drag.x, at.y - drag.y);
      this.drag = { ...drag, ...at, moved: drag.moved + Math.hypot(at.x - drag.x, at.y - drag.y) };
    });
    canvas.addEventListener("pointerup", (e) => {
      const drag = this.drag;
      if (drag?.pointer !== e.pointerId) return;
      this.drag = null;
      if (drag.moved <= CLICK_SLOP) this.select(this.markerAt(e.clientX, e.clientY)?.id ?? null);
    });
    canvas.addEventListener("pointercancel", () => {
      this.drag = null;
    });
  }
}

function ring(ctx: CanvasRenderingContext2D, at: { x: number; y: number }, radius: number, color: string): void {
  ctx.beginPath();
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.stroke();
}

function drawLabel(ctx: CanvasRenderingContext2D, at: { x: number; y: number }, text: string): void {
  ctx.font = `${token("--text-dense")} ${token("--font-ui")}`;
  ctx.textBaseline = "middle";
  const width = ctx.measureText(text).width + 2 * LABEL.padX;
  const tall = parseFloat(token("--text-dense")) + 2 * LABEL.padY;
  const left = at.x + LABEL.gap;
  ctx.fillStyle = token("--surface-overlay");
  ctx.fillRect(left, at.y - tall / 2, width, tall);
  ctx.fillStyle = token("--ink");
  ctx.fillText(text, left + LABEL.padX, at.y);
}

function legend(): HTMLElement {
  const items: [string, string][] = [["player", LOOK.player], ["outlaws", LOOK.outlaw], ["marshals", LOOK.lawman], ["town crews", LOOK.town], ["independents", LOOK.independent], ["in combat", LOOK.combat]];
  return el("div", { class: "sim-legend" }, ...items.map(([name, look]) => {
    const dot = el("span", { class: "sim-dot" });
    dot.style.background = `var(${look})`;
    return el("span", {}, dot, name);
  }));
}

function showBootFailure(error: unknown): void {
  uiRoot().append(el("pre", { class: "sim-failure bad" }, error instanceof Error ? error.stack ?? error.message : String(error)));
}

try {
  const seed = seedFromUrl();
  new SimPage(new Worker(new URL("../../three/sim-worker.ts", import.meta.url), { type: "module" }), seed).start(seed).catch(showBootFailure);
} catch (error) {
  showBootFailure(error);
}
