import "../style.css";
import "./sim.css";
import { FACTIONS } from "../../data/npc-behavior";
import type { Card, Frame, FromSim, LogEntry, Marker, ToSim, Way } from "../../sim/progression/sim-mode";
import { clockOf } from "../../sim/sun";
import type { NpcFactionId } from "../../sim/types";
import type { Vec } from "../../sim/vec";
import { fetchMap } from "../../three/map-file";
import { devEl as el, download, uiRoot } from "../dom";
import { toPx, wheelZoomFactor, type Viewport } from "../map-geometry";
import { MapView, openScene } from "../map-view";
import { token } from "../tokens";
import { TruckIcons, type IconLook, type SpriteSet } from "./truck-icons";
import { HEAT_LAYERS, HeatMap, type HeatLayer } from "./heat-map";
import { CardView, PlayerPanel } from "./panels";
import { TIME } from "../../data/time";

const MARKER = { ring: 4, halo: 2, hit: 8, line: 2, shortestPx: 24 };
const LABEL = { gap: 6, padX: 5, padY: 3, stripe: 3 };
const CLICK_SLOP = 4;
const LOG_WINDOW = 2000;
const GLIDE_MS = { least: 60, most: 1200 };
const SPEEDS: { label: string; title: string; gap: number }[] = [
  { label: "Slow", title: "1 turn a second", gap: 1000 },
  { label: "Normal", title: "3 turns a second", gap: 333 },
  { label: "Fast", title: "As fast as it runs", gap: 0 },
];
const START_SPEED = 1;
const LOOK = { player: "--select", outlaw: "--alarm", lawman: "--path-accelerate", town: "--path-contact", independent: "--map-engine", combat: "--path-radio", selected: "--ink-bright", halo: "--surface-sunk" };
const LOG_KEEP_TURNS = TIME.turnsPerDay;
const TURNS_PER_HOUR = TIME.turnsPerDay / 24;
const WAY = { line: 2, halo: 1, end: 5, dest: { color: "--path-plan", dash: [6, 4] }, target: { color: "--path-dest", dash: [2, 4] }, home: "--ink-muted" };

type Drag = { pointer: number; x: number; y: number; moved: number };
type Point = { x: number; y: number };

