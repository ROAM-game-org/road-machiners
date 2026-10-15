import "../ui/style.css";
import "./score-lab.css";
import { BEATS_PER_BAR, MIX, SCORE_BLOCKS } from "../data/sounds";
import { Mixer } from "../audio/mixer";
import { BlockSequencer, blocksOf, Fading, SoundDesigner, type Block, type Hit, type LineId, type Role, type Section } from "../audio/designer";
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
  { id: "guitars", height: 40 },
  { id: "drums", height: 60 },
  { id: "heat", height: 80 },
] as const;
type LaneId = (typeof LANES)[number]["id"];
const HEIGHT = LANES.reduce((sum, lane) => sum + lane.height, 0);

type Song = {
  file: string;
  stems: { drums: string; guitars: string };
  bpm: number;
  length: number;
  barTimes: number[];
  sections: Section[];
  end: number;
};
type Voice = { src: AudioBufferSourceNode; gain: GainNode };
type Played = { label: string; role: Role | "end"; bar: number; bars: number; start: number; end: number; voices: Voice[]; heat: number; odds: string; join: string; guitars: boolean };
type Fired = { cue: AccentCue; at: number; result: string | null };
type Push = { at: number; line: LineId; stab: boolean };
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
const PRIORITY: AccentCue[] = ["accent-crash", "accent-sighted", "accent-struck", "accent-crit", "accent-hit", "accent-miss"];
const DENSE_TURN: [AccentCue, number][] = [
  ["accent-hit", 10],
  ["accent-miss", 8],
  ["accent-struck", 3],
  ["accent-crit", 2],
  ["accent-crash", 2],
  ["accent-sighted", 1],
];
const AUTO_PAUSE_SECONDS = [1, 4];
const FILL_ROLES = new Set<Role>(["verse", "wall"]);
const ODDS_SHOWN = 4;

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
const blocks = blocksOf(song.sections, SCORE_BLOCKS.arc.blockBars);
const songLevel = ctx.createGain();
songLevel.gain.value = SCORE_BLOCKS.songGain;
songLevel.connect(mixer.input("music"));
const fillLevel = ctx.createGain();
fillLevel.connect(songLevel);
const guitarLevel = ctx.createGain();
guitarLevel.gain.value = SCORE_BLOCKS.guitarPush;
guitarLevel.connect(songLevel);

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
const beats = new Map<number, Fired[]>();
const pushes: Push[] = [];
const beatSeconds = (song.barTimes[1] - song.barTimes[0]) / BEATS_PER_BAR;
let designer: SoundDesigner | null = null;
let guitarsWanted = false;
let gridStart = 0;
const fillOf = new Map<LineId, number>();
const fills = song.sections.filter((s) => FILL_ROLES.has(s.role)).flatMap((s) => Array.from({ length: s.bars / 2 }, (_, i) => barTime(s.from + 2 * i + 1) + (BEATS_PER_BAR - 1) * beatSeconds));

function barTime(bar: number): number {
  return song.barTimes[bar - 1];
}

function voice(buffer: AudioBuffer, out: AudioNode, offset: number, when: number, length: number, fade: number): Voice {
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
  return { src, gain };
}

function fadeOut(p: Played, fade: number): void {
  for (const v of p.voices) {
    v.gain.gain.cancelScheduledValues(p.end - fade);
    v.gain.gain.setValueAtTime(1, p.end - fade);
    v.gain.gain.linearRampToValueAtTime(0, p.end + fade);
  }
}

function joinOf(block: Block): string {
  const before = played.at(-1);
  if (!before) return "start";
  return before.bar + before.bars === block.bar ? "follows" : "jump";
}

function blockVoices(block: Block, when: number, offset: number, length: number, fade: number): Voice[] {
  const voices = [voice(songBuffer, songLevel, offset, when, length, fade)];
  if (guitarsWanted) voices.push(voice(guitarBuffer, guitarLevel, offset, when, length, fade));
  return voices;
}

function schedule(block: Block, when: number, heatNow: number): number {
  const offset = barTime(block.bar);
  const length = barTime(block.bar + block.bars) - offset;
  const join = joinOf(block);
  const fade = join === "jump" ? SCORE_BLOCKS.jumpFadeSeconds : SCORE_BLOCKS.seamSeconds;
  if (join === "jump") fadeOut(played.at(-1)!, fade);
  const voices = blockVoices(block, when, offset, length, fade);
  const label = `${block.role} ${block.bar}-${block.bar + block.bars - 1}`;
  played.push({ label, role: block.role, bar: block.bar, bars: block.bars, start: when, end: when + length, voices, heat: heatNow, odds: oddsText(), join, guitars: guitarsWanted });
  guitarsWanted = false;
  return when + length;
}

function startCombat(): void {
  inCombat = true;
  heat = new Fading(MIX.score.heatHalfLifeSeconds);
  sequencer = new BlockSequencer(blocks, SCORE_BLOCKS.arc, Math.random);
  const start = ctx.currentTime + SCORE_BLOCKS.startLeadSeconds;
  nextTurn = start;
  gridStart = start;
  designer = new SoundDesigner({ start, beat: beatSeconds, beatsPerBar: BEATS_PER_BAR }, MIX.score, Math.random, start);
  nextAt = schedule(sequencer.next(0), start, 0);
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
  beats.clear();
  designer = null;
  guitarsWanted = false;
  const offset = barTime(song.end);
  const voices = [voice(songBuffer, songLevel, offset, at, song.length - offset, SCORE_BLOCKS.seamSeconds)];
  played.push({ label: "end", role: "end", bar: song.end, bars: 1, start: at, end: at + song.length - offset, voices, heat: heat.read(at), odds: "", join: "end", guitars: false });
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
  heat.add(at, MIX.score.accents[cue].weight);
  heats.push({ at, value: heat.read(at) });
  const event: Fired = { cue, at, result: null };
  fired.push(event);
  const beat = beatLineAfter(at);
  const bucket = beats.get(beat);
  if (bucket) bucket.push(event);
  else beats.set(beat, [event]);
}

