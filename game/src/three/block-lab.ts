import "../ui/style.css";
import "./score-lab.css";
import { BEATS_PER_BAR, MIX, SCORE_BLOCKS } from "../data/sounds";
import { Mixer } from "../audio/mixer";
import type { Role } from "../audio/designer";
import { devEl as el, uiRoot } from "../ui/dom";
import { token } from "../ui/tokens";
import { BlockSession, HEAVY, TURN_SECONDS, type BlockOutput, type BlockSong, type Part, type Played, type VoiceHandle } from "./block-session";
import type { AccentCue } from "./sound";

const SONG_DIR = "/tmp/score-proto/";
const PREP_HINT = "Run scripts/score-blocks-prep.py to write public/tmp/score-proto/ first.";
const ZOOM_SECONDS = [6, 12, 24];
const DEFAULT_ZOOM = 12;
const FUTURE_SHARE = 0.15;
const GUTTER = 96;
const COLUMN_STEP = 2;
const LABEL_GAP = 6;
const AUTO_PAUSE_SECONDS = [1, 4];
const LANES = [
  { id: "events", height: 60 },
  { id: "song", height: 90 },
  { id: "guitars", height: 40 },
  { id: "drums", height: 60 },
  { id: "heat", height: 80 },
] as const;
type LaneId = (typeof LANES)[number]["id"];
const HEIGHT = LANES.reduce((sum, lane) => sum + lane.height, 0);
type Auto = "off" | "busy" | "pauses";

const EVENTS: Record<AccentCue, string> = {
  "accent-sighted": "Sighted",
  "accent-struck": "Hit you",
  "accent-crit": "You crit",
  "accent-crash": "Crash",
  "accent-hit": "You hit",
  "accent-miss": "You miss",
};
const EVENT_GROUPS: AccentCue[][] = [
  ["accent-sighted", "accent-struck", "accent-crit", "accent-crash"],
  ["accent-hit", "accent-miss"],
];

const ROLE_INK: Record<Role | "end", string> = {
  intro: token("--ink-muted"),
  verse: token("--good-deep"),
  wall: token("--good-bright"),
  stop: token("--danger"),
  solo: token("--accent"),
  end: token("--ink-bright"),
};
const INK = {
  text: token("--ink"),
  label: token("--ink-label"),
  now: token("--ink-bright"),
  well: token("--surface-sunk"),
  gutter: token("--surface-well"),
  slot: token("--line-faint"),
  beat: token("--line-soft"),
  bar: token("--line"),
  light: token("--accent"),
  heavy: token("--danger-bright"),
  heat: token("--danger-bright"),
  hot: token("--danger-deep"),
  cool: token("--line"),
};
const FONT = `${token("--text-dense")} ${token("--font-mono")}`;

const root = uiRoot();
root.classList.add("score-lab");
root.append(el("div", { class: "dim" }, "Loading the song..."));
const mixer = new Mixer(MIX);
mixer.unlockOn(window);
const ctx = mixer.ctx;
const song = await loadSong();
const [songBuffer, drumBuffer, guitarBuffer] = await Promise.all([decode(song.file), decode(song.stems.drums), decode(song.stems.guitars)]);
const songLevel = ctx.createGain();
songLevel.gain.value = SCORE_BLOCKS.songGain;
songLevel.connect(mixer.input("music"));
const fillLevel = ctx.createGain();
fillLevel.connect(songLevel);
const guitarLevel = ctx.createGain();
guitarLevel.gain.value = SCORE_BLOCKS.guitarPush;
guitarLevel.connect(songLevel);
const PARTS: Record<Part, { buffer: AudioBuffer; out: AudioNode }> = {
  song: { buffer: songBuffer, out: songLevel },
  guitars: { buffer: guitarBuffer, out: guitarLevel },
};

async function loadSong(): Promise<BlockSong> {
  const res = await fetch(`${SONG_DIR}song.json`);
  if (!res.ok) {
    root.replaceChildren(el("div", { class: "dim" }, PREP_HINT));
    throw new Error(`No song.json at ${SONG_DIR}: ${res.status}. ${PREP_HINT}`);
  }
  return (await res.json()) as BlockSong;
}

async function decode(file: string): Promise<AudioBuffer> {
  const res = await fetch(SONG_DIR + file);
  if (!res.ok) throw new Error(`Cannot fetch ${SONG_DIR + file}: ${res.status}. ${PREP_HINT}`);
  return ctx.decodeAudioData(await res.arrayBuffer());
}

