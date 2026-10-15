import "../ui/style.css";
import "./score-lab.css";
import { BEATS_PER_BAR, MIX, SOUNDS, type Cue } from "../data/sounds";
import { SFX_BYTES } from "../config";
import { formatSupport, loadBank } from "../audio/bank";
import { Mixer } from "../audio/mixer";
import { SoundPlayer, type BeatLoopHandle, type Placement, type SoundSelection } from "../audio/player";
import { devEl as el, uiRoot } from "../ui/dom";
import { token } from "../ui/tokens";
import { BASE_CUES, CombatScore, SoundDirector, SoundLoops, type AccentCue, type AccentTake, type BaseCue } from "./sound";

const TURN_MS = 1000;
const FAST_SPEED = 4;
const PAST_SECONDS = 10;
const FUTURE_SECONDS = 3;
const WIDTH = 1200;
const LANE_HEIGHT = 64;
const LABEL_ROWS = 4;
const LABEL_WIDTH = 90;
const UNKNOWN_TAIL_SECONDS = 0.25;
const HEAT_CEILING_OVER_HOT = 2;
const LANES = ["turns", "events", "lead", "secondary", "base", "heat"] as const;
type Lane = (typeof LANES)[number];

const TURN_EVENTS: { label: string; cue: AccentCue }[] = [
  { label: "My shot hits", cue: "accent-hit" },
  { label: "My shot misses", cue: "accent-miss" },
  { label: "My crit", cue: "accent-crit" },
  { label: "I am hit", cue: "accent-struck" },
  { label: "Crash", cue: "accent-crash" },
];
const ACCENT_CUES = Object.keys(MIX.score.accents) as AccentCue[];

type Sounded = { cue: string; start: number; end: number; from: number; stab: boolean; gain: number };
type Offered = { cue: AccentCue; at: number; result: string };
type Step = { at: number; value: number };
type TurnSpan = { start: number; end: number | null; speed: number };

const INK = {
  text: token("--ink"),
  label: token("--ink-label"),
  faint: token("--ink-faint"),
  now: token("--ink-bright"),
  well: token("--surface-sunk"),
  gutter: token("--surface-well"),
  beat: token("--line-faint"),
  bar: token("--line-soft"),
  turn: token("--good-deep"),
  pause: token("--line-strong"),
  stab: token("--accent-deep"),
  tail: token("--accent-bright"),
  base: token("--good"),
  duck: token("--danger"),
  heat: token("--danger-bright"),
  hot: token("--danger-deep"),
};
const RESULT_INK: Record<string, string> = { played: token("--accent"), skipped: token("--ink-faint"), crowded: token("--danger") };
const FONT = `${token("--text-dense")} ${token("--font-mono")}`;

const sounds: Record<string, Cue> = SOUNDS;
const root = uiRoot();
root.classList.add("score-lab");
root.append(el("h1", {}, "Combat score lab"), el("div", { class: "dim" }, "Loading sounds..."));
const mixer = new Mixer(MIX);
mixer.unlockOn(window);
const { bank } = await loadBank(mixer.ctx, sounds, { expectedBytes: SFX_BYTES, support: formatSupport() });
const player = new SoundPlayer(mixer, bank, sounds);

const sounded: Sounded[] = [];
const offered: Offered[] = [];
const turns: TurnSpan[] = [];
const ducks: number[] = [];
const baseGain = new Map<string, Step[]>();
const baseGrid = new Map<string, { start: number; beat: number }>();
const heats: Step[] = [];
const pinnedTakes = new Map<string, string>();
let lastRaised: string | null = null;

function lineOf(cue: string): "lead" | "secondary" {
  return MIX.score.accents[cue as AccentCue].line;
}

function recordPlay(id: string, at: Placement, delayMs: number, selection?: SoundSelection): void {
  const pinned = pinnedTakes.get(id);
  const chosen = selection ?? (pinned === undefined ? undefined : { file: pinned, rate: 1 });
  const start = player.now() + delayMs / 1000;
  const from = chosen?.from ?? 0;
  const duration = chosen ? bank.get(chosen.file)!.duration - from : UNKNOWN_TAIL_SECONDS;
  sounded.push({ cue: id, start, end: start + duration, from, stab: selection !== undefined, gain: at.gain });
  player.play(id, at, delayMs, chosen);
}

