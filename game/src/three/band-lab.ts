import "../ui/style.css";
import "./score-lab.css";
import { BAND, BAND_PARTS, MIX, SOUNDS, type BandEvent, type BandPart, type Cue } from "../data/sounds";
import { SFX_BYTES } from "../config";
import { formatSupport, loadBank } from "../audio/bank";
import { Mixer } from "../audio/mixer";
import { SoundPlayer } from "../audio/player";
import { Conductor, type BarPlan, type Change } from "../audio/designer";
import { devEl as el, uiRoot } from "../ui/dom";
import { token } from "../ui/tokens";

const STEMS: Record<BandPart, { file: string; phase: number; gain: number }> = {
  drums: { file: "/tmp/band/stems/drums.wav", phase: 0.176, gain: 1 },
  bass: { file: "/tmp/band/stems/bass.wav", phase: 0.176, gain: 1 },
  riff: { file: "/tmp/band/stems/riff.wav", phase: 0.172, gain: 1 },
  keys: { file: "/tmp/band/stems/keys.wav", phase: 0, gain: 0.5 },
};
const BARS_PER_LOOP = 8;
const START_LEAD_SECONDS = 0.1;
const PLAN_AHEAD_SECONDS = 0.2;
const ENTER_SECONDS = 0.01;
const LEAVE_SECONDS = 0.08;
const STOP_FADE_SECONDS = 1;

const EVENTS: Record<BandEvent, string> = {
  "accent-sighted": "Sighted",
  "accent-struck": "Hit you",
  "accent-crit": "You crit",
  "accent-crash": "Crash",
  "accent-hit": "You hit",
  "accent-miss": "You miss",
};
const EVENT_GROUPS: BandEvent[][] = [
  ["accent-sighted", "accent-struck", "accent-crit", "accent-crash"],
  ["accent-hit", "accent-miss"],
];

const SPAN_SECONDS = 12;
const FUTURE_SHARE = 0.15;
const GUTTER = 96;
const PRESS_HEIGHT = 44;
const PART_HEIGHT = 44;
const HEAT_HEIGHT = 70;
const HEAT_CEILING = MIX.score.hotHeat * 2;
const COLUMN_STEP = 2;
const HEIGHT = PRESS_HEIGHT + PART_HEIGHT * BAND_PARTS.length + HEAT_HEIGHT;

const INK = {
  text: token("--ink"),
  label: token("--ink-label"),
  now: token("--ink-bright"),
  well: token("--surface-sunk"),
  gutter: token("--surface-well"),
  beat: token("--line-soft"),
  bar: token("--line"),
  edge: token("--line-faint"),
  press: token("--accent"),
  on: token("--good-deep"),
  enter: token("--good-bright"),
  cut: token("--danger-deep"),
  heat: token("--danger-bright"),
  hot: token("--danger-deep"),
};
const FONT = `${token("--text-dense")} ${token("--font-mono")}`;

type Band = { conductor: Conductor<BandPart, BandEvent>; sources: AudioBufferSourceNode[]; gains: Record<BandPart, GainNode>; next: number };
type Press = { cue: BandEvent; at: number; lands: number };

const sounds: Record<string, Cue> = SOUNDS;
const root = uiRoot();
root.classList.add("score-lab");
root.append(el("div", { class: "dim" }, "Loading sounds..."));
const mixer = new Mixer(MIX);
mixer.unlockOn(window);
const { bank } = await loadBank(mixer.ctx, sounds, { expectedBytes: SFX_BYTES, support: formatSupport() });
const player = new SoundPlayer(mixer, bank, sounds);
const buffers = await loadStems();
const barSeconds = buffers.drums.duration / BARS_PER_LOOP;
const lead = landingLead();

async function loadStems(): Promise<Record<BandPart, AudioBuffer>> {
  const pairs = await Promise.all(BAND_PARTS.map(async (part) => [part, await decode(STEMS[part].file)] as const));
  const lengths = new Set(pairs.map(([, b]) => b.length));
  if (lengths.size !== 1) throw new Error(`Band stems differ in length: ${[...lengths].join(", ")}`);
  return Object.fromEntries(pairs) as Record<BandPart, AudioBuffer>;
}

async function decode(file: string): Promise<AudioBuffer> {
  const res = await fetch(file);
  if (!res.ok) throw new Error(`Band stem ${file} failed: ${res.status}`);
  return mixer.ctx.decodeAudioData(await res.arrayBuffer());
}

function landingLead(): number {
  const peaks = EVENT_GROUPS.flat().flatMap((cue) => SOUNDS[cue].files.map((file) => player.takeWithPeak(cue, file).peak));
  return Math.max(...peaks) + MIX.score.offerAheadSeconds;
}

let band: Band | null = null;
let stabs = true;
const plans: BarPlan<BandPart>[] = [];
const presses: Press[] = [];

