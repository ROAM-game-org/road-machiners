import { BEATS_PER_BAR, MIX, SOUNDS, type Cue } from "../data/sounds";
import { SFX_BYTES } from "../config";
import { formatSupport, loadBank } from "../audio/bank";
import { Mixer } from "../audio/mixer";
import { SoundPlayer, type BeatLoopHandle, type Placement, type SoundSelection } from "../audio/player";
import { devEl as el } from "../ui/dom";
import { CombatScore, SoundDirector, SoundLoops, type AccentCue, type AccentTake } from "./sound";

const TURN_MS = 1000;
const PAST_SECONDS = 10;
const FUTURE_SECONDS = 3;
const WIDTH = 1200;
const LANE_HEIGHT = 64;
const LABEL_ROWS = 4;
const LABEL_WIDTH = 90;
const LANES = ["turns", "events", "lead", "secondary", "base", "heat"] as const;
type Lane = (typeof LANES)[number];

const TURN_EVENTS: { label: string; cue: AccentCue }[] = [
  { label: "My shot hits", cue: "accent-hit" },
  { label: "My shot misses", cue: "accent-miss" },
  { label: "My crit", cue: "accent-crit" },
  { label: "I am hit", cue: "accent-struck" },
  { label: "Crash", cue: "accent-crash" },
];

type Sounded = { cue: string; start: number; end: number; from: number; stab: boolean; gain: number };
type Offered = { cue: AccentCue; at: number; result: string };
type Step = { at: number; value: number };
type TurnSpan = { start: number; end: number | null; speed: number };

const sounds: Record<string, Cue> = SOUNDS;
const root = document.getElementById("lab");
if (!root) throw new Error("#lab element missing from score.html");
const mixer = new Mixer(MIX);
mixer.unlockOn(window);
const { bank } = await loadBank(mixer.ctx, sounds, { expectedBytes: SFX_BYTES, support: formatSupport() });
const player = new SoundPlayer(mixer, bank, sounds);

const sounded: Sounded[] = [];
const offered: Offered[] = [];
const turns: TurnSpan[] = [];
const ducks: number[] = [];
const baseGain = new Map<string, Step[]>();
const baseTone = new Map<string, Step[]>();
const baseGrid = new Map<string, { start: number; beat: number }>();
const heats: Step[] = [];
let lastRaised: string | null = null;

function lineOf(cue: string): "lead" | "secondary" {
  return MIX.score.accents[cue as AccentCue].line;
}

function recordPlay(id: string, at: Placement, delayMs: number, selection?: SoundSelection): void {
  const start = player.now() + delayMs / 1000;
  const from = selection?.from ?? 0;
  const duration = selection ? bank.get(selection.file)!.duration - from : 0.25;
  sounded.push({ cue: id, start, end: start + duration, from, stab: selection !== undefined, gain: at.gain });
  player.play(id, at, delayMs, selection);
}

function recordBase(id: string, file: string, when: number, offset: number): BeatLoopHandle {
  const loop = player.beatLoop(id, file, when, offset);
  const beat = SOUNDS[id as keyof typeof SOUNDS].beat!;
  const gains: Step[] = [{ at: when, value: 0 }];
  const tones: Step[] = [{ at: when, value: MIX.score.openCutoffHz }];
  baseGrid.set(id, { start: when, beat: loop.duration / (beat.bars * BEATS_PER_BAR) });
  baseGain.set(id, gains);
  baseTone.set(id, tones);
  return {
    ...loop,
    duration: loop.duration,
    setGain: (gain, ramp) => {
      if (gain > 0) lastRaised = id;
      gains.push({ at: player.now(), value: gain });
      loop.setGain(gain, ramp);
    },
    setTone: (hz, ramp) => {
      tones.push({ at: player.now(), value: hz });
      loop.setTone(hz, ramp);
    },
    duck: (time, level, attack, release) => {
      ducks.push(time);
      loop.duck(time, level, attack, release);
    },
  };
}

