import "../ui/style.css";
import "./score-lab.css";
import { BEATS_PER_BAR, MIX, SOUNDS } from "../data/sounds";
import { SFX_BYTES } from "../config";
import { formatSupport, loadBank } from "../audio/bank";
import { Mixer } from "../audio/mixer";
import { SoundPlayer } from "../audio/player";
import { devEl as el, uiRoot } from "../ui/dom";
import { token } from "../ui/tokens";
import { BASE_CUES, type AccentCue, type BaseCue } from "./sound";
import {
  baseLevels,
  EVENT_GROUPS,
  EVENT_LABELS,
  LEDGER_HEAD,
  ledgerCells,
  lineOf,
  ScoreSession,
  TRACK_ROWS,
  type BaseTrace,
  type LedgerRow,
  type Line,
  type Offered,
  type Press,
  type Result,
  type Sounded,
} from "./score-session";

const ZOOM_SECONDS = [3, 6, 12];
const DEFAULT_ZOOM = 6;
const FUTURE_SHARE = 0.15;
const GUTTER = 96;
const COLUMN_STEP = 2;
const ROW_HEIGHT = 13;
const LABEL_ROWS = 5;
const LABEL_GAP = 6;
const LABEL_TOP = 24;
const PRESS_ROWS = 2;
const PRESS_TICK_TOP = 2;
const PRESS_TICK_HEIGHT = 36;
const PRESS_LABEL_TOP = 13;
const PRESS_LINK_Y = 38;
const MARK_RADIUS = 4;
const MARK_TOP = 9;
const BLOCK_HEIGHT = 36;
const BLOCK_FLOOR = 4;
const ONSET_WIDTH = 3;
const BODY_ALPHA = 0.3;
const GAP_BAND = 3;
const HEAT_CEILING_OVER_HOT = 2;
const LANES = [
  { id: "press", height: 44 },
  { id: "lead", height: 150 },
  { id: "secondary", height: 150 },
  { id: "base", height: 100 },
  { id: "heat", height: 80 },
] as const;
type LaneId = (typeof LANES)[number]["id"];
const HEIGHT = LANES.reduce((sum, lane) => sum + lane.height, 0);

const TIPS: Record<AccentCue, string> = {
  "accent-sighted": "Plays at once",
  "accent-struck": "An enemy shot hits you",
  "accent-crit": "Your shot is a crit",
  "accent-crash": "Your truck crashes",
  "accent-hit": "Your shot hits",
  "accent-miss": "Your shot misses",
};

type View = { now: number; span: number; width: number };

const INK = {
  text: token("--ink"),
  label: token("--ink-label"),
  faint: token("--ink-faint"),
  muted: token("--ink-muted"),
  now: token("--ink-bright"),
  well: token("--surface-sunk"),
  gutter: token("--surface-well"),
  slot: token("--line-faint"),
  beat: token("--line-soft"),
  bar: token("--line"),
  press: token("--accent"),
  stab: token("--good-bright"),
  tail: token("--good-deep"),
  base: token("--line-faint"),
  baseEdge: token("--ink-muted"),
  duck: token("--danger"),
  crowd: token("--danger-deep"),
  heat: token("--danger-bright"),
  hot: token("--danger-deep"),
};
const RESULT_INK: Record<Result, string> = { played: token("--good"), skipped: token("--ink-muted"), crowded: token("--danger"), forced: token("--ink-bright") };
const FONT = `${token("--text-dense")} ${token("--font-mono")}`;

const root = uiRoot();
root.classList.add("score-lab");
root.append(el("div", { class: "dim" }, "Loading sounds..."));
const mixer = new Mixer(MIX);
mixer.unlockOn(window);
const { bank } = await loadBank(mixer.ctx, SOUNDS, { expectedBytes: SFX_BYTES, support: formatSupport() });
const player = new SoundPlayer(mixer, bank, SOUNDS);

