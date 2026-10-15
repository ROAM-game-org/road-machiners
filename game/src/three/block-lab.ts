import "../ui/style.css";
import "./score-lab.css";
import { BEATS_PER_BAR, MIX, SCORE_BLOCKS } from "../data/sounds";
import { Mixer } from "../audio/mixer";
import { BlockSequencer, blocksOf, Fading, type Block, type Role, type Section } from "../audio/designer";
import { devEl as el, uiRoot } from "../ui/dom";
import { token } from "../ui/tokens";
import type { AccentCue } from "./sound";

const SONG_DIR = "/tmp/score-proto/";
const PREP_HINT = "Run scripts/score-blocks-prep.py to write public/tmp/score-proto/ first.";
const ZOOM_SECONDS = [6, 12, 24];
const DEFAULT_ZOOM = 12;
const FUTURE_SHARE = 0.15;
const GUTTER = 96;
const COLUMN_STEP = 2;
const LABEL_GAP = 6;
const TURN_SECONDS = 1;
const LANES = [
  { id: "events", height: 60 },
  { id: "song", height: 90 },
  { id: "lead", height: 40 },
  { id: "heat", height: 80 },
] as const;
type LaneId = (typeof LANES)[number]["id"];
const HEIGHT = LANES.reduce((sum, lane) => sum + lane.height, 0);

type Song = {
  file: string;
  bpm: number;
  length: number;
  barTimes: number[];
  sections: Section[];
  end: number;
  lead: { file: string; start: number; from: number; bars: number };
};
type Voice = { src: AudioBufferSourceNode; gain: GainNode };
type Played = { label: string; role: Role | "end"; bar: number; bars: number; start: number; end: number; voices: Voice[]; heat: number; sinceStop: number; join: string };
type Fired = { cue: AccentCue; at: number };
type Span = { from: number; to: number };
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
const HEAVY = new Set<AccentCue>(["accent-sighted", "accent-struck", "accent-crit", "accent-crash"]);
const LEAD_UNDER = new Set<Role>(["intro", "verse", "wall"]);
const AUTO_ODDS: [AccentCue, number][] = [
  ["accent-hit", 0.35],
  ["accent-miss", 0.25],
  ["accent-struck", 0.2],
  ["accent-crit", 0.05],
  ["accent-crash", 0.04],
];
const AUTO_PAUSE_SECONDS = [1, 4];

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
const songBuffer = await decode(song.file);
const leadBuffer = await decode(song.lead.file);
const blocks = blocksOf(song.sections, SCORE_BLOCKS.arc.blockBars);
const songLevel = ctx.createGain();
songLevel.gain.value = SCORE_BLOCKS.songGain;
songLevel.connect(mixer.input("music"));
const leadLevel = ctx.createGain();
leadLevel.gain.value = 0;
leadLevel.connect(songLevel);

async function loadSong(): Promise<Song> {
  const res = await fetch(`${SONG_DIR}song.json`);
  if (!res.ok) {
    root.replaceChildren(el("div", { class: "dim" }, PREP_HINT));
    throw new Error(`No song.json at ${SONG_DIR}: ${res.status}. ${PREP_HINT}`);
  }
  return (await res.json()) as Song;
}

async function decode(file: string): Promise<AudioBuffer> {
  const res = await fetch(SONG_DIR + file);
  if (!res.ok) throw new Error(`Cannot fetch ${SONG_DIR + file}: ${res.status}. ${PREP_HINT}`);
  return ctx.decodeAudioData(await res.arrayBuffer());
}

const played: Played[] = [];
const fired: Fired[] = [];
const heats: { at: number; value: number }[] = [];
let heat = new Fading(MIX.score.heatHalfLifeSeconds);
let sequencer: BlockSequencer | null = null;
let nextAt = 0;
let inCombat = false;
let auto: Auto = "off";
let nextTurn = 0;
let span = DEFAULT_ZOOM;
const leadOpen: Span[] = [];
const beatSeconds = 60 / song.bpm;

function barTime(bar: number): number {
  return song.barTimes[bar - 1];
}