function voice(part: Part, offset: number, when: number, length: number, fade: number): VoiceHandle {
  const { buffer, out } = PARTS[part];
  const seam = SCORE_BLOCKS.seamSeconds;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, when - fade);
  gain.gain.linearRampToValueAtTime(1, when + fade);
  gain.gain.setValueAtTime(1, when + length - seam);
  gain.gain.linearRampToValueAtTime(0, when + length + seam);
  src.connect(gain).connect(out);
  src.start(when - fade, offset - fade, Math.min(buffer.duration - offset + fade, length + fade + SCORE_BLOCKS.jumpFadeSeconds + seam));
  return {
    fadeOut: (at, f) => {
      gain.gain.cancelScheduledValues(at - f);
      gain.gain.setValueAtTime(1, at - f);
      gain.gain.linearRampToValueAtTime(0, at + f);
    },
    cut: (at) => {
      if (when >= at) return src.stop(when);
      gain.gain.cancelScheduledValues(at - seam);
      gain.gain.setValueAtTime(1, at - seam);
      gain.gain.linearRampToValueAtTime(0, at + seam);
      src.stop(at + seam);
    },
  };
}

function fill(offset: number, at: number, length: number, level: number): void {
  const seam = SCORE_BLOCKS.seamSeconds;
  const src = ctx.createBufferSource();
  src.buffer = drumBuffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, at - seam);
  gain.gain.linearRampToValueAtTime(level, at + seam);
  gain.gain.setValueAtTime(level, at + length - seam);
  gain.gain.linearRampToValueAtTime(0, at + length + seam);
  src.connect(gain).connect(fillLevel);
  src.start(at - seam, offset - seam, length + 2 * seam);
}

const output: BlockOutput = { voice, fill };
const session = new BlockSession(song, output, Math.random);
let auto: Auto = "off";
let nextTurn = 0;
let span = DEFAULT_ZOOM;

function flipCombat(): void {
  if (session.inCombat) session.end(ctx.currentTime);
  else {
    session.start(ctx.currentTime);
    nextTurn = ctx.currentTime + SCORE_BLOCKS.startLeadSeconds;
  }
}

function fire(cue: AccentCue): void {
  session.fire(cue, ctx.currentTime + SCORE_BLOCKS.eventLeadSeconds);
}

function autoTurn(now: number): void {
  if (auto === "off" || !session.inCombat || now < nextTurn) return;
  session.denseTurn(nextTurn);
  const [lo, hi] = AUTO_PAUSE_SECONDS;
  nextTurn += TURN_SECONDS + (auto === "pauses" ? lo + Math.random() * (hi - lo) : 0);
}

function frame(): void {
  const now = ctx.currentTime;
  autoTurn(now);
  session.tick(now);
  draw();
  syncStats();
  syncLedger();
  requestAnimationFrame(frame);
}

const canvas = el("canvas", {}) as HTMLCanvasElement;
const g = canvas.getContext("2d")!;
let width = 0;
let viewNow = 0;