function gridBlock(t: number): Played | undefined {
  return played.find((p) => p.start <= t && t < p.end && p.role !== "end") ?? played.filter((p) => p.role !== "end").at(-1);
}

function beatLineAfter(t: number): number {
  const p = gridBlock(t);
  if (!p) throw new Error("An event came in with no block playing");
  const beat = (p.end - p.start) / (p.bars * BEATS_PER_BAR);
  return p.start + Math.ceil((t - p.start) / beat - 1e-6) * beat;
}

function answerDue(now: number): void {
  for (const [beat, events] of beats) {
    if (beat - now > SCORE_BLOCKS.aheadSeconds) continue;
    beats.delete(beat);
    const winner = events.reduce((best, e) => (PRIORITY.indexOf(e.cue) < PRIORITY.indexOf(best.cue) ? e : best));
    winner.at = beat;
    answer(winner, beat);
  }
}

function answer(winner: Fired, beat: number): void {
  if (HEAVY.has(winner.cue)) guitarsWanted = true;
  const offer = designer!.offer(winner.cue, MIX.score.accents[winner.cue], beat, 0, heat.read(beat));
  winner.result = offer.result;
  if (offer.stab) push(offer.stab, true);
}

function onSlot(t: number): number {
  const slot = beatSeconds / MIX.score.subdivision;
  return gridStart + Math.round((t - gridStart) / slot) * slot;
}

function push(h: Hit, stab: boolean): void {
  const at = Math.max(onSlot(h.time), ctx.currentTime);
  if (stab) fillOf.set(h.line, pickFill(fillOf.get(h.line)));
  const fill = fillOf.get(h.line);
  if (fill === undefined) throw new Error(`A ${h.line} tail came with no stab before it`);
  playFill(fill, at, h.gain * SCORE_BLOCKS.fillGain[h.line]);
  pushes.push({ at, line: h.line, stab });
}

function pickFill(last: number | undefined): number {
  const fresh = fills.filter((f) => f !== last);
  return fresh[Math.floor(Math.random() * fresh.length)];
}

function playFill(offset: number, at: number, level: number): void {
  const seam = SCORE_BLOCKS.seamSeconds;
  const src = ctx.createBufferSource();
  src.buffer = drumBuffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, at - seam);
  gain.gain.linearRampToValueAtTime(level, at + seam);
  gain.gain.setValueAtTime(level, at + beatSeconds - seam);
  gain.gain.linearRampToValueAtTime(0, at + beatSeconds + seam);
  src.connect(gain).connect(fillLevel);
  src.start(at - seam, offset - seam, beatSeconds + 2 * seam);
}

function oddsText(): string {
  return sequencer!.choices
    .slice(0, ODDS_SHOWN)
    .map((c) => `${c.role} ${c.from} ${Math.round(c.chance * 100)}%`)
    .join(", ");
}

function denseTurn(start: number): void {
  for (const [cue, most] of DENSE_TURN) {
    const count = Math.floor(Math.random() * (most + 1));
    for (let i = 0; i < count; i++) fire(cue, start + Math.random() * TURN_SECONDS);
  }
}

function autoTurn(now: number): void {
  if (auto === "off" || !inCombat || now < nextTurn) return;
  denseTurn(nextTurn);
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
  answerDue(now);
  if (designer) for (const h of designer.step(now, now + SCORE_BLOCKS.aheadSeconds, false, heat.read(now))) push(h, false);
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
  const height = laneHeight("events");
  for (const f of fired) {
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
  g.fillStyle = INK.now;
  g.fillRect(xOf(p.start) - 1, top + 20, 3, height - 22);
}

function drawGuitars(): void {
  const top = laneTop("guitars");
  g.fillStyle = ROLE_INK.solo;
  for (const p of played) if (p.guitars && p.end > p.start) g.fillRect(xOf(p.start), top + 8, xOf(p.end) - xOf(p.start) - 1, laneHeight("guitars") - 16);
}

function drawDrums(): void {
  const top = laneTop("drums");
  const height = laneHeight("drums");
  for (const p of pushes) {
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
  const readouts: Record<LaneId, string> = {
    events: String(fired.length),
    song: playingNow()?.label ?? "",
    guitars: playingNow()?.guitars ? "pushed" : "",
    drums: String(pushes.length),
    heat: heatAt(viewNow).toFixed(2),
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
const denseButton = el("button", { onclick: () => denseTurn(ctx.currentTime + SCORE_BLOCKS.eventLeadSeconds) }, "Dense turn");
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
    ["Combat", inCombat ? "on" : "off"],
    ["Playing", playingNow()?.label ?? "-"],
    ["Bars played", String(sequencer?.barsPlayed ?? 0)],
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
          el("span", {}, ""),
          el("span", { class: "dim" }, p.odds ? `${p.join}. Odds were ${p.odds}` : p.join),
        ),
      )
      .reverse(),
  );
}

root.replaceChildren(el("div", { class: "score-lab-side" }, controlsPanel, statsPanel), timelinePanel, ledgerPanel);
new ResizeObserver(() => fitCanvas(holder.clientWidth)).observe(holder);
fitCanvas(holder.clientWidth);
requestAnimationFrame(frame);