function voice(buffer: AudioBuffer, out: AudioNode, offset: number, when: number, length: number, leadIn: number): Voice {
  const seam = SCORE_BLOCKS.seamSeconds;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  const from = Math.min(leadIn + seam, offset);
  gain.gain.setValueAtTime(0, when - from);
  gain.gain.linearRampToValueAtTime(1, when + (leadIn > 0 ? 0 : seam));
  gain.gain.setValueAtTime(1, when + length - seam);
  gain.gain.linearRampToValueAtTime(0, when + length + seam);
  src.connect(gain).connect(out);
  src.start(when - from, offset - from, Math.min(buffer.duration - offset + from, from + length + SCORE_BLOCKS.jumpTailBeats * beatSeconds + seam));
  return { src, gain };
}

function ringOn(p: Played): void {
  const seam = SCORE_BLOCKS.seamSeconds;
  for (const v of p.voices) {
    v.gain.gain.cancelScheduledValues(p.end - seam);
    v.gain.gain.setValueAtTime(1, p.end);
    v.gain.gain.linearRampToValueAtTime(0, p.end + SCORE_BLOCKS.jumpTailBeats * beatSeconds);
  }
}

function leadVoice(block: Block, when: number, length: number, leadIn: number): Voice[] {
  if (!LEAD_UNDER.has(block.role)) return [];
  const into = (block.bar - song.sections[block.section].from) % song.lead.bars;
  return [voice(leadBuffer, leadLevel, barTime(song.lead.from + into) - song.lead.start, when, length, leadIn)];
}

function joinOf(block: Block): string {
  const before = played.at(-1);
  if (!before) return "start";
  return before.bar + before.bars === block.bar ? "follows" : "jump";
}

function schedule(block: Block, when: number, heatNow: number): number {
  const offset = barTime(block.bar);
  const length = barTime(block.bar + block.bars) - offset;
  const join = joinOf(block);
  const leadIn = join === "jump" ? SCORE_BLOCKS.jumpLeadBeats * beatSeconds : 0;
  if (join === "jump") ringOn(played.at(-1)!);
  const voices = [voice(songBuffer, songLevel, offset, when, length, leadIn), ...leadVoice(block, when, length, leadIn)];
  const label = `${block.role} ${block.bar}-${block.bar + block.bars - 1}`;
  played.push({ label, role: block.role, bar: block.bar, bars: block.bars, start: when, end: when + length, voices, heat: heatNow, sinceStop: sequencer!.barsSinceStop, join });
  return when + length;
}

function startCombat(): void {
  inCombat = true;
  heat = new Fading(MIX.score.heatHalfLifeSeconds);
  sequencer = new BlockSequencer(blocks, SCORE_BLOCKS.arc, Math.random);
  nextAt = ctx.currentTime + SCORE_BLOCKS.startLeadSeconds;
  nextTurn = nextAt;
}

function nextBeatAfter(t: number): number {
  const now = played.find((p) => p.start <= t && t < p.end);
  if (!now) return t;
  const beat = (now.end - now.start) / (now.bars * BEATS_PER_BAR);
  return now.start + Math.ceil((t - now.start) / beat) * beat;
}

function endCombat(): void {
  inCombat = false;
  sequencer = null;
  const at = nextBeatAfter(ctx.currentTime + SCORE_BLOCKS.startLeadSeconds);
  for (const p of played.filter((x) => x.end > at)) cut(p, at);
  closeLead(at);
  const offset = barTime(song.end);
  const voices = [voice(songBuffer, songLevel, offset, at, song.length - offset, 0)];
  played.push({ label: "end", role: "end", bar: song.end, bars: 1, start: at, end: at + song.length - offset, voices, heat: heat.read(at), sinceStop: 0, join: "end" });
}

function closeLead(at: number): void {
  leadLevel.gain.cancelScheduledValues(at);
  leadLevel.gain.setTargetAtTime(0, at, SCORE_BLOCKS.seamSeconds);
  const last = leadOpen.at(-1);
  if (last && last.to > at) last.to = Math.max(last.from, at);
}