function startBand(): Band {
  const start = player.now() + START_LEAD_SECONDS;
  const sources: AudioBufferSourceNode[] = [];
  const gains = {} as Record<BandPart, GainNode>;
  for (const part of BAND_PARTS) {
    const src = mixer.ctx.createBufferSource();
    src.buffer = buffers[part];
    src.loop = true;
    const gain = mixer.ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(mixer.input("music"));
    src.start(start, STEMS[part].phase);
    sources.push(src);
    gains[part] = gain;
  }
  plans.length = 0;
  presses.length = 0;
  return { conductor: new Conductor(BAND, start, barSeconds), sources, gains, next: 0 };
}

function stopBand(b: Band): void {
  const now = player.now();
  for (const part of BAND_PARTS) b.gains[part].gain.setTargetAtTime(0, now, STOP_FADE_SECONDS / 3);
  for (const src of b.sources) src.stop(now + STOP_FADE_SECONDS);
}

function schedule(b: Band): void {
  while (b.conductor.barStart(b.next) < player.now() + PLAN_AHEAD_SECONDS) {
    const plan = b.conductor.plan(b.next++);
    plans.push(plan);
    for (const part of BAND_PARTS) {
      const on = plan.sounding.includes(part);
      const tc = on ? ENTER_SECONDS : LEAVE_SECONDS;
      b.gains[part].gain.setTargetAtTime(on ? STEMS[part].gain : 0, plan.start - tc, tc / 3);
    }
  }
}

function fire(cue: BandEvent): void {
  if (!band) return;
  const now = player.now();
  const lands = cue === "accent-sighted" ? now : now + lead;
  presses.push({ cue, at: now, lands });
  band.conductor.hear(cue, lands);
  if (!stabs) return;
  const take = player.chooseWithPeak(cue);
  player.play(cue, { pan: 0, gain: 1 }, Math.max(0, lands - take.peak - now) * 1000, { file: take.file, rate: 1 });
}

function flipCombat(): void {
  if (band) stopBand(band);
  band = band ? null : startBand();
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
  return viewNow - SPAN_SECONDS * (1 - FUTURE_SHARE);
}

function xOf(t: number): number {
  return GUTTER + ((t - spanStart()) / SPAN_SECONDS) * (width - GUTTER);
}

function timeOf(x: number): number {
  return spanStart() + ((x - GUTTER) / (width - GUTTER)) * SPAN_SECONDS;
}

function partTop(part: BandPart): number {
  return PRESS_HEIGHT + BAND_PARTS.indexOf(part) * PART_HEIGHT;
}

function draw(): void {
  viewNow = player.now();
  g.font = FONT;
  g.fillStyle = INK.well;
  g.fillRect(0, 0, width, HEIGHT);
  g.save();
  g.beginPath();
  g.rect(GUTTER, 0, width - GUTTER, HEIGHT);
  g.clip();
  if (band) drawGrid(band);
  for (const plan of plans) drawBar(plan);
  drawPresses();
  if (band) drawHeat(band);
  g.fillStyle = INK.now;
  g.fillRect(xOf(viewNow), 0, 1, HEIGHT);
  g.restore();
  drawGutter();
}

function drawGrid(b: Band): void {
  const beat = barSeconds / 4;
  const first = Math.ceil((spanStart() - b.conductor.barStart(0)) / beat);
  const last = Math.floor((timeOf(width) - b.conductor.barStart(0)) / beat);
  for (let s = Math.max(0, first); s <= last; s++) {
    g.fillStyle = s % 4 === 0 ? INK.bar : INK.beat;
    g.fillRect(xOf(b.conductor.barStart(0) + s * beat), 0, 1, HEIGHT);
  }
}

function drawBar(plan: BarPlan<BandPart>): void {
  const x0 = xOf(plan.start);
  const x1 = xOf(plan.start + barSeconds);
  if (x1 < GUTTER || x0 > width) return;
  for (const part of BAND_PARTS) drawPartBar(plan, part, x0, x1);
}

function drawPartBar(plan: BarPlan<BandPart>, part: BandPart, x0: number, x1: number): void {
  const top = partTop(part);
  const sounds = plan.sounding.includes(part);
  if (sounds) {
    g.fillStyle = INK.on;
    g.fillRect(x0 + 1, top + 6, x1 - x0 - 1, PART_HEIGHT - 12);
  }
  if (plan.cutBy && !sounds) {
    g.fillStyle = INK.cut;
    g.fillRect(x0 + 1, top + PART_HEIGHT - 6, x1 - x0 - 1, 2);
  }
  const change = plan.changes.find((c) => c.part === part);
  if (change) drawChange(change, x0, top);
}

function drawChange(change: Change<BandPart>, x0: number, top: number): void {
  g.fillStyle = change.on ? INK.enter : INK.cut;
  g.fillRect(x0, top + 2, 3, PART_HEIGHT - 4);
  g.fillStyle = INK.text;
  g.fillText(`${change.on ? "in" : "out"}: ${change.why}`, x0 + 6, top + PART_HEIGHT / 2 + 4);
}