function chooseTake(id: string): AccentTake {
  const pinned = pinnedTakes.get(id);
  return pinned === undefined ? player.chooseWithPeak(id) : player.takeWithPeak(id, pinned);
}

function recordBase(id: string, file: string, when: number, offset: number): BeatLoopHandle {
  const loop = player.beatLoop(id, file, when, offset);
  const beat = SOUNDS[id as BaseCue].beat!;
  const gains: Step[] = [{ at: when, value: 0 }];
  baseGrid.set(id, { start: when, beat: loop.duration / (beat.bars * BEATS_PER_BAR) });
  baseGain.set(id, gains);
  return {
    ...loop,
    duration: loop.duration,
    setGain: (gain, ramp) => {
      if (gain > 0) lastRaised = id;
      gains.push({ at: player.now(), value: gain });
      loop.setGain(gain, ramp);
    },
    duck: (time, level, attack, release) => {
      ducks.push(time);
      loop.duck(time, level, attack, release);
    },
  };
}

const score = new CombatScore({ now: () => player.now(), play: recordPlay, beatLoop: recordBase, chooseWithPeak: chooseTake }, Math.random);
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
  return inCombat ? lastRaised : null;
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
const statsBox = el("div", {});
const queueBox = el("div", { class: "score-lab-buttons" });
const logBox = el("div", { class: "score-lab-log" });

function xOf(t: number, now: number): number {
  return LABEL_WIDTH + ((t - (now - PAST_SECONDS)) / (PAST_SECONDS + FUTURE_SECONDS)) * (WIDTH - LABEL_WIDTH);
}

function laneTop(lane: Lane): number {
  return LANES.indexOf(lane) * LANE_HEIGHT;
}

function draw(paused: boolean): void {
  const now = player.now();
  g.font = FONT;
  g.fillStyle = INK.well;
  g.fillRect(0, 0, canvas.width, canvas.height);
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
  for (const lane of LANES) {
    g.fillStyle = INK.gutter;
    g.fillRect(0, laneTop(lane), LABEL_WIDTH, LANE_HEIGHT);
    g.fillStyle = INK.label;
    g.fillText(lane, 8, laneTop(lane) + 20);
    g.fillStyle = INK.beat;
    g.fillRect(0, laneTop(lane) + LANE_HEIGHT - 1, WIDTH, 1);
  }
  g.fillStyle = INK.now;
  g.fillRect(xOf(now, now), 0, 1, canvas.height);
}

function drawGrid(now: number): void {
  const base = activeBase();
  const grid = base ? baseGrid.get(base) : null;
  if (!grid) return;
  const first = Math.ceil((now - PAST_SECONDS - grid.start) / grid.beat);
  const last = Math.floor((now + FUTURE_SECONDS - grid.start) / grid.beat);
  for (let b = first; b <= last; b++) {
    g.fillStyle = b % BEATS_PER_BAR === 0 ? INK.bar : INK.beat;
    g.fillRect(xOf(grid.start + b * grid.beat, now), 0, 1, canvas.height);
  }
}

function drawTurns(now: number): void {
  const top = laneTop("turns");
  for (const t of turns) {
    const x0 = xOf(t.start, now);
    const x1 = xOf(t.end ?? now, now);
    g.fillStyle = INK.turn;
    g.fillRect(x0, top + 16, Math.max(1, x1 - x0), LANE_HEIGHT - 32);
    g.fillStyle = INK.text;
    g.fillText(`${t.speed}x`, x0 + 2, top + 12);
    const pauseFrom = (t.end ?? Infinity) + MIX.music.pauseDelayMs / 1000;
    if (pauseFrom < now) {
      g.fillStyle = INK.pause;
      g.fillText("pause", xOf(pauseFrom, now) + 2, top + LANE_HEIGHT - 4);
    }
  }
}

