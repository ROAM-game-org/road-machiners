import "../ui/style.css";
import "./score-lab.css";
import { BEATS_PER_BAR, JAM_PARTS, MIX, SCORE_BLOCKS, type BandEvent, type JamPart } from "../data/sounds";
import { Mixer } from "../audio/mixer";
import type { Role } from "../audio/designer";
import { devEl as el, uiRoot } from "../ui/dom";
import { token } from "../ui/tokens";
import { BAND_EVENT_GROUPS, BAND_EVENT_LABELS } from "./band-session";
import { HEAVY, TURN_SECONDS, type Played } from "./block-session";
import { ducked, endStart, JamSession, onPartBus, takeEnd, type JamOutput, type JamSong, type JamSwitches, type Take } from "./jam-session";
import type { Move } from "./score-session";

const SONG_DIR = "/tmp/jam/";
const PREP_HINT = "Run scripts/jam-prep.py to write public/tmp/jam/ first.";
const ZOOM_SECONDS = [6, 12, 24];
const DEFAULT_ZOOM = 12;
const FUTURE_SHARE = 0.15;
const GUTTER = 96;
const COLUMN_STEP = 2;
const LABEL_GAP = 6;
const AUTO_PAUSE_SECONDS = [1, 4];
const PART_HEIGHT = 44;
const LANES = [
  { id: "events", height: 40 },
  { id: "song", height: 60 },
  ...JAM_PARTS.map((id) => ({ id, height: PART_HEIGHT })),
  { id: "heat", height: 70 },
] as const;
type LaneId = (typeof LANES)[number]["id"];
const HEIGHT = LANES.reduce((sum, lane) => sum + lane.height, 0);
type Auto = "off" | "busy" | "pauses";

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
  part: token("--good-deep"),
  light: token("--accent"),
  heavy: token("--danger-bright"),
  heat: token("--danger-bright"),
  hot: token("--danger-deep"),
};
const FONT = `${token("--text-dense")} ${token("--font-mono")}`;

const root = uiRoot();
root.classList.add("score-lab");
root.append(el("div", { class: "dim" }, "Loading the song..."));
const mixer = new Mixer(MIX);
mixer.unlockOn(window);
const ctx = mixer.ctx;
const song = await loadSong();
const buffers = Object.fromEntries(await Promise.all(JAM_PARTS.map(async (part) => [part, await decode(song.parts[part])] as const))) as Record<JamPart, AudioBuffer>;
const master = ctx.createGain();
master.connect(mixer.input("music"));
const partBus = Object.fromEntries(
  JAM_PARTS.map((part) => {
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(master);
    return [part, bus];
  }),
) as Record<JamPart, GainNode>;
const duckBus = Object.fromEntries(
  JAM_PARTS.map((part) => {
    const bus = ctx.createGain();
    bus.connect(partBus[part]);
    return [part, bus];
  }),
) as Record<JamPart, GainNode>;
const voices = new Map<Take, { src: AudioBufferSourceNode; gain: GainNode; endFrom: number }>();

async function loadSong(): Promise<JamSong> {
  const res = await fetch(`${SONG_DIR}song.json`);
  if (!res.ok) {
    root.replaceChildren(el("div", { class: "dim" }, PREP_HINT));
    throw new Error(`No song.json at ${SONG_DIR}: ${res.status}. ${PREP_HINT}`);
  }
  return (await res.json()) as JamSong;
}

async function decode(file: string): Promise<AudioBuffer> {
  const res = await fetch(SONG_DIR + file);
  if (!res.ok) throw new Error(`Cannot fetch ${SONG_DIR + file}: ${res.status}. ${PREP_HINT}`);
  return ctx.decodeAudioData(await res.arrayBuffer());
}

function scheduleEnd(gain: GainNode, take: Take): void {
  if (take.ring !== null) {
    gain.gain.setValueAtTime(take.gain, take.until);
    gain.gain.setTargetAtTime(0, take.until, take.ring);
    return;
  }
  gain.gain.setValueAtTime(take.gain, endStart(take));
  gain.gain.linearRampToValueAtTime(0, take.until + take.endFade);
}

function busOf(take: Take): AudioNode {
  if (ducked(take)) return duckBus[take.part];
  return onPartBus(take) ? partBus[take.part] : master;
}