function drawPresses(): void {
  for (const [i, p] of presses.entries()) {
    const x = xOf(p.at);
    const landX = xOf(p.lands);
    g.fillStyle = INK.press;
    g.fillRect(x, 4, 1, PRESS_HEIGHT - 8);
    g.fillRect(x, PRESS_HEIGHT - 6, landX - x, 1);
    g.fillRect(landX, 4, 2, PRESS_HEIGHT - 8);
    g.fillStyle = INK.text;
    g.fillText(EVENTS[p.cue], landX + 4, 16 + (i % 2) * 14);
  }
}

function drawHeat(b: Band): void {
  const top = HEIGHT - HEAT_HEIGHT;
  const scale = (v: number) => top + HEAT_HEIGHT - 4 - (Math.min(v, HEAT_CEILING) / HEAT_CEILING) * (HEAT_HEIGHT - 8);
  g.fillStyle = INK.hot;
  g.fillRect(GUTTER, scale(MIX.score.hotHeat), width - GUTTER, 1);
  g.strokeStyle = INK.heat;
  g.beginPath();
  for (let x = GUTTER; x <= xOf(viewNow); x += COLUMN_STEP) g.lineTo(x, scale(b.conductor.heatAt(timeOf(x))));
  g.stroke();
}

function drawGutter(): void {
  const rows: [string, number, number, string][] = [
    ["events", 0, PRESS_HEIGHT, ""],
    ...BAND_PARTS.map((p): [string, number, number, string] => [p, partTop(p), PART_HEIGHT, plans.at(-1)?.sounding.includes(p) ? "on" : ""]),
    ["heat", HEIGHT - HEAT_HEIGHT, HEAT_HEIGHT, band ? band.conductor.heatAt(viewNow).toFixed(2) : ""],
  ];
  for (const [label, top, height, readout] of rows) {
    g.fillStyle = INK.gutter;
    g.fillRect(0, top, GUTTER, height);
    g.fillStyle = INK.label;
    g.fillText(label, 8, top + 16);
    g.fillStyle = INK.text;
    g.fillText(readout, 8, top + 32);
    g.fillStyle = INK.edge;
    g.fillRect(0, top + height - 1, width, 1);
  }
}

function toggle(label: string, on: () => boolean, flip: () => void, size: string): HTMLElement {
  const b = el("button", { class: size }, label);
  b.addEventListener("click", () => {
    flip();
    b.classList.toggle("on", on());
  });
  return b;
}

const combatButton = toggle("Combat", () => band !== null, flipCombat, "btn-l");
const stabButton = toggle("Stabs", () => stabs, () => (stabs = !stabs), "btn-l");
stabButton.classList.add("on");
stabButton.title = "Play each event's own accent on its landing";
const eventGroups = EVENT_GROUPS.map((group) => el("div", { class: "score-lab-buttons" }, ...group.map((cue) => el("button", { onclick: () => fire(cue) }, EVENTS[cue]))));
const controls = el("div", { class: "panel" }, el("div", { class: "score-lab-buttons" }, combatButton, stabButton), ...eventGroups);
const rules = el("div", { class: "panel" }, ...BAND_PARTS.map((p) => el("div", { class: "dim" }, `${p}: ${ruleText(p)}`)));
const holder = el("div", { class: "score-lab-canvas" }, canvas);
const timeline = el("div", { class: "panel" }, holder);
const ledgerRows = el("div", { class: "score-lab-rows" });
const ledger = el("div", { class: "panel" }, ledgerRows);

function ruleText(part: BandPart): string {
  const r = BAND.parts[part];
  if ("always" in r) return "always";
  const enter = "heat" in r.enter ? `heat ${r.enter.heat}` : `${r.enter.count} of ${r.enter.events.map((e) => EVENTS[e]).join(", ")} in ${r.enter.withinBars} bars`;
  const needs = r.needs ? `, with ${r.needs}` : "";
  return `in on ${enter}${needs}. Out after ${r.stayBars} bars and ${r.quietBars} quiet bars`;
}

function syncLedger(): void {
  const key = String(plans.length);
  if (ledgerRows.dataset.key === key) return;
  ledgerRows.dataset.key = key;
  const rows = plans.filter((p) => p.changes.length > 0 || p.cutBy).reverse();
  ledgerRows.replaceChildren(...rows.map((p) => el("div", { class: "row" }, `bar ${p.bar + 1}  heat ${p.heat.toFixed(1)}  ${[...p.changes.map((c) => `${c.part} ${c.on ? "in" : "out"}: ${c.why}`), ...(p.cutBy ? [`cut by ${EVENTS[p.cutBy as BandEvent]}`] : [])].join("  ")}`)));
}

function frame(): void {
  if (band) schedule(band);
  combatButton.classList.toggle("on", band !== null);
  draw();
  syncLedger();
  requestAnimationFrame(frame);
}

root.replaceChildren(el("div", { class: "score-lab-side" }, controls, rules), timeline, ledger);
new ResizeObserver(() => fitCanvas(holder.clientWidth)).observe(holder);
fitCanvas(holder.clientWidth);
requestAnimationFrame(frame);