function seedFromUrl(): number | null {
  const text = new URLSearchParams(location.search).get("seed");
  if (text === null) return null;
  const seed = Number(text);
  if (text === "" || !Number.isInteger(seed)) throw new Error(`The seed "${text}" is not a whole number. Open the page as /sim.html?seed=<whole number>`);
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

function shortClockText(turn: number): string {
  return clockText(turn).replace("Day ", "D");
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

class Toggle {
  readonly button: HTMLElement;

  constructor(label: string, title: string, private readonly changed: () => void) {
    this.button = el("button", { class: "btn-s", title, "aria-pressed": "false", onclick: () => this.flip() }, label);
  }

  get on(): boolean {
    return this.button.classList.contains("on");
  }

  set on(value: boolean) {
    this.button.classList.toggle("on", value);
    this.button.setAttribute("aria-pressed", String(value));
  }

  flip(): void {
    this.on = !this.on;
    this.changed();
  }
}

class SimPage {
  private readonly glide = new Glide();
  private entries: LogEntry[] = [];
  private selected: string | null = null;
  private hovered: string | null = null;
  private drag: Drag | null = null;
  private drawnView: Viewport | null = null;
  private drawnScale = 1;
  private icons: TruckIcons | null = null;
  private readonly looks = new Map<string, IconLook>();
  private readonly sets = new Map<string, SpriteSet>();
  private readonly view = new MapView({ kind: "free" }, 1, 1, (ctx, view) => this.drawAll(ctx, view), 1);
  private readonly heat = new HeatMap(heatClassOf);
  private readonly heatButtons = HEAT_LAYERS.map((h) => el("button", { class: "btn-s", title: h.title, "aria-pressed": String(h.layer === null), onclick: () => this.showHeat(h.layer) }, h.label));
  private readonly heatNote = el("span", { class: "sim-note" });
  private way: Way | null = null;
  private playerId: string | null = null;
  private readonly find = el("input", { type: "search", class: "sim-find", placeholder: "Find", oninput: () => this.renderLog() }) as HTMLInputElement;
  private readonly player = new PlayerPanel(clockText, clockText, () => this.select(this.playerId));
  private readonly heatBar = el("div", { class: "sim-heat" }, el("span", { class: "sim-label" }, "Heat"), el("div", { class: "option-switch" }, ...this.heatButtons), this.heatNote);
  private readonly mapBox = el("div", { class: "sim-map" }, this.view.canvas, this.heatBar, legend());
  private readonly status = el("span", { class: "sim-note" }, "Loading the map");
  private readonly failure = el("pre", { class: "sim-failure" });
  private readonly playButton = el("button", { class: "sim-play", title: "Space", onclick: () => this.togglePlay() }, "Play");
  private readonly stepButton = el("button", { class: "btn-s", title: "Period key", onclick: () => this.step() }, "Step");
  private readonly speedButtons = SPEEDS.map((s, i) => el("button", { class: "btn-s", title: s.title, "aria-pressed": String(i === START_SPEED), onclick: () => this.setSpeed(i) }, s.label));
  private speedIndex = START_SPEED;
  private readonly follow = new Toggle("Follow", "F key. Keeps the selected truck in the middle", () => this.view.redraw());
  private readonly seedBox = el("input", { type: "number", class: "sim-seed", step: "1", title: "Seed" }) as HTMLInputElement;
  private readonly saveButton = el("button", { class: "btn-s", title: "The run also saves every game hour and on Pause, and opening the page resumes it", onclick: () => this.send({ kind: "save" }) }, "Save");
  private readonly downloadButton = el("button", { class: "btn-s", title: "Download the run as a game save file", onclick: () => this.send({ kind: "download" }) }, "Download");
  private readonly saveNote = el("span", { class: "sim-note" }, "Not saved yet");
  private readonly quiet = new Toggle("All events", "Also show routine events: jobs, trades, shots and sightings", () => this.renderLog());
  private readonly onlySelected = new Toggle("Selected", "Show only the events of the selected truck", () => this.renderLog());
  private readonly cardView = new CardView();
  private readonly log = el("ol", { class: "sim-log" });
  private readonly logCount = el("span", { class: "sim-note" });
  private playing = false;
  private started = false;

  constructor(private readonly worker: Worker) {
    worker.onmessage = (event: MessageEvent<FromSim>) => this.receive(event.data);
    worker.onerror = (event) => this.fail(0, `The sim worker failed: ${event.message}`);
    const toolbar = el("div", { class: "sim-toolbar panel" }, this.playButton, this.stepButton, el("div", { class: "option-switch sim-speed" }, ...this.speedButtons), this.follow.button);
    const runForm = el("form", { class: "sim-run", onsubmit: (e: Event) => this.newRun(e) }, this.seedBox, el("button", { class: "btn-s", type: "submit" }, "New run"), this.saveButton, this.downloadButton, this.saveNote);
    const filters = el("div", { class: "sim-filters" }, this.find, this.quiet.button, this.onlySelected.button);
    const logHead = el("div", { class: "sim-head" }, el("span", { class: "panel-title" }, "Log"), this.logCount, filters);
    const logPanel = el("div", { class: "sim-log-panel panel" }, logHead, this.log);
    const side = el("div", { class: "sim-side" }, toolbar, this.failure, this.player.root, this.cardView.root, logPanel, el("div", { class: "sim-footer" }, runForm, this.status));
    uiRoot().append(this.mapBox, side);
    uiRoot().classList.add("sim");
    this.setReady(false);
    this.listen();
    this.cardView.show(null);
  }

  async start(seed: number | null): Promise<void> {
    this.view.update(openScene((await fetchMap()).terrain), null);
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.mapBox);
    this.status.textContent = "Drawing the trucks";
    this.icons = await TruckIcons.load();
    this.status.textContent = "Building the world";
    this.send({ kind: "start", seed });
    requestAnimationFrame(() => this.animate());
  }

  private setReady(ready: boolean): void {
    for (const button of [this.playButton, this.stepButton]) {
      if (ready) button.removeAttribute("disabled");
      else button.setAttribute("disabled", "");
    }
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

  private setSpeed(index: number): void {
    this.speedIndex = index;
    this.speedButtons.forEach((button, i) => button.setAttribute("aria-pressed", String(i === index)));
    this.sendSpeed();
  }

  private sendSpeed(): void {
    this.send({ kind: "speed", gapMs: SPEEDS[this.speedIndex]!.gap });
  }

  private receive(message: FromSim): void {
    const handlers: { [K in FromSim["kind"]]: (m: Extract<FromSim, { kind: K }>) => void } = {
      started: (m) => this.showStarted(m),
      history: (m) => this.player.chart.reset(m.samples),
      saved: (m) => (this.saveNote.textContent = `Saved ${shortClockText(m.turn)}`),
      saveFile: (m) => download(m.name, m.json, "application/json"),
      frame: (m) => this.showFrame(m.frame),
      card: (m) => this.showCard(m.card),
      ended: (m) => this.end(`The run ended ${clockText(m.turn)}: your truck is ${m.reason === "knockedOut" ? "knocked out" : m.reason}`),
      failed: (m) => this.fail(m.turn, m.message),
    };
    (handlers[message.kind] as (m: FromSim) => void)(message);
  }

  private showStarted(m: Extract<FromSim, { kind: "started" }>): void {
    this.seedBox.value = String(m.seed);
    history.replaceState(null, "", location.pathname);
    if (m.resumed) this.saveNote.textContent = `Resumed from ${shortClockText(m.turn)}`;
    if (m.dropped) this.saveNote.textContent = "The old save was from an older sim mode and was deleted";
  }

  private showFrame(f: Frame): void {
    if (!this.started) this.begin(f);
    for (const m of f.markers) this.setOf(m);
    this.glide.take(f.markers, performance.now());
    this.status.textContent = `${f.markers.length} trucks`;
    this.player.show(f.turn, f.hud);
    if (f.sample) this.player.chart.add(f.sample);
    this.heat.add(f.turn, f.markers);
    this.captionHeat();
    this.addEntries(f.log);
    if (f.card) this.showCard(f.card);
    this.view.redraw();
  }

  private showCard(card: Card | null): void {
    this.way = card && card.id === this.selected ? card.way : null;
    this.cardView.show(card);
    this.view.redraw();
  }

  private showHeat(layer: HeatLayer | null): void {
    this.heat.shown = layer;
    this.heatButtons.forEach((button, i) => button.setAttribute("aria-pressed", String(HEAT_LAYERS[i]!.layer === layer)));
    this.captionHeat();
    this.view.redraw();
  }

  private captionHeat(): void {
    this.heatNote.textContent = this.heat.shown ? `${Math.round(this.heat.turnsCovered() / TURNS_PER_HOUR)} h since this page opened` : "";
  }

  private begin(first: Frame): void {
    this.started = true;
    this.setReady(true);
    this.sendSpeed();
    this.playerId = first.markers.find((m) => m.player)?.id ?? null;
    this.select(this.playerId);
  }

  private animate(): void {
    const now = performance.now();
    if (this.follow.on) this.centerOnCard(now);
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

  private showPlaying(playing: boolean): void {
    this.playing = playing;
    this.playButton.textContent = playing ? "Pause" : "Play";
    this.playButton.classList.toggle("on", playing);
  }

  private togglePlay(): void {
    if (!this.started || this.playButton.hasAttribute("disabled")) return;
    this.showPlaying(!this.playing);
    this.send({ kind: this.playing ? "play" : "pause" });
  }

  private step(): void {
    if (this.started && !this.stepButton.hasAttribute("disabled")) this.send({ kind: "step" });
  }

  private end(text: string): void {
    this.showPlaying(false);
    this.setReady(false);
    this.failure.textContent = text;
  }

  private fail(turn: number, message: string): void {
    this.end(`Turn ${turn} failed:\n${message}`);
    this.failure.classList.add("bad");
  }

  private select(id: string | null): void {
    this.selected = id;
    this.way = null;
    this.send({ kind: "watch", id });
    this.view.redraw();
    if (this.onlySelected.on) this.renderLog();
  }

  private shown(e: LogEntry): boolean {
    if (e.quiet && !this.quiet.on) return false;
    if (this.onlySelected.on && !this.namesSelected(e)) return false;
    const query = this.find.value.trim().toLowerCase();
    return query === "" || e.text.toLowerCase().includes(query);
  }

  private namesSelected(e: LogEntry): boolean {
    return this.selected !== null && e.ids.includes(this.selected);
  }

  private addEntries(entries: LogEntry[]): void {
    this.entries.push(...entries);
    this.forgetOldEntries();
    const matching = entries.filter((e) => this.shown(e));
    this.log.prepend(...matching.slice(-LOG_WINDOW).map((e) => this.logLine(e)).reverse());
    markRepeatedTimes(this.log, matching.length + 1);
    while (this.log.childElementCount > LOG_WINDOW) this.log.lastElementChild!.remove();
    this.countLog();
  }

  private forgetOldEntries(): void {
    const newest = this.entries[this.entries.length - 1];
    if (!newest) return;
    const keep = this.entries.findIndex((e) => e.turn > newest.turn - LOG_KEEP_TURNS);
    if (keep > 0) this.entries.splice(0, keep);
  }

  private renderLog(): void {
    const matching = this.entries.filter((e) => this.shown(e));
    this.log.replaceChildren(...matching.slice(-LOG_WINDOW).map((e) => this.logLine(e)).reverse());
    markRepeatedTimes(this.log, this.log.childElementCount);
    this.countLog();
  }

  private countLog(): void {
    const oldest = (this.log.lastElementChild as HTMLElement | null)?.dataset.when;
    this.logCount.textContent = oldest ? `${this.log.childElementCount} lines since ${oldest}` : "";
  }

  private logLine(e: LogEntry): HTMLElement {
    const mine = this.playerId !== null && e.ids.includes(this.playerId);
    const line = el("li", { class: mine ? `${e.tone} mine` : e.tone, "data-when": shortClockText(e.turn) }, el("span", { class: "sim-when num" }, shortClockText(e.turn)), el("span", {}, e.text));
    const first = e.ids[0];
    if (first !== undefined) line.addEventListener("click", () => this.select(first));
    return line;
  }

  private resize(): void {
    const box = this.mapBox.getBoundingClientRect();
    this.view.resize(Math.floor(box.width), Math.floor(box.height), window.devicePixelRatio);
  }

  private drawAll(ctx: CanvasRenderingContext2D, view: Viewport): void {
    this.heat.draw(ctx, view);
    this.drawWay(ctx, view);
    this.drawMarkers(ctx, view);
  }

  private drawWay(ctx: CanvasRenderingContext2D, view: Viewport): void {
    const m = this.glide.markers.find((x) => x.id === this.selected);
    const way = this.way;
    if (!m || !way) return;
    const at = toPx(view, this.glide.placeAt(m, this.glide.progress(performance.now())));
    if (way.home) drawHome(ctx, toPx(view, way.home));
    if (way.target) drawLeg(ctx, at, toPx(view, way.target), WAY.target);
    if (way.dest) drawLeg(ctx, at, toPx(view, way.dest), WAY.dest);
  }

  private drawMarkers(ctx: CanvasRenderingContext2D, view: Viewport): void {
    this.drawnView = view;
    if (this.glide.markers.length === 0) return;
    this.drawnScale = this.iconSet().pxPerMeter(view.tileSize, MARKER.shortestPx);
    ctx.imageSmoothingEnabled = true;
    const t = this.glide.progress(performance.now());
    const placed = this.glide.markers.map((m) => ({ m, at: toPx(view, this.glide.placeAt(m, t)) })).sort((a, b) => this.rank(a.m) - this.rank(b.m));
    for (const { m, at } of placed) this.drawMarker(ctx, view, m, at);
    for (const { m, at } of placed.filter(({ m }) => this.rank(m) > 0)) drawLabel(ctx, at, m, this.radiusOf(m));
  }

  private iconSet(): TruckIcons {
    if (!this.icons) throw new Error("The truck icons are not drawn yet");
    return this.icons;
  }

  private lookFor(m: Marker): IconLook {
    const name = lookOf(m);
    const key = `${name}|${m.out}`;
    const cached = this.looks.get(key);
    if (cached) return cached;
    const look = { color: token(name), out: m.out };
    this.looks.set(key, look);
    return look;
  }

  private setOf(m: Marker): SpriteSet {
    const known = this.sets.get(m.id);
    if (known) return known;
    const made = this.iconSet().setFor(m.chassis, { faction: m.faction, template: m.template, player: m.paint });
    this.sets.set(m.id, made);
    return made;
  }

  private rank(m: Marker): number {
    if (m.id === this.selected) return 4;
    if (m.id === this.hovered) return 3;
    return m.player ? 2 : 0;
  }

  private radiusOf(m: Marker): number {
    return this.iconSet().radius(this.setOf(m), this.drawnScale);
  }

  private drawMarker(ctx: CanvasRenderingContext2D, view: Viewport, m: Marker, at: Point): void {
    const ahead = toPx(view, { x: m.x + Math.cos(m.heading), y: m.y + Math.sin(m.heading) });
    const tip = toPx(view, m);
    const angle = Math.atan2(ahead.y - tip.y, ahead.x - tip.x);
    const radius = this.radiusOf(m);
    this.iconSet().draw(ctx, this.setOf(m), at, angle, this.drawnScale, this.lookFor(m));
    if (m.combat) ring(ctx, at, radius + MARKER.ring, token(LOOK.combat), MARKER.line);
    if (m.id === this.selected) ring(ctx, at, radius + MARKER.ring + MARKER.line * 2, token(LOOK.selected), MARKER.line);
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
    const near = this.glide.markers.filter((m) => gapOf(m) <= Math.max(MARKER.hit, this.radiusOf(m))).sort((a, b) => gapOf(a) - gapOf(b));
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
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === "Space") {
      e.preventDefault();
      this.togglePlay();
    } else if (e.key === ".") this.step();
    else if (e.key === "f") this.follow.flip();
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
      this.follow.on = false;
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

function heatClassOf(m: Marker): HeatLayer | null {
  const look = lookOf(m);
  if (look === LOOK.outlaw) return "raiders";
  return look === LOOK.town || look === LOOK.independent ? "traffic" : null;
}

function markRepeatedTimes(log: HTMLElement, count: number): void {
  const lines = [...log.children].slice(0, count) as HTMLElement[];
  lines.forEach((line, i) => line.classList.toggle("same-time", i > 0 && lines[i - 1]!.dataset.when === line.dataset.when));
}

function drawLeg(ctx: CanvasRenderingContext2D, from: Point, to: Point, look: { color: string; dash: number[] }): void {
  ctx.save();
  ctx.setLineDash(look.dash);
  ctx.lineWidth = WAY.line + WAY.halo * 2;
  ctx.strokeStyle = token(LOOK.halo);
  line(ctx, from, to);
  ctx.lineWidth = WAY.line;
  ctx.strokeStyle = token(look.color);
  line(ctx, from, to);
  ctx.restore();
  ring(ctx, to, WAY.end, token(look.color), WAY.line);
}

function line(ctx: CanvasRenderingContext2D, from: Point, to: Point): void {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function drawHome(ctx: CanvasRenderingContext2D, at: Point): void {
  const side = WAY.end * 2;
  ctx.lineWidth = WAY.line;
  ctx.strokeStyle = token(WAY.home);
  ctx.strokeRect(at.x - side / 2, at.y - side / 2, side, side);
}

function ring(ctx: CanvasRenderingContext2D, at: Point, radius: number, color: string, width: number): void {
  ctx.beginPath();
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function drawLabel(ctx: CanvasRenderingContext2D, at: Point, m: Marker, radius: number): void {
  ctx.font = `${token("--text-dense")} ${token("--font-ui")}`;
  ctx.textBaseline = "middle";
  const width = ctx.measureText(m.name).width + 2 * LABEL.padX + LABEL.stripe;
  const tall = parseFloat(token("--text-dense")) + 2 * LABEL.padY;
  const left = at.x + radius + MARKER.halo + LABEL.gap;
  ctx.fillStyle = token("--surface-overlay");
  ctx.fillRect(left, at.y - tall / 2, width, tall);
  ctx.fillStyle = token(lookOf(m));
  ctx.fillRect(left, at.y - tall / 2, LABEL.stripe, tall);
  ctx.fillStyle = token("--ink-bright");
  ctx.fillText(m.name, left + LABEL.stripe + LABEL.padX, at.y);
}

function legend(): HTMLElement {
  const items: [string, string, boolean][] = [["player", LOOK.player, false], ["outlaws", LOOK.outlaw, false], ["marshals", LOOK.lawman, false], ["town crews", LOOK.town, false], ["independents", LOOK.independent, false], ["in combat", LOOK.combat, true]];
  return el("div", { class: "sim-legend" }, ...items.map(([name, look, ringed]) => {
    const dot = el("span", { class: ringed ? "sim-dot ring" : "sim-dot" });
    dot.style.setProperty("--dot", `var(${look})`);
    return el("span", { class: "sim-legend-item" }, dot, name);
  }));
}

function showBootFailure(error: unknown): void {
  uiRoot().append(el("pre", { class: "sim-failure bad" }, error instanceof Error ? error.stack ?? error.message : String(error)));
}

try {
  new SimPage(new Worker(new URL("../../three/sim-worker.ts", import.meta.url), { type: "module" })).start(seedFromUrl()).catch(showBootFailure);
} catch (error) {
  showBootFailure(error);
}
