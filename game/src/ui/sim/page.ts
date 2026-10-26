import "../style.css";
import "./sim.css";
import { FACTIONS } from "../../data/npc-behavior";
import type { Card, FromSim, LogEntry, Marker, ToSim } from "../../sim/progression/sim-mode";
import type { NpcFactionId } from "../../sim/types";
import { fetchMap } from "../../three/map-file";
import { devEl as el, uiRoot } from "../dom";
import { toPx, wheelZoomFactor, type Viewport } from "../map-geometry";
import { MapView, openScene } from "../map-view";
import { token } from "../tokens";

const MARKER = { radius: 4, ring: 7, hit: 9, nose: 7, line: 2 };
const CLICK_SLOP = 4;
const LOG_WINDOW = 2000;
const LOOK = { player: "--select", outlaw: "--danger-bright", lawman: "--good-bright", town: "--path-contact", independent: "--ink-muted", combat: "--alarm", selected: "--accent-bright", out: "--surface-sunk" };

type Drag = { pointer: number; x: number; y: number; moved: number };

function seedFromUrl(): number {
  const text = new URLSearchParams(location.search).get("seed");
  const seed = Number(text);
  if (text === null || text === "" || !Number.isInteger(seed)) throw new Error("Open the page as /sim.html?seed=<whole number>");
  return seed;
}

function lookOf(m: Marker): string {
  if (m.player) return LOOK.player;
  if (m.faction === "marshals") return LOOK.lawman;
  if (m.faction === "independent") return LOOK.independent;
  return FACTIONS[m.faction as NpcFactionId].outlaw ? LOOK.outlaw : LOOK.town;
}

class SimPage {
  private markers: Marker[] = [];
  private entries: LogEntry[] = [];
  private selected: string | null = null;
  private drag: Drag | null = null;
  private drawnView: Viewport | null = null;
  private readonly view = new MapView({ kind: "free" }, 1, 1, (ctx, view) => this.drawMarkers(ctx, view), 1);
  private readonly mapBox = el("div", { class: "sim-map" }, this.view.canvas);
  private readonly status = el("div", { class: "sim-status" }, "Loading the map");
  private readonly failure = el("pre", { class: "sim-failure" });
  private readonly playButton = el("button", { class: "btn-s", onclick: () => this.togglePlay() }, "Play");
  private readonly stepButton = el("button", { class: "btn-s", onclick: () => this.send({ kind: "step" }) }, "Step");
  private readonly quiet = el("input", { type: "checkbox", onchange: () => this.renderLog() }) as HTMLInputElement;
  private readonly onlySelected = el("input", { type: "checkbox", onchange: () => this.renderLog() }) as HTMLInputElement;
  private readonly card = el("div", { class: "sim-card panel" });
  private readonly log = el("ol", { class: "sim-log" });
  private readonly logCount = el("div", { class: "dim" });
  private matching = 0;
  private playing = false;
  private started = false;

  constructor(private readonly worker: Worker) {
    worker.onmessage = (event: MessageEvent<FromSim>) => this.receive(event.data);
    worker.onerror = (event) => this.fail(0, `The sim worker failed: ${event.message}`);
    const controls = el("div", { class: "sim-controls" }, this.playButton, this.stepButton, this.status);
    const filters = el("div", { class: "sim-filters" }, el("label", {}, this.quiet, " quiet events"), el("label", {}, this.onlySelected, " selected truck only"));
    const side = el("div", { class: "sim-side" }, controls, this.failure, legend(), this.card, filters, this.logCount, this.log);
    uiRoot().append(this.mapBox, side);
    uiRoot().classList.add("sim");
    this.playButton.setAttribute("disabled", "");
    this.stepButton.setAttribute("disabled", "");
    this.listen();
    this.renderCard(null);
  }

  private enableOnce(): void {
    if (this.started) return;
    this.started = true;
    this.playButton.removeAttribute("disabled");
    this.stepButton.removeAttribute("disabled");
  }

  async start(seed: number): Promise<void> {
    this.view.update(openScene((await fetchMap()).terrain), null);
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.mapBox);
    this.status.textContent = "Building the world";
    this.send({ kind: "start", seed });
  }

  private send(message: ToSim): void {
    this.worker.postMessage(message);
  }

  private receive(message: FromSim): void {
    if (message.kind === "frame") {
      const f = message.frame;
      this.enableOnce();
      this.markers = f.markers;
      this.status.textContent = `Turn ${f.turn}, day ${f.day} ${clock(f.hour)}, ${f.markers.length} trucks`;
      this.addEntries(f.log);
      if (f.card) this.renderCard(f.card);
      this.view.redraw();
    } else if (message.kind === "card") this.renderCard(message.card);
    else if (message.kind === "ended") this.end(`The run ended at turn ${message.turn}: the player is ${message.reason}`);
    else this.fail(message.turn, message.message);
  }

  private togglePlay(): void {
    this.playing = !this.playing;
    this.playButton.textContent = this.playing ? "Pause" : "Play";
    this.send({ kind: this.playing ? "play" : "pause" });
  }

  private end(text: string): void {
    this.playing = false;
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
    const line = el("li", { class: e.kind === "stall" ? "bad" : "" }, el("span", { class: "dim" }, `${e.turn} `), e.text);
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
    for (const m of this.markers) this.drawMarker(ctx, view, m);
  }

  private drawMarker(ctx: CanvasRenderingContext2D, view: Viewport, m: Marker): void {
    const at = toPx(view, m);
    const ahead = toPx(view, { x: m.x + Math.cos(m.heading), y: m.y + Math.sin(m.heading) });
    const angle = Math.atan2(ahead.y - at.y, ahead.x - at.x);
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
    const gapOf = (m: Marker) => Math.hypot(toPx(view, m).x - at.x, toPx(view, m).y - at.y);
    const near = this.markers.filter((m) => gapOf(m) <= MARKER.hit).sort((a, b) => gapOf(a) - gapOf(b));
    return near[0] ?? null;
  }

  private listen(): void {
    const canvas = this.view.canvas;
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
      if (!drag || drag.pointer !== e.pointerId) return;
      const at = this.view.localPoint(e.clientX, e.clientY);
      if (!at) return;
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

function clock(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
  new SimPage(new Worker(new URL("../../three/sim-worker.ts", import.meta.url), { type: "module" })).start(seed).catch(showBootFailure);
} catch (error) {
  showBootFailure(error);
}