const session = new ScoreSession({
  player,
  durationOf: (file) => {
    const buffer = bank.get(file);
    if (!buffer) throw new Error(`Sound file ${file} was not loaded`);
    return buffer.duration;
  },
  roll: Math.random,
  wallMs: () => performance.now(),
});
Object.assign(window, { __scoreLab: session });

let span = DEFAULT_ZOOM;
let held: number | null = null;

function frame(): void {
  session.frame();
  draw();
  syncControls();
  syncLedger();
  requestAnimationFrame(frame);
}

const canvas = el("canvas", {}) as HTMLCanvasElement;
const g = canvas.getContext("2d")!;
let view: View = { now: 0, span, width: 0 };

function fitCanvas(width: number): void {
  const ratio = window.devicePixelRatio;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(HEIGHT * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${HEIGHT}px`;
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  view = { ...view, width };
}

function spanStart(): number {
  return view.now - view.span * (1 - FUTURE_SHARE);
}

function xOf(t: number): number {
  return GUTTER + ((t - spanStart()) / view.span) * (view.width - GUTTER);
}

function timeOf(x: number): number {
  return spanStart() + ((x - GUTTER) / (view.width - GUTTER)) * view.span;
}

function laneTop(lane: LaneId): number {
  let top = 0;
  for (const l of LANES) {
    if (l.id === lane) return top;
    top += l.height;
  }
  throw new Error(`Unknown lane ${lane}`);
}

function laneHeight(lane: LaneId): number {
  return LANES.find((l) => l.id === lane)!.height;
}

function draw(): void {
  view = { now: held ?? session.now(), span, width: view.width };
  g.font = FONT;
  g.fillStyle = INK.well;
  g.fillRect(0, 0, view.width, HEIGHT);
  g.save();
  g.beginPath();
  g.rect(GUTTER, 0, view.width - GUTTER, HEIGHT);
  g.clip();
  drawGrid();
  drawPresses();
  drawLine("lead");
  drawLine("secondary");
  drawBase();
  drawHeat();
  g.fillStyle = INK.now;
  g.fillRect(xOf(session.now()), 0, 1, HEIGHT);
  g.restore();
  drawGutter();
}

function drawGrid(): void {
  const trace = session.lastTrace();
  if (!trace) return;
  const slot = trace.grid.beat / MIX.score.subdivision;
  const first = Math.ceil((spanStart() - trace.grid.start) / slot);
  const last = Math.floor((timeOf(view.width) - trace.grid.start) / slot);
  for (let s = first; s <= last; s++) {
    const onBeat = s % MIX.score.subdivision === 0;
    const onBar = s % (MIX.score.subdivision * BEATS_PER_BAR) === 0;
    g.fillStyle = onBar ? INK.bar : onBeat ? INK.beat : INK.slot;
    g.fillRect(xOf(trace.grid.start + s * slot), 0, 1, HEIGHT);
  }
}

function drawPresses(): void {
  const top = laneTop("press");
  const rows = Array<number>(PRESS_ROWS).fill(-Infinity);
  for (const p of session.presses) {
    const x = xOf(p.at);
    g.fillStyle = INK.press;
    g.fillRect(x, top + PRESS_TICK_TOP, 1, PRESS_TICK_HEIGHT);
    drawLanding(p, x, top + PRESS_LINK_Y);
    drawLabel(rows, x, top + PRESS_LABEL_TOP, [`${p.id}`]);
  }
}

function drawLanding(p: Press, x: number, y: number): void {
  const landed = session.offers.find((o) => o.id === p.id);
  if (!landed) return;
  g.fillRect(x, y, xOf(landed.at) - x, 1);
  g.fillRect(xOf(landed.at), y - 2, 1, 5);
}

function drawLine(line: Line): void {
  const top = laneTop(line);
  const mine = session.offers.filter((o) => o.line === line);
  drawCrowdWindows(mine, top, laneHeight(line));
  for (const s of session.sounded) if (lineOf(s.cue) === line) drawSound(s, top, laneHeight(line));
  drawPhrases(mine, top, laneHeight(line));
  const rows = Array<number>(LABEL_ROWS).fill(-Infinity);
  for (const o of mine) drawMark(o, top, laneHeight(line), rows);
}

function drawCrowdWindows(mine: Offered[], top: number, height: number): void {
  g.fillStyle = INK.crowd;
  for (const o of mine.filter((x) => x.result === "played")) {
    const x0 = xOf(o.at);
    g.fillRect(x0, top + height - GAP_BAND, xOf(o.at + MIX.score.stabGapSeconds) - x0, GAP_BAND);
  }
}

function offerOf(id: number | null): Offered {
  const found = session.offers.find((o) => o.id === id);
  if (!found) throw new Error(`No event ${id}`);
  return found;
}

function drawSound(s: Sounded, top: number, height: number): void {
  const x0 = xOf(s.start);
  const h = BLOCK_HEIGHT * Math.min(1, s.gain);
  const y = top + height - BLOCK_FLOOR - h;
  g.fillStyle = s.stab ? INK.stab : INK.tail;
  g.globalAlpha = BODY_ALPHA;
  g.fillRect(x0, y, Math.max(1, xOf(s.end) - x0), h);
  g.globalAlpha = 1;
  const onset = s.stab ? xOf(offerOf(s.owner).at) : x0;
  g.fillRect(onset, y, ONSET_WIDTH, h);
}

function drawPhrases(mine: Offered[], top: number, height: number): void {
  g.fillStyle = INK.tail;
  for (const o of mine.filter((x) => x.result === "played")) {
    const tails = session.sounded.filter((s) => s.owner === o.id && !s.stab);
    if (tails.length === 0) continue;
    const x0 = xOf(o.at);
    g.fillRect(x0, top + height - 2, xOf(tails[tails.length - 1].start) - x0, 1);
  }
}

function drawMark(o: Offered, top: number, height: number, rows: number[]): void {
  const x = xOf(o.at);
  g.fillStyle = RESULT_INK[o.result];
  g.fillRect(x, top + MARK_TOP, 1, height - MARK_TOP);
  drawShape(o.result, x, top + MARK_TOP);
  drawLabel(rows, x, top + LABEL_TOP, [`${o.id} ${EVENT_LABELS[o.cue]}`, `${o.id}`]);
}

function circlePath(x: number, y: number): void {
  g.arc(x + 0.5, y, MARK_RADIUS, 0, Math.PI * 2);
}

function diamondPath(x: number, y: number): void {
  g.moveTo(x + 0.5, y - MARK_RADIUS - 1);
  g.lineTo(x + MARK_RADIUS + 1.5, y);
  g.lineTo(x + 0.5, y + MARK_RADIUS + 1);
  g.lineTo(x - MARK_RADIUS - 0.5, y);
  g.closePath();
}

const SHAPES: Record<Result, { path: (x: number, y: number) => void; filled: boolean; slash: boolean }> = {
  played: { path: circlePath, filled: true, slash: false },
  skipped: { path: circlePath, filled: false, slash: false },
  crowded: { path: circlePath, filled: false, slash: true },
  forced: { path: diamondPath, filled: true, slash: false },
};

function drawShape(result: Result, x: number, y: number): void {
  const shape = SHAPES[result];
  g.strokeStyle = RESULT_INK[result];
  g.fillStyle = RESULT_INK[result];
  g.beginPath();
  shape.path(x, y);
  if (shape.filled) g.fill();
  else g.stroke();
  if (!shape.slash) return;
  g.beginPath();
  g.moveTo(x - MARK_RADIUS, y + MARK_RADIUS);
  g.lineTo(x + MARK_RADIUS + 1, y - MARK_RADIUS);
  g.stroke();
}

function drawLabel(rows: number[], x: number, origin: number, texts: string[]): void {
  if (x < GUTTER) return;
  const free = rows.findIndex((end) => x > end + LABEL_GAP);
  const row = free >= 0 ? free : rows.indexOf(Math.min(...rows));
  const text = free >= 0 ? texts[0] : texts[texts.length - 1];
  const width = g.measureText(text).width;
  const y = origin + row * ROW_HEIGHT;
  rows[row] = x + LABEL_GAP + width;
  g.fillStyle = INK.well;
  g.fillRect(x + LABEL_GAP - 2, y - 10, width + 4, ROW_HEIGHT);
  g.fillStyle = INK.text;
  g.fillText(text, x + LABEL_GAP, y);
}

function baseY(top: number, value: number): number {
  return top + laneHeight("base") - 6 - value * (laneHeight("base") - 12);
}

function drawBase(): void {
  const top = laneTop("base");
  const bottom = top + laneHeight("base") - 6;
  for (const trace of session.traces.values()) {
    if (trace.gain.length === 0) continue;
    drawBaseColumns(trace, top, bottom);
  }
}

function drawBaseColumns(trace: BaseTrace, top: number, bottom: number): void {
  for (let x = GUTTER; x < view.width; x += COLUMN_STEP) {
    const { gain, heard } = baseLevels(trace, timeOf(x));
    g.fillStyle = INK.base;
    g.fillRect(x, baseY(top, heard), COLUMN_STEP, bottom - baseY(top, heard));
    g.fillStyle = INK.duck;
    g.fillRect(x, baseY(top, gain), COLUMN_STEP, baseY(top, heard) - baseY(top, gain));
    g.fillStyle = INK.baseEdge;
    g.fillRect(x, baseY(top, gain), COLUMN_STEP, 1);
  }
}

function drawHeat(): void {
  const top = laneTop("heat");
  const height = laneHeight("heat");
  const ceiling = MIX.score.hotHeat * HEAT_CEILING_OVER_HOT;
  const scale = (v: number) => top + height - 4 - (Math.min(v, ceiling) / ceiling) * (height - 8);
  g.fillStyle = INK.hot;
  g.fillRect(GUTTER, scale(MIX.score.hotHeat), view.width - GUTTER, 1);
  g.fillText("hot", view.width - 28, scale(MIX.score.hotHeat) - 4);
  g.strokeStyle = INK.heat;
  g.beginPath();
  for (let x = GUTTER; x <= xOf(session.now()); x += COLUMN_STEP) g.lineTo(x, scale(session.heatAt(timeOf(x))));
  g.stroke();
}

function laneReadout(lane: LaneId, now: number): string {
  if (lane === "heat") return session.heatAt(now).toFixed(2);
  const trace = session.lastTrace();
  if (lane !== "base" || !session.lastRaised || !trace) return "";
  return `${session.lastRaised.replace("score-", "")} ${baseLevels(trace, now).heard.toFixed(2)}`;
}

function drawGutter(): void {
  const now = session.now();
  for (const lane of LANES) {
    const top = laneTop(lane.id);
    g.fillStyle = INK.gutter;
    g.fillRect(0, top, GUTTER, lane.height);
    g.fillStyle = INK.label;
    g.fillText(lane.id, 8, top + 16);
    g.fillStyle = INK.text;
    g.fillText(laneReadout(lane.id, now), 8, top + 32);
    g.fillStyle = INK.slot;
    g.fillRect(0, top + lane.height - 1, view.width, 1);
  }
}

function toggle(label: string, on: () => boolean, flip: () => void, size = "btn-s"): HTMLElement {
  const b = el("button", { class: size }, label);
  b.addEventListener("click", () => {
    flip();
    b.classList.toggle("on", on());
  });
  return b;
}

function choice<T>(options: { label: string; value: T }[], pick: (value: T) => void, initial = 0): HTMLElement {
  const buttons = options.map((o, i) => el("button", { class: i === initial ? "btn-s on" : "btn-s" }, o.label));
  buttons.forEach((b, i) =>
    b.addEventListener("click", () => {
      for (const other of buttons) other.classList.toggle("on", other === b);
      pick(options[i].value);
    }),
  );
  return el("div", { class: "score-lab-buttons" }, ...buttons);
}

function takeChoice(cue: AccentCue): HTMLElement {
  const takes = SOUNDS[cue].files.map((file, i) => ({ label: `${i + 1}`, value: file as string | null }));
  return choice([{ label: "Any", value: null }, ...takes], (file) => session.pinTake(cue, file));
}

function panel(...children: HTMLElement[]): HTMLElement {
  return el("div", { class: "panel" }, ...children);
}

function toggleHold(): void {
  held = held === null ? session.now() : null;
}

const combatButton = toggle("Combat", () => session.inCombat, () => session.flipCombat(), "btn-l");
const eventButtons = new Map<AccentCue, HTMLElement>();
const eventGroups = EVENT_GROUPS.map((group) =>
  el(
    "div",
    { class: "score-lab-buttons" },
    ...group.map((cue) => {
      const b = el("button", { onclick: () => session.fire(cue), title: TIPS[cue] }, EVENT_LABELS[cue]);
      eventButtons.set(cue, b);
      return b;
    }),
  ),
);
const forceButton = toggle("Force", () => session.forced, () => session.setForced(!session.forced), "btn-l");
forceButton.title = "Every event plays its sound, skipping chance and the stab gap";
const controlsPanel = panel(el("div", { class: "score-lab-buttons" }, combatButton, forceButton), ...eventGroups);

const baseChoice = choice(
  [{ label: "Any", value: null }, ...BASE_CUES.map((id) => ({ label: id.replace("score-", ""), value: id as BaseCue | null }))],
  (id) => session.pickBase(id),
);
const tracksPanel = panel(
  el(
    "div",
    { class: "score-lab-picks" },
    el("span", {}, "Base"),
    baseChoice,
    ...TRACK_ROWS.flatMap((cue) => [el("span", {}, EVENT_LABELS[cue]), takeChoice(cue)]),
  ),
);

const zoomChoice = choice(
  ZOOM_SECONDS.map((seconds) => ({ label: `${seconds} s`, value: seconds })),
  (seconds) => (span = seconds),
  ZOOM_SECONDS.indexOf(DEFAULT_ZOOM),
);
const holdButton = toggle("Hold", () => held !== null, toggleHold);
const holder = el("div", { class: "score-lab-canvas" }, canvas);
const timelinePanel = panel(el("div", { class: "score-lab-bar" }, zoomChoice, holdButton), holder);

const ledgerRows = el("div", { class: "score-lab-rows" });
const ledgerHead = el("div", { class: "score-lab-entry score-lab-head" }, ...LEDGER_HEAD.map((word) => el("span", {}, word)));
const ledgerPanel = panel(ledgerHead, ledgerRows);

function setDisabled(button: HTMLElement, reason: string | null, tip: string): void {
  button.setAttribute("aria-disabled", String(reason !== null));
  button.title = reason ?? tip;
}

function syncControls(): void {
  const noCombat = session.inCombat ? null : "Combat is off";
  combatButton.classList.toggle("on", session.inCombat);
  for (const [cue, b] of eventButtons) setDisabled(b, noCombat, TIPS[cue]);
}

function ledgerRow(row: LedgerRow): HTMLElement {
  const [id, event, line, result, heat, tails, note] = ledgerCells(row);
  return el(
    "div",
    { class: "row score-lab-entry" },
    el("span", { class: "num" }, id),
    el("span", {}, event),
    el("span", { class: "dim" }, line),
    el("span", { class: `tag ${result}` }, result),
    el("span", { class: "num" }, heat),
    el("span", { class: "num" }, tails),
    el("span", { class: "dim" }, note),
  );
}

function syncLedger(): void {
  const key = `${session.offers.length}/${session.sounded.length}`;
  if (ledgerRows.dataset.key === key) return;
  ledgerRows.dataset.key = key;
  ledgerRows.replaceChildren(...session.ledger().reverse().map(ledgerRow));
}

root.replaceChildren(el("div", { class: "score-lab-side" }, controlsPanel, tracksPanel), timelinePanel, ledgerPanel);
new ResizeObserver(() => fitCanvas(holder.clientWidth)).observe(holder);
fitCanvas(holder.clientWidth);
requestAnimationFrame(frame);