const score = new CombatScore(
  { now: () => player.now(), play: recordPlay, beatLoop: recordBase, chooseWithPeak: (id) => player.chooseWithPeak(id) },
  Math.random,
);
const loops = new SoundLoops(player, score);
const noRig = { focus: () => { throw new Error("The score lab has no camera"); }, screenOf: () => { throw new Error("The score lab has no camera"); } };
const director = new SoundDirector(player, noRig, {
  take: (cue) => score.take(cue),
  accent: (cue: AccentCue, delayMs: number, take?: AccentTake) => {
    const r = score.accent(cue, delayMs, take);
    if (r) {
      offered.push({ cue, at: player.now() + delayMs / 1000, result: r.offer });
      heats.push({ at: player.now(), value: r.heat });
    }
    return r;
  },
});

let inCombat = false;
let pending: AccentCue[] = [];
let turn: { startMs: number; speed: number } | null = null;
let idleSince = performance.now();
let speed = 1;
let auto = false;

function heatAt(t: number): number {
  const last = heats.filter((h) => h.at <= t).at(-1);
  if (!last) return 0;
  return last.value * 0.5 ** ((t - last.at) / MIX.score.heatHalfLifeSeconds);
}

function activeBase(): string | null {
  if (!inCombat) return null;
  return lastRaised;
}

function startTurn(): void {
  director.timeAccents([], "", () => null);
  pending.forEach((cue, i) => director.queueAccent(cue, ((i + 1) / (pending.length + 1)) * TURN_MS));
  pending = [];
  turn = { startMs: performance.now(), speed };
  turns.push({ start: player.now(), end: null, speed });
}

function finishTurn(): void {
  director.clearAccents();
  turn = null;
  idleSince = performance.now();
  turns[turns.length - 1].end = player.now();
  if (auto) startTurn();
}

function frame(): void {
  if (turn) {
    const elapsed = Math.min(TURN_MS, (performance.now() - turn.startMs) * turn.speed);
    director.playDueAccents(elapsed, turn.speed);
    if (elapsed >= TURN_MS) finishTurn();
  }
  const paused = !turn && performance.now() - idleSince > MIX.music.pauseDelayMs;
  loops.update({ stormShare: 0, inCombat, inQuest: false, place: null, paused });
  draw(paused);
  requestAnimationFrame(frame);
}

const canvas = el("canvas", { width: WIDTH, height: LANE_HEIGHT * LANES.length }) as HTMLCanvasElement;
const g = canvas.getContext("2d")!;
const statsBox = el("div", { class: "stats" });
const logBox = el("div", { class: "log" });

function xOf(t: number, now: number): number {
  return LABEL_WIDTH + ((t - (now - PAST_SECONDS)) / (PAST_SECONDS + FUTURE_SECONDS)) * (WIDTH - LABEL_WIDTH);
}

function laneTop(lane: Lane): number {
  return LANES.indexOf(lane) * LANE_HEIGHT;
}

function draw(paused: boolean): void {
  const now = player.now();
  g.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid(now);
  drawTurns(now);
  drawEvents(now);
  drawLine("lead", now);
  drawLine("secondary", now);
  drawBase(now);
  drawHeat(now);
  drawLabels(now);
  showStats(now, paused);
}

function drawLabels(now: number): void {
  g.font = "12px ui-monospace, Menlo, monospace";
  for (const lane of LANES) {
    g.fillStyle = "#1a1410";
    g.fillRect(0, laneTop(lane), LABEL_WIDTH, LANE_HEIGHT);
    g.fillStyle = "#b8a888";
    g.fillText(lane, 8, laneTop(lane) + 20);
    g.fillStyle = "#3a2a1e";
    g.fillRect(0, laneTop(lane) + LANE_HEIGHT - 1, WIDTH, 1);
  }
  g.fillStyle = "#f0e0b8";
  g.fillRect(xOf(now, now), 0, 1, canvas.height);
}