function duck(moves: readonly Move[], from: number): void {
  const now = ctx.currentTime;
  for (const bus of Object.values(duckBus)) {
    bus.gain.cancelScheduledValues(Math.max(now, from));
    for (const m of moves) bus.gain.setTargetAtTime(m.target, Math.max(now, m.at), m.tc);
  }
}

function play(take: Take): void {
  const now = ctx.currentTime;
  const begin = Math.max(now, take.at - take.fadeIn);
  const src = ctx.createBufferSource();
  src.buffer = buffers[take.part];
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, begin);
  gain.gain.linearRampToValueAtTime(take.gain, Math.max(begin, take.at + take.fadeIn));
  scheduleEnd(gain, take);
  src.connect(gain).connect(busOf(take));
  src.start(begin, Math.max(0, take.from + begin - take.at));
  src.stop(takeEnd(take));
  voices.set(take, { src, gain, endFrom: endStart(take) });
}

function end(take: Take): void {
  const voice = voices.get(take);
  if (!voice) throw new Error(`Take of ${take.part} at ${take.at.toFixed(2)} ended before it played`);
  if (take.gain === 0) return voice.src.stop();
  voice.gain.gain.cancelScheduledValues(Math.max(ctx.currentTime, Math.min(voice.endFrom, endStart(take))));
  scheduleEnd(voice.gain, take);
  voice.src.stop(takeEnd(take));
  voice.endFrom = endStart(take);
}

function move(part: JamPart, m: Move): void {
  partBus[part].gain.setTargetAtTime(m.target, Math.max(ctx.currentTime, m.at), m.tc);
}

const output: JamOutput = { play, end, move, duck };
const session = new JamSession(song, output, Math.random);
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
  for (const part of JAM_PARTS) drawPart(part);
  drawHeat();
  g.fillStyle = INK.now;
  g.fillRect(xOf(viewNow), 0, 1, HEIGHT);
  g.restore();
  drawGutter();
}

function drawGrid(): void {
  for (const p of session.blocks.played) if (p.end >= spanStart() && p.start <= timeOf(width) && p.role !== "end") drawBeats(p);
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
  const height = laneHeight("events");
  for (const p of session.presses) {
    g.fillStyle = HEAVY.has(p.cue) ? INK.heavy : INK.light;
    const answered = p.answers.length > 0;
    g.fillRect(xOf(p.at), answered ? top + 4 : top + height - 14, answered ? 2 : 1, answered ? height - 8 : 10);
  }
}

function drawSong(): void {
  const top = laneTop("song");
  const height = laneHeight("song");
  for (const p of session.blocks.played) {
    if (p.end <= p.start) continue;
    const x0 = xOf(p.start);
    g.fillStyle = ROLE_INK[p.role];
    g.globalAlpha = 0.35;
    g.fillRect(x0, top + 24, xOf(p.end) - x0 - 1, height - 30);
    g.globalAlpha = 1;
    g.fillRect(x0, top + 24, p.join === "jump" ? 3 : 1, height - 30);
    g.fillStyle = INK.text;
    g.fillText(p.join === "jump" ? `${p.label} jump` : p.label, x0 + LABEL_GAP, top + 18);
  }
}

function drawPart(part: JamPart): void {
  const top = laneTop(part);
  const height = PART_HEIGHT - 8;
  g.fillStyle = INK.part;
  for (let x = GUTTER; x <= xOf(viewNow + span * FUTURE_SHARE); x += COLUMN_STEP) {
    const level = session.levelOf(part, timeOf(x));
    g.fillRect(x, top + 4 + height * (1 - level), COLUMN_STEP, height * level);
  }
  for (const take of session.takes) if (take.part === part && isAnswer(take)) drawTake(take, top);
}

function isAnswer(take: Take): boolean {
  return take.kind !== "block" && take.gain > 0;
}

function drawTake(take: Take, top: number): void {
  g.fillStyle = take.kind === "push" ? ROLE_INK.solo : take.cue && HEAVY.has(take.cue) ? INK.heavy : INK.light;
  const x0 = xOf(take.at);
  const h = take.kind === "push" ? 4 : PART_HEIGHT - 16;
  g.fillRect(x0, top + PART_HEIGHT - 4 - h, Math.max(2, xOf(take.until) - x0), h);
}