function drawEvents(now: number): void {
  const top = laneTop("events");
  const rows = Array<number>(LABEL_ROWS).fill(-Infinity);
  for (const o of offered) {
    const x = xOf(o.at, now);
    g.fillStyle = RESULT_INK[o.result];
    g.fillRect(x - 1, top + 4, 3, LANE_HEIGHT - 8);
    stackedLabel(rows, `${o.cue.replace("accent-", "")} ${o.result}`, x + 4, top, RESULT_INK[o.result]);
  }
}

function drawLine(lane: "lead" | "secondary", now: number): void {
  const top = laneTop(lane);
  const rows = Array<number>(LABEL_ROWS).fill(-Infinity);
  for (const s of sounded.filter((x) => lineOf(x.cue) === lane)) {
    const x0 = xOf(s.start, now);
    const x1 = xOf(s.end, now);
    const h = (LANE_HEIGHT - 12) * Math.min(1, s.gain);
    g.fillStyle = s.stab ? INK.stab : INK.tail;
    g.fillRect(x0, top + LANE_HEIGHT - 6 - h, Math.max(3, x1 - x0), h);
    stackedLabel(rows, `${s.cue.replace("accent-", "")}${s.stab ? "" : " tail"}${s.from > 0 ? ` from ${s.from.toFixed(2)}s` : ""}`, x0 + 2, top, INK.text);
  }
}

function stackedLabel(rows: number[], text: string, x: number, top: number, ink: string): void {
  const free = rows.findIndex((end) => x > end + 6);
  const row = free >= 0 ? free : rows.indexOf(Math.min(...rows));
  rows[row] = x + g.measureText(text).width;
  g.fillStyle = ink;
  g.fillText(text, x, top + 12 + row * 13);
}

function drawBase(now: number): void {
  const top = laneTop("base");
  const base = activeBase();
  if (!base) return;
  const steps = baseGain.get(base)!;
  g.strokeStyle = INK.base;
  g.beginPath();
  steps.forEach((s, i) => {
    const y = top + LANE_HEIGHT - 6 - s.value * (LANE_HEIGHT - 12);
    const x = xOf(s.at, now);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
    g.lineTo(xOf(steps[i + 1]?.at ?? now, now), y);
  });
  g.stroke();
  g.fillStyle = INK.duck;
  for (const d of ducks) g.fillRect(xOf(d, now), top + 4, 2, 10);
}

function drawHeat(now: number): void {
  const top = laneTop("heat");
  const ceiling = MIX.score.hotHeat * HEAT_CEILING_OVER_HOT;
  const scale = (v: number) => top + LANE_HEIGHT - 4 - (Math.min(v, ceiling) / ceiling) * (LANE_HEIGHT - 8);
  g.fillStyle = INK.hot;
  g.fillRect(LABEL_WIDTH, scale(MIX.score.hotHeat), WIDTH - LABEL_WIDTH, 1);
  g.strokeStyle = INK.heat;
  g.beginPath();
  for (let x = LABEL_WIDTH; x <= xOf(now, now); x += 2) {
    const t = now - PAST_SECONDS + ((x - LABEL_WIDTH) / (WIDTH - LABEL_WIDTH)) * (PAST_SECONDS + FUTURE_SECONDS);
    g.lineTo(x, scale(heatAt(t)));
  }
  g.stroke();
}

function baseRows(base: string | null): [string, string][] {
  if (!base) return [["Base", "none"], ["Base level", "-"]];
  return [
    ["Base", base.replace("score-", "")],
    ["Base level", baseGain.get(base)!.at(-1)!.value.toFixed(2)],
  ];
}

function statRow(label: string, value: string): HTMLElement {
  return el("div", { class: "tooltip-row" }, el("span", {}, label), el("span", { class: "num" }, value));
}