function drawGrid(now: number): void {
  const base = activeBase();
  const grid = base ? baseGrid.get(base) : null;
  if (!grid) return;
  const first = Math.ceil((now - PAST_SECONDS - grid.start) / grid.beat);
  const last = Math.floor((now + FUTURE_SECONDS - grid.start) / grid.beat);
  for (let b = first; b <= last; b++) {
    g.fillStyle = b % BEATS_PER_BAR === 0 ? "#4a3626" : "#261c14";
    g.fillRect(xOf(grid.start + b * grid.beat, now), 0, 1, canvas.height);
  }
}

function drawTurns(now: number): void {
  const top = laneTop("turns");
  for (const t of turns) {
    const x0 = xOf(t.start, now);
    const x1 = xOf(t.end ?? now, now);
    g.fillStyle = "#4a6a3a";
    g.fillRect(x0, top + 14, Math.max(1, x1 - x0), LANE_HEIGHT - 28);
    g.fillStyle = "#f0e0b8";
    g.fillText(`${t.speed}x`, x0 + 2, top + 12);
    const pauseFrom = (t.end ?? Infinity) + MIX.music.pauseDelayMs / 1000;
    if (pauseFrom < now) {
      g.fillStyle = "#3a2a4a";
      g.fillRect(xOf(pauseFrom, now), top + 40, 4, 8);
    }
  }
}

const RESULT_COLORS: Record<string, string> = { played: "#e0b060", skipped: "#706050", crowded: "#a05040" };

function drawEvents(now: number): void {
  const top = laneTop("events");
  const rows = Array<number>(LABEL_ROWS).fill(-Infinity);
  for (const o of offered) {
    const x = xOf(o.at, now);
    g.fillStyle = RESULT_COLORS[o.result];
    g.fillRect(x - 1, top + 4, 3, LANE_HEIGHT - 8);
    stackedLabel(rows, `${o.cue.replace("accent-", "")} ${o.result}`, x + 4, top);
  }
}

function drawLine(lane: "lead" | "secondary", now: number): void {
  const top = laneTop(lane);
  const rows = Array<number>(LABEL_ROWS).fill(-Infinity);
  for (const s of sounded.filter((x) => lineOf(x.cue) === lane)) {
    const x0 = xOf(s.start, now);
    const x1 = xOf(s.end, now);
    const h = (LANE_HEIGHT - 12) * Math.min(1, s.gain);
    g.fillStyle = s.stab ? "rgba(224,176,96,0.55)" : "rgba(160,120,200,0.8)";
    g.fillRect(x0, top + LANE_HEIGHT - 6 - h, Math.max(3, x1 - x0), h);
    stackedLabel(rows, `${s.cue.replace("accent-", "")}${s.stab ? "" : " tail"}${s.from > 0 ? ` from ${s.from.toFixed(2)}s` : ""}`, x0 + 2, top);
  }
}

function stackedLabel(rows: number[], text: string, x: number, top: number): void {
  const free = rows.findIndex((end) => x > end + 6);
  const row = free >= 0 ? free : rows.indexOf(Math.min(...rows));
  rows[row] = x + g.measureText(text).width;
  g.fillStyle = "#f0e0b8";
  g.fillText(text, x, top + 12 + row * 13);
}

function drawBase(now: number): void {
  const top = laneTop("base");
  const base = activeBase();
  if (!base) return;
  const steps = baseGain.get(base)!;
  g.strokeStyle = "#60a0c0";
  g.beginPath();
  steps.forEach((s, i) => {
    const y = top + LANE_HEIGHT - 6 - s.value * (LANE_HEIGHT - 12);
    const x = xOf(s.at, now);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
    const nextAt = steps[i + 1]?.at ?? now;
    g.lineTo(xOf(nextAt, now), y);
  });
  g.stroke();
  g.fillStyle = "#c06040";
  for (const d of ducks) g.fillRect(xOf(d, now), top + 4, 2, 10);
  g.fillStyle = "#f0e0b8";
  g.fillText(base, LABEL_WIDTH + 4, top + 12);
}