function fitCanvas(w: number): void {
  const ratio = window.devicePixelRatio;
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(HEIGHT * ratio);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${HEIGHT}px`;
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  width = w;
}

function spanStart(): number {
  return viewNow - span * (1 - FUTURE_SHARE);
}

function xOf(t: number): number {
  return GUTTER + ((t - spanStart()) / span) * (width - GUTTER);
}

function timeOf(x: number): number {
  return spanStart() + ((x - GUTTER) / (width - GUTTER)) * span;
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
  viewNow = ctx.currentTime;
  g.font = FONT;
  g.fillStyle = INK.well;
  g.fillRect(0, 0, width, HEIGHT);
  g.save();
  g.beginPath();
  g.rect(GUTTER, 0, width - GUTTER, HEIGHT);
  g.clip();
  drawGrid();
  drawEvents();
  drawSong();
  drawGuitars();
  drawDrums();
  drawHeat();
  g.fillStyle = INK.now;
  g.fillRect(xOf(viewNow), 0, 1, HEIGHT);
  g.restore();
  drawGutter();
}

function drawGrid(): void {
  for (const p of session.played) if (inView(p) && p.role !== "end") drawBeats(p);
}

function inView(p: Played): boolean {
  return p.end >= spanStart() && p.start <= timeOf(width);
}

function drawBeats(p: Played): void {
  const beats = p.bars * BEATS_PER_BAR;
  const beat = (p.end - p.start) / beats;
  for (let b = 0; b < beats && p.start + b * beat < p.end; b++) {
    g.fillStyle = b === 0 ? INK.bar : b % BEATS_PER_BAR === 0 ? INK.beat : INK.slot;
    g.fillRect(xOf(p.start + b * beat), 0, 1, HEIGHT);
  }
}

function drawEvents(): void {
  const top = laneTop("events");
  let labelEnd = -Infinity;
  const height = laneHeight("events");
  for (const f of session.fired) {
    const x = xOf(f.at);
    g.fillStyle = HEAVY.has(f.cue) ? INK.heavy : INK.light;
    if (f.result === null) {
      g.fillRect(x, top + height - 14, 1, 10);
      continue;
    }
    g.fillRect(x, top + 4, 2, height - 8);
    if (x < labelEnd + LABEL_GAP) continue;
    const text = `${EVENTS[f.cue]} ${f.result}`;
    g.fillStyle = INK.text;
    g.fillText(text, x + LABEL_GAP, top + 18);
    labelEnd = x + LABEL_GAP + g.measureText(text).width;
  }
}

function drawSong(): void {
  const top = laneTop("song");
  const height = laneHeight("song");
  for (const p of session.played) {
    if (p.end <= p.start) continue;
    const x0 = xOf(p.start);
    g.fillStyle = ROLE_INK[p.role];
    g.globalAlpha = 0.35;
    g.fillRect(x0, top + 24, xOf(p.end) - x0 - 1, height - 30);
    g.globalAlpha = 1;
    g.fillRect(x0, top + 24, 3, height - 30);
    if (p.join === "jump") drawJump(p, top, height);
    g.fillStyle = INK.text;
    g.fillText(p.label, x0 + LABEL_GAP, top + 18);
  }
}

function drawJump(p: Played, top: number, height: number): void {
  g.fillStyle = INK.now;
  g.fillRect(xOf(p.start) - 1, top + 20, 3, height - 22);
}

function drawGuitars(): void {
  const top = laneTop("guitars");
  g.fillStyle = ROLE_INK.solo;
  for (const p of session.played) if (p.guitars && p.end > p.start) g.fillRect(xOf(p.start), top + 8, xOf(p.end) - xOf(p.start) - 1, laneHeight("guitars") - 16);
}

function drawDrums(): void {
  const top = laneTop("drums");
  const height = laneHeight("drums");
  for (const p of session.pushes) {
    const h = p.stab ? height - 12 : (height - 12) / 2;
    g.fillStyle = p.line === "lead" ? INK.heavy : INK.light;
    g.fillRect(xOf(p.at), top + height - 6 - h, 3, h);
  }
}

function drawHeat(): void {
  const top = laneTop("heat");
  const height = laneHeight("heat");
  const arc = SCORE_BLOCKS.arc;
  const ceiling = arc.hotHeat * 2;
  const scale = (v: number) => top + height - 4 - (Math.min(v, ceiling) / ceiling) * (height - 8);
  for (const [value, ink, word] of [[arc.hotHeat, INK.hot, "hot"], [arc.coolHeat, INK.cool, "cool"]] as const) {
    g.fillStyle = ink;
    g.fillRect(GUTTER, scale(value), width - GUTTER, 1);
    g.fillText(word, width - 34, scale(value) - 4);
  }
  g.strokeStyle = INK.heat;
  g.beginPath();
  for (let x = GUTTER; x <= xOf(viewNow); x += COLUMN_STEP) g.lineTo(x, scale(session.heatAt(timeOf(x))));
  g.stroke();
}

function drawGutter(): void {
  const playing = session.playingAt(viewNow);
  const readouts: Record<LaneId, string> = {
    events: String(session.fired.length),
    song: playing?.label ?? "",
    guitars: playing?.guitars ? "pushed" : "",
    drums: String(session.pushes.length),
    heat: session.heatAt(viewNow).toFixed(2),
  };
  for (const lane of LANES) {
    const top = laneTop(lane.id);
    g.fillStyle = INK.gutter;
    g.fillRect(0, top, GUTTER, lane.height);
    g.fillStyle = INK.label;
    g.fillText(lane.id, 8, top + 16);
    g.fillStyle = INK.text;
    g.fillText(readouts[lane.id], 8, top + 32);
    g.fillStyle = INK.slot;
    g.fillRect(0, top + lane.height - 1, width, 1);
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

function panel(...children: HTMLElement[]): HTMLElement {
  return el("div", { class: "panel" }, ...children);
}

const combatButton = toggle("Combat", () => session.inCombat, flipCombat, "btn-l");
const eventButtons = EVENT_GROUPS.map((group) => el("div", { class: "score-lab-buttons" }, ...group.map((cue) => el("button", { onclick: () => fire(cue) }, EVENTS[cue]))));
const autoChoice = choice<Auto>(
  [
    { label: "Off", value: "off" },
    { label: "Busy", value: "busy" },
    { label: "With pauses", value: "pauses" },
  ],
  (value) => {
    auto = value;
    nextTurn = Math.max(nextTurn, ctx.currentTime);
  },
);
const statsBox = el("div", { class: "score-lab-picks" });
const denseButton = el("button", { onclick: () => session.denseTurn(ctx.currentTime + SCORE_BLOCKS.eventLeadSeconds) }, "Dense turn");
denseButton.title = "Up to 10 hits, 8 misses, 3 hits taken, 2 crits, 2 crashes and a sighting in one second";
const controlsPanel = panel(el("div", { class: "score-lab-buttons" }, combatButton, denseButton), ...eventButtons, el("span", { class: "dim" }, "Auto fight"), autoChoice);
const statsPanel = panel(statsBox);

const zoomChoice = choice(
  ZOOM_SECONDS.map((seconds) => ({ label: `${seconds} s`, value: seconds })),
  (seconds) => (span = seconds),
  ZOOM_SECONDS.indexOf(DEFAULT_ZOOM),
);
const holder = el("div", { class: "score-lab-canvas" }, canvas);
const timelinePanel = panel(el("div", { class: "score-lab-bar" }, zoomChoice), holder);

const ledgerRows = el("div", { class: "score-lab-rows" });
const ledgerHead = el("div", { class: "score-lab-entry score-lab-head" }, ...["", "Block", "Bars", "Starts", "Heat", "", "Join and odds"].map((word) => el("span", {}, word)));
const ledgerPanel = panel(ledgerHead, ledgerRows);

function statRows(): [string, string][] {
  return [
    ["Combat", session.inCombat ? "on" : "off"],
    ["Playing", session.playingAt(ctx.currentTime)?.label ?? "-"],
    ["Bars played", String(session.barsPlayed)],
    ["Heat", session.heatAt(ctx.currentTime).toFixed(2)],
  ];
}

function syncStats(): void {
  const rows = statRows();
  const key = rows.map((r) => r[1]).join("|");
  if (statsBox.dataset.key === key) return;
  statsBox.dataset.key = key;
  statsBox.replaceChildren(...rows.flatMap(([k, v]) => [el("span", { class: "dim" }, k), el("span", {}, v)]));
  combatButton.classList.toggle("on", session.inCombat);
}

function ledgerRow(p: Played, i: number, first: number): HTMLElement {
  return el(
    "div",
    { class: "row score-lab-entry" },
    el("span", { class: "num" }, String(i + 1)),
    el("span", {}, p.role),
    el("span", {}, p.label.replace(`${p.role} `, "")),
    el("span", { class: "num" }, `${(p.start - first).toFixed(1)} s`),
    el("span", { class: "num" }, p.heat.toFixed(1)),
    el("span", {}, ""),
    el("span", { class: "dim" }, p.odds ? `${p.join}. Odds were ${p.odds}` : p.join),
  );
}

function syncLedger(): void {
  const played = session.played;
  const key = String(played.length);
  if (ledgerRows.dataset.key === key) return;
  ledgerRows.dataset.key = key;
  const first = played[0]?.start ?? 0;
  ledgerRows.replaceChildren(...played.map((p, i) => ledgerRow(p, i, first)).reverse());
}

root.replaceChildren(el("div", { class: "score-lab-side" }, controlsPanel, statsPanel), timelinePanel, ledgerPanel);
new ResizeObserver(() => fitCanvas(holder.clientWidth)).observe(holder);
fitCanvas(holder.clientWidth);
requestAnimationFrame(frame);