function showStats(now: number, paused: boolean): void {
  const rows: [string, string][] = [
    ["Combat", inCombat ? "on" : "off"],
    ...baseRows(activeBase()),
    ["Heat", `${heatAt(now).toFixed(2)}, hot at ${MIX.score.hotHeat}`],
    ["Paused", paused ? "yes" : "no"],
    ["Turn", turn ? `playing at ${turn.speed}x` : "idle"],
  ];
  statsBox.replaceChildren(...rows.map(([k, v]) => statRow(k, v)));
  queueBox.replaceChildren(...(pending.length ? pending.map((c) => el("span", { class: "chip" }, c.replace("accent-", ""))) : [el("span", { class: "dim" }, "Nothing queued")]));
  logBox.textContent = director.log.slice(-12).reverse().join("\n");
}

function toggle(label: string, on: () => boolean, flip: () => void, size = "btn-s"): HTMLElement {
  const b = el("button", { class: size }, label);
  b.addEventListener("click", () => {
    flip();
    b.classList.toggle("on", on());
  });
  return b;
}

function choice<T>(options: { label: string; value: T }[], pick: (value: T) => void): HTMLElement {
  const buttons = options.map((o, i) => el("button", { class: i === 0 ? "btn-s on" : "btn-s" }, o.label));
  buttons.forEach((b, i) =>
    b.addEventListener("click", () => {
      for (const other of buttons) other.classList.toggle("on", other === b);
      pick(options[i].value);
    }),
  );
  return el("div", { class: "score-lab-buttons" }, ...buttons);
}

function pickBase(id: BaseCue | null): void {
  score.preferBase(id);
  if (!inCombat) return;
  score.setCombat(false, MIX.music.fadeSeconds);
  score.setCombat(true, MIX.music.fadeSeconds);
}

function takeChoice(cue: AccentCue): HTMLElement {
  const takes = SOUNDS[cue].files.map((file, i) => ({ label: `${i + 1}`, value: file as string | null }));
  return choice([{ label: "Random", value: null }, ...takes], (file) => (file === null ? pinnedTakes.delete(cue) : pinnedTakes.set(cue, file)));
}

function panel(title: string, ...children: HTMLElement[]): HTMLElement {
  return el("div", { class: "panel" }, el("h3", { class: "panel-title" }, title), ...children);
}

const baseChoice = choice([{ label: "Random", value: null }, ...BASE_CUES.map((id) => ({ label: id.replace("score-", ""), value: id as BaseCue | null }))], pickBase);
const picks = el(
  "div",
  { class: "score-lab-picks" },
  el("span", {}, "Base"),
  baseChoice,
  ...ACCENT_CUES.flatMap((cue) => [el("span", {}, cue.replace("accent-", "")), takeChoice(cue)]),
);

root.replaceChildren(
  el("h1", {}, "Combat score lab"),
  el(
    "div",
    { class: "score-lab-row" },
    panel(
      "Fight",
      el("div", { class: "score-lab-buttons" }, toggle("Combat", () => inCombat, () => (inCombat = !inCombat), "btn-l"), el("button", { onclick: () => director.accent("accent-sighted", 0) }, "Enemy sighted")),
      el("div", { class: "dim" }, "A sighting plays at once. The score ignores accents while combat is off."),
    ),
    panel(
      "Next turn",
      el("div", { class: "score-lab-buttons" }, ...TURN_EVENTS.map((e) => el("button", { class: "btn-s", onclick: () => pending.push(e.cue) }, e.label))),
      queueBox,
      el(
        "div",
        { class: "score-lab-buttons" },
        el("button", { class: "btn-l", onclick: () => !turn && startTurn() }, "Play turn"),
        toggle(`Fast ${FAST_SPEED}x`, () => speed > 1, () => (speed = speed > 1 ? 1 : FAST_SPEED)),
        toggle("Auto turns", () => auto, () => {
          auto = !auto;
          if (auto && !turn) startTurn();
        }),
        el("button", { class: "btn-s", onclick: () => (pending = []) }, "Clear"),
      ),
      el("div", { class: "dim" }, "Queued events land spread evenly through the 1 s turn, in the order pressed."),
    ),
    panel("Now", el("div", { class: "score-lab-stats" }, statsBox)),
  ),
  el("div", { class: "score-lab-row" }, panel("Tracks", picks), panel("Score log", logBox)),
  panel("Timeline", canvas),
);
requestAnimationFrame(frame);