function drawHeat(now: number): void {
  const top = laneTop("heat");
  const scale = (v: number) => top + LANE_HEIGHT - 4 - (Math.min(v, MIX.score.fullHeat * 1.5) / (MIX.score.fullHeat * 1.5)) * (LANE_HEIGHT - 8);
  for (const [v, color] of [[MIX.score.hotHeat, "#a05040"], [MIX.score.fullHeat, "#e0b060"]] as const) {
    g.fillStyle = color;
    g.fillRect(LABEL_WIDTH, scale(v), WIDTH - LABEL_WIDTH, 1);
  }
  g.strokeStyle = "#e07050";
  g.beginPath();
  for (let x = LABEL_WIDTH; x <= xOf(now, now); x += 2) {
    const t = now - PAST_SECONDS + ((x - LABEL_WIDTH) / (WIDTH - LABEL_WIDTH)) * (PAST_SECONDS + FUTURE_SECONDS);
    g.lineTo(x, scale(heatAt(t)));
  }
  g.stroke();
}

function baseRows(base: string | null): [string, string][] {
  if (!base) return [["base", "none"], ["base gain", "-"], ["base cutoff", "-"]];
  return [
    ["base", base],
    ["base gain", baseGain.get(base)!.at(-1)!.value.toFixed(2)],
    ["base cutoff", `${Math.round(baseTone.get(base)!.at(-1)!.value)} Hz`],
  ];
}

function showStats(now: number, paused: boolean): void {
  const rows: [string, string][] = [
    ["combat", inCombat ? "on" : "off"],
    ...baseRows(activeBase()),
    ["heat", `${heatAt(now).toFixed(2)} (hot ${MIX.score.hotHeat}, full ${MIX.score.fullHeat})`],
    ["paused", paused ? "yes" : "no"],
    ["turn", turn ? `playing at ${turn.speed}x` : "idle"],
    ["queued", pending.map((c) => c.replace("accent-", "")).join(", ") || "nothing"],
  ];
  statsBox.replaceChildren(...rows.flatMap(([k, v]) => [el("span", {}, k), el("span", {}, v)]));
  logBox.textContent = director.log.slice(-12).reverse().join("\n");
}

function toggle(label: string, on: () => boolean, flip: () => void): HTMLElement {
  const b = el("button", {}, label);
  b.addEventListener("click", () => {
    flip();
    b.classList.toggle("on", on());
  });
  return b;
}

const combatButton = toggle("Combat", () => inCombat, () => (inCombat = !inCombat));
const sightedButton = el("button", { onclick: () => director.accent("accent-sighted", 0) }, "Enemy sighted");
const eventButtons = TURN_EVENTS.map((e) => el("button", { onclick: () => pending.push(e.cue) }, e.label));
const playButton = el("button", { onclick: () => !turn && startTurn() }, "Play turn");
const fastButton = toggle("Fast 4x", () => speed > 1, () => (speed = speed > 1 ? 1 : 4));
const autoButton = toggle("Auto turns", () => auto, () => {
  auto = !auto;
  if (auto && !turn) startTurn();
});

root.replaceChildren(
  el("h2", {}, "Fight"),
  el("div", { class: "row" }, combatButton, sightedButton),
  el("div", { class: "hint" }, "Enemy sighted plays at once, like in the game. Combat must be on, or the score ignores accents."),
  el("h2", {}, "Next turn"),
  el("div", { class: "row" }, ...eventButtons),
  el("div", { class: "row" }, playButton, fastButton, autoButton, el("button", { onclick: () => (pending = []) }, "Clear queue")),
  el("div", { class: "hint" }, "Queued events land spread evenly through the 1 s turn, in the order pressed."),
  statsBox,
  canvas,
  el("h2", {}, "Score log"),
  logBox,
);
requestAnimationFrame(frame);