function cut(p: Played, at: number): void {
  const seam = SCORE_BLOCKS.seamSeconds;
  for (const v of p.voices) {
    if (p.start >= at) {
      v.src.stop(p.start);
      continue;
    }
    v.gain.gain.cancelScheduledValues(at - seam);
    v.gain.gain.setValueAtTime(1, at - seam);
    v.gain.gain.linearRampToValueAtTime(0, at + seam);
    v.src.stop(at + seam);
  }
  p.end = Math.max(p.start, Math.min(p.end, at));
}

function flipCombat(): void {
  if (inCombat) endCombat();
  else startCombat();
}

function fire(cue: AccentCue, at = ctx.currentTime + SCORE_BLOCKS.eventLeadSeconds): void {
  if (!inCombat) return;
  if (HEAVY.has(cue)) openLead(at);
  heat.add(at, MIX.score.accents[cue].weight);
  heats.push({ at, value: heat.read(at) });
  fired.push({ cue, at });
}

function closeAfter(at: number): number {
  const p = played.find((x) => x.start <= at && at < x.end) ?? played.at(-1);
  if (!p) throw new Error("The lead opened with no block playing");
  const bar = (p.end - p.start) / p.bars;
  return p.start + Math.ceil((at - p.start) / bar) * bar + bar * (SCORE_BLOCKS.leadHoldBars - 1);
}

function openLead(at: number): void {
  const close = Math.max(closeAfter(at), at + beatSeconds);
  const fade = SCORE_BLOCKS.leadFadeOutBeats * beatSeconds;
  const level = leadLevel.gain;
  level.cancelScheduledValues(at);
  level.setTargetAtTime(SCORE_BLOCKS.leadGain, at, SCORE_BLOCKS.leadFadeInSeconds / 3);
  level.setTargetAtTime(0, close, fade / 3);
  const last = leadOpen.at(-1);
  if (last && last.to >= at) last.to = close + fade;
  else leadOpen.push({ from: at, to: close + fade });
}

function autoTurn(now: number): void {
  if (auto === "off" || !inCombat || now < nextTurn) return;
  const events = AUTO_ODDS.filter(([, odds]) => Math.random() < odds).map(([cue]) => cue);
  events.forEach((cue, i) => fire(cue, nextTurn + ((i + 1) / (events.length + 1)) * TURN_SECONDS));
  const [lo, hi] = AUTO_PAUSE_SECONDS;
  nextTurn += TURN_SECONDS + (auto === "pauses" ? lo + Math.random() * (hi - lo) : 0);
}

function frame(): void {
  const now = ctx.currentTime;
  if (sequencer && nextAt - now < SCORE_BLOCKS.aheadSeconds) {
    const h = heat.read(nextAt);
    nextAt = schedule(sequencer.next(h), nextAt, h);
  }
  autoTurn(now);
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
  drawLead();
  drawHeat();
  g.fillStyle = INK.now;
  g.fillRect(xOf(viewNow), 0, 1, HEIGHT);
  g.restore();
  drawGutter();
}

function drawGrid(): void {
  for (const p of played) if (inView(p) && p.role !== "end") drawBeats(p);
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
  for (const f of fired) {
    const x = xOf(f.at);
    g.fillStyle = HEAVY.has(f.cue) ? INK.heavy : INK.light;
    g.fillRect(x, top + 4, 2, laneHeight("events") - 8);
    if (x < labelEnd + LABEL_GAP) continue;
    const text = EVENTS[f.cue];
    g.fillStyle = INK.text;
    g.fillText(text, x + LABEL_GAP, top + 18);
    labelEnd = x + LABEL_GAP + g.measureText(text).width;
  }
}