function drawHeat(): void {
  const top = laneTop("heat");
  const height = laneHeight("heat");
  const hot = SCORE_BLOCKS.arc.hotHeat;
  const ceiling = hot * 2;
  const scale = (v: number) => top + height - 4 - (Math.min(v, ceiling) / ceiling) * (height - 8);
  g.fillStyle = INK.hot;
  g.fillRect(GUTTER, scale(hot), width - GUTTER, 1);
  g.fillText("hot", width - 34, scale(hot) - 4);
  g.strokeStyle = INK.heat;
  g.beginPath();
  for (let x = GUTTER; x <= xOf(viewNow); x += COLUMN_STEP) g.lineTo(x, scale(session.heatAt(timeOf(x))));
  g.stroke();
}

const READOUTS: Record<"events" | "song" | "heat", () => string> = {
  events: () => String(session.presses.length),
  song: () => session.playingAt(viewNow)?.label ?? "",
  heat: () => session.heatAt(viewNow).toFixed(2),
};

function readout(lane: LaneId): string {
  if (lane in READOUTS) return READOUTS[lane as keyof typeof READOUTS]();
  return session.levelOf(lane as JamPart, viewNow) > 0.5 ? "in" : "";
}

function drawGutter(): void {
  for (const lane of LANES) {
    const top = laneTop(lane.id);
    g.fillStyle = INK.gutter;
    g.fillRect(0, top, GUTTER, lane.height);
    g.fillStyle = INK.label;
    g.fillText(lane.id, 8, top + 16);
    g.fillStyle = INK.text;
    g.fillText(readout(lane.id), 8, top + 32);
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

function switchRow<K extends keyof JamSwitches>(key: K, title: string, first: [string, JamSwitches[K]], second: [string, JamSwitches[K]]): HTMLElement[] {
  const options = [first, second].map(([label, value]) => ({ label, value }));
  return [el("span", { class: "dim" }, title), choice(options, (value) => (session.switches[key] = value), options.findIndex((o) => o.value === session.switches[key]))];
}

function panel(...children: HTMLElement[]): HTMLElement {
  return el("div", { class: "panel" }, ...children);
}

function fire(cue: BandEvent): void {
  session.fire(cue, ctx.currentTime);
}

const combatButton = toggle("Combat", () => session.inCombat, flipCombat, "btn-l");
const eventButtons = BAND_EVENT_GROUPS.map((group) => el("div", { class: "score-lab-buttons" }, ...group.map((cue) => el("button", { onclick: () => fire(cue) }, BAND_EVENT_LABELS[cue]))));
const denseButton = el("button", { onclick: () => session.denseTurn(ctx.currentTime) }, "Dense turn");
denseButton.title = "Up to 10 hits, 8 misses, 3 hits taken, 2 crits, 2 crashes and a sighting in one second";
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
const switches = [
  ...switchRow("parts", "Parts", ["By heat", "band"], ["All", "all"]),
  ...switchRow("answers", "Answers", ["Band", "band"], ["Drum fills", "fills"]),
  ...switchRow("jumps", "Jumps", ["Fade", "fade"], ["Ring out", "ring"]),
];
const statsBox = el("div", { class: "score-lab-picks" });
const controlsPanel = panel(el("div", { class: "score-lab-buttons" }, combatButton, denseButton), ...eventButtons, el("span", { class: "dim" }, "Auto fight"), autoChoice, ...switches);
const statsPanel = panel(statsBox);

const zoomChoice = choice(
  ZOOM_SECONDS.map((seconds) => ({ label: `${seconds} s`, value: seconds })),
  (seconds) => (span = seconds),
  ZOOM_SECONDS.indexOf(DEFAULT_ZOOM),
);
const holder = el("div", { class: "score-lab-canvas" }, canvas);
const timelinePanel = panel(el("div", { class: "score-lab-bar" }, zoomChoice), holder);

const ledgerRows = el("div", { class: "score-lab-rows" });
const ledgerHead = el("div", { class: "score-lab-entry score-lab-head" }, ...["", "Block", "Bars", "Starts", "Heat", "", "Join"].map((word) => el("span", {}, word)));
const ledgerPanel = panel(ledgerHead, ledgerRows);

function statRows(): [string, string][] {
  const now = ctx.currentTime;
  return [
    ["Combat", session.inCombat ? "on" : "off"],
    ["Playing", session.playingAt(now)?.label ?? "-"],
    ["Parts in", JAM_PARTS.filter((p) => session.levelOf(p, now) > 0.5).join(", ") || "-"],
    ["Heat", session.heatAt(now).toFixed(2)],
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
    el("span", { class: "dim" }, p.join),
  );
}

function syncLedger(): void {
  const played = session.blocks.played;
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