function drawSong(): void {
  const top = laneTop("song");
  const height = laneHeight("song");
  for (const p of played) {
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
  const x0 = xOf(p.start - SCORE_BLOCKS.jumpLeadBeats * beatSeconds);
  const x1 = xOf(p.start + SCORE_BLOCKS.jumpTailBeats * beatSeconds);
  g.fillStyle = INK.now;
  g.fillRect(x0, top + height - 5, x1 - x0, 2);
}

function drawLead(): void {
  const top = laneTop("lead");
  g.fillStyle = ROLE_INK.solo;
  for (const s of leadOpen) g.fillRect(xOf(s.from), top + 8, xOf(s.to) - xOf(s.from), laneHeight("lead") - 16);
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
  for (let x = GUTTER; x <= xOf(viewNow); x += COLUMN_STEP) g.lineTo(x, scale(heatAt(timeOf(x))));
  g.stroke();
}

function heatAt(t: number): number {
  const last = heats.filter((h) => h.at <= t).at(-1);
  if (!last) return 0;
  return last.value * 0.5 ** ((t - last.at) / MIX.score.heatHalfLifeSeconds);
}

function playingNow(): Played | undefined {
  return played.find((p) => p.start <= viewNow && viewNow < p.end);
}

function drawGutter(): void {
  const leadOn = leadOpen.some((s) => s.from <= viewNow && viewNow < s.to);
  const readouts: Record<LaneId, string> = { events: String(fired.length), song: playingNow()?.label ?? "", lead: leadOn ? "open" : "", heat: heatAt(viewNow).toFixed(2) };
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

const combatButton = toggle("Combat", () => inCombat, flipCombat, "btn-l");
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
const controlsPanel = panel(el("div", { class: "score-lab-buttons" }, combatButton), ...eventButtons, el("span", { class: "dim" }, "Auto fight"), autoChoice);
const statsPanel = panel(statsBox);

const zoomChoice = choice(
  ZOOM_SECONDS.map((seconds) => ({ label: `${seconds} s`, value: seconds })),
  (seconds) => (span = seconds),
  ZOOM_SECONDS.indexOf(DEFAULT_ZOOM),
);
const holder = el("div", { class: "score-lab-canvas" }, canvas);
const timelinePanel = panel(el("div", { class: "score-lab-bar" }, zoomChoice), holder);

const ledgerRows = el("div", { class: "score-lab-rows" });
const ledgerHead = el("div", { class: "score-lab-entry score-lab-head" }, ...["", "Block", "Bars", "Starts", "Heat", "Since stop", "Join"].map((word) => el("span", {}, word)));
const ledgerPanel = panel(ledgerHead, ledgerRows);

function statRows(): [string, string][] {
  const [bars, sinceStop] = sequencer ? [sequencer.barsPlayed, sequencer.barsSinceStop] : [0, 0];
  return [
    ["Combat", inCombat ? "on" : "off"],
    ["Playing", playingNow()?.label ?? "-"],
    ["Bars played", String(bars)],
    ["Since stop", String(sinceStop)],
    ["Heat", heat.read(ctx.currentTime).toFixed(2)],
  ];
}

function syncStats(): void {
  const rows = statRows();
  const key = rows.map((r) => r[1]).join("|");
  if (statsBox.dataset.key === key) return;
  statsBox.dataset.key = key;
  statsBox.replaceChildren(...rows.flatMap(([k, v]) => [el("span", { class: "dim" }, k), el("span", {}, v)]));
  combatButton.classList.toggle("on", inCombat);
}

function syncLedger(): void {
  const key = String(played.length);
  if (ledgerRows.dataset.key === key) return;
  ledgerRows.dataset.key = key;
  const first = played[0]?.start ?? 0;
  ledgerRows.replaceChildren(
    ...played
      .map((p, i) =>
        el(
          "div",
          { class: "row score-lab-entry" },
          el("span", { class: "num" }, String(i + 1)),
          el("span", {}, p.role),
          el("span", {}, p.label.replace(`${p.role} `, "")),
          el("span", { class: "num" }, `${(p.start - first).toFixed(1)} s`),
          el("span", { class: "num" }, p.heat.toFixed(1)),
          el("span", { class: "num" }, String(p.sinceStop)),
          el("span", { class: "dim" }, p.join),
        ),
      )
      .reverse(),
  );
}

root.replaceChildren(el("div", { class: "score-lab-side" }, controlsPanel, statsPanel), timelinePanel, ledgerPanel);
new ResizeObserver(() => fitCanvas(holder.clientWidth)).observe(holder);
fitCanvas(holder.clientWidth);
requestAnimationFrame(frame);
