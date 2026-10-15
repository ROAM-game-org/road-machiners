import "../ui/style.css";
import "./score-lab.css";
import { BAND, BAND_PARTS, MIX, SOUNDS, type BandEvent, type BandPart, type Cue } from "../data/sounds";
import { SFX_BYTES } from "../config";
import { formatSupport, loadBank } from "../audio/bank";
import { Mixer } from "../audio/mixer";
import { SoundPlayer } from "../audio/player";
import type { BarPlan, Change } from "../audio/designer";
import { devEl as el, uiRoot } from "../ui/dom";
import { token } from "../ui/tokens";
import { BAND_EVENT_GROUPS, BAND_EVENT_LABELS, BAND_STEMS, BARS_PER_LOOP, BEATS_PER_BAR, bandLead, BandSession, stemFiles, type BandTick, type PartMove, type PhrasePlay } from "./band-session";

const STOP_FADE_SECONDS = 1;
const SPAN_SECONDS = 12;
const FUTURE_SHARE = 0.15;
const GUTTER = 96;
const PRESS_HEIGHT = 44;
const PART_HEIGHT = 44;
const HEAT_HEIGHT = 70;
const HEAT_CEILING = 6;
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
  leave: token("--danger-deep"),
  skipped: token("--ink-muted"),
  heat: token("--danger-bright"),
  hot: token("--danger-deep"),
};
const FONT = `${token("--text-dense")} ${token("--font-mono")}`;

type Live = { session: BandSession; sources: AudioBufferSourceNode[]; gains: Record<BandPart, GainNode> };

const sounds: Record<string, Cue> = SOUNDS;
const root = uiRoot();
root.classList.add("score-lab");
root.append(el("div", { class: "dim" }, "Loading sounds..."));
const mixer = new Mixer(MIX);
mixer.unlockOn(window);
const { bank } = await loadBank(mixer.ctx, sounds, { expectedBytes: SFX_BYTES, support: formatSupport() });
const player = new SoundPlayer(mixer, bank, sounds);
const buffers = await loadStems();
const loops = BAND_PARTS.flatMap((part) => {
  const stem = BAND_STEMS[part];
  return stem.kind === "loop" ? [{ part, stem }] : [];
});
const barSeconds = bufferOf(loops[0].stem.file).duration / BARS_PER_LOOP;
const lead = bandLead((cue, file) => player.takeWithPeak(cue, file).peak);

async function loadStems(): Promise<Map<string, AudioBuffer>> {
  const pairs = await Promise.all(stemFiles().map(async (file) => [file, await decode(`/${file}`)] as const));
  return new Map(pairs);
}

function bufferOf(file: string): AudioBuffer {
  const buffer = buffers.get(file);
  if (!buffer) throw new Error(`Band stem ${file} was not loaded`);
  return buffer;
}

function checkLoops(): void {
  const lengths = new Set(loops.map((l) => bufferOf(l.stem.file).length));
  if (lengths.size !== 1) throw new Error(`Band loops differ in length: ${[...lengths].join(", ")}`);
}

checkLoops();

async function decode(file: string): Promise<AudioBuffer> {
  const res = await fetch(file);
  if (!res.ok) throw new Error(`Band stem ${file} failed: ${res.status}`);
  return mixer.ctx.decodeAudioData(await res.arrayBuffer());
}

let live: Live | null = null;
let stabs = true;

function startBand(): Live {
  const session = new BandSession({ now: () => player.now(), take: (cue) => player.chooseWithPeak(cue), roll: Math.random, barSeconds }, lead);
  const sources: AudioBufferSourceNode[] = [];
  const gains = {} as Record<BandPart, GainNode>;
  for (const part of BAND_PARTS) {
    const gain = mixer.ctx.createGain();
    gain.gain.value = BAND_STEMS[part].kind === "phrase" ? 1 : 0;
    gain.connect(mixer.input("music"));
    gains[part] = gain;
  }
  for (const { part, stem } of loops) {
    const src = mixer.ctx.createBufferSource();
    src.buffer = bufferOf(stem.file);
    src.loop = true;
    src.connect(gains[part]);
    src.start(session.start);
    sources.push(src);
  }
  return { session, sources, gains };
}

function playPhrase(l: Live, p: PhrasePlay): void {
  const src = mixer.ctx.createBufferSource();
  src.buffer = bufferOf(p.file);
  const gain = mixer.ctx.createGain();
  gain.gain.value = p.gain;
  src.connect(gain).connect(l.gains[p.part]);
  src.start(Math.max(player.now(), p.at));
  l.sources.push(src);
}

function phraseLength(file: string): number {
  return bufferOf(file).duration;
}

function stopBand(l: Live): void {
  const now = player.now();
  for (const part of BAND_PARTS) {
    l.gains[part].gain.cancelScheduledValues(now);
    l.gains[part].gain.setTargetAtTime(0, now, STOP_FADE_SECONDS / 3);
  }
  for (const src of l.sources) src.stop(now + STOP_FADE_SECONDS);
}

function apply(l: Live, m: PartMove): void {
  l.gains[m.part].gain.setTargetAtTime(m.move.target, Math.max(player.now(), m.move.at), m.move.tc);
}

function played(l: Live, tick: BandTick): void {
  for (const m of tick.moves) apply(l, m);
  for (const p of tick.phrases) playPhrase(l, p);
}

function fire(cue: BandEvent): void {
  if (!live) return;
  const stab = live.session.fire(cue).stab;
  if (!stabs || !stab) return;
  player.play(cue, { pan: stab.pan, gain: stab.gain }, (stab.at - player.now()) * 1000, { file: stab.file, rate: 1 });
}

function flipCombat(): void {
  if (live) stopBand(live);
  live = live ? null : startBand();
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
  if (live) drawSession(live.session);
  g.fillStyle = INK.now;
  g.fillRect(xOf(viewNow), 0, 1, HEIGHT);
  g.restore();
  drawGutter();
}

function drawSession(s: BandSession): void {
  drawGrid(s);
  for (const part of BAND_PARTS) drawLevel(s, part);
  for (const plan of s.plans) drawChanges(plan);
  drawPresses(s);
  drawHeat(s);
}

function drawGrid(s: BandSession): void {
  const first = Math.ceil((spanStart() - s.start) / s.beat);
  const last = Math.floor((timeOf(width) - s.start) / s.beat);
  const phraseBeats = BEATS_PER_BAR * BAND.phraseBars;
  for (let b = Math.max(0, first); b <= last; b++) {
    g.fillStyle = b % phraseBeats === 0 ? INK.now : b % BEATS_PER_BAR === 0 ? INK.bar : INK.beat;
    g.fillRect(xOf(s.start + b * s.beat), 0, 1, HEIGHT);
  }
}

function drawLevel(s: BandSession, part: BandPart): void {
  const top = partTop(part);
  const room = PART_HEIGHT - 12;
  g.fillStyle = INK.on;
  for (let x = GUTTER; x < width; x += COLUMN_STEP) {
    const h = shareOf(s, part, timeOf(x)) * room;
    g.fillRect(x, top + 6 + room - h, COLUMN_STEP, h);
  }
}

function shareOf(s: BandSession, part: BandPart, t: number): number {
  const stem = BAND_STEMS[part];
  if (stem.kind === "phrase") return s.phraseAt(part, t, phraseLength) ? 1 : 0;
  return s.levelOf(part, t) / stem.gain;
}

function drawChanges(plan: BarPlan<BandPart>): void {
  const x0 = xOf(plan.start);
  if (x0 < GUTTER - 200 || x0 > width) return;
  for (const change of plan.changes) drawChange(change, x0, partTop(change.part));
}

function drawChange(change: Change<BandPart>, x0: number, top: number): void {
  g.fillStyle = change.on ? INK.enter : INK.leave;
  g.fillRect(x0, top + 2, 3, PART_HEIGHT - 4);
  g.fillStyle = INK.text;
  g.fillText(`${change.on ? "in" : "out"}: ${change.why}`, x0 + 6, top + 16);
}

function drawPresses(s: BandSession): void {
  for (const [i, p] of s.presses.entries()) {
    const x = xOf(p.at);
    const landX = xOf(p.lands);
    const played = p.result === "played";
    g.fillStyle = INK.press;
    g.fillRect(x, 4, 1, PRESS_HEIGHT - 8);
    g.fillRect(x, PRESS_HEIGHT - 6, landX - x, 1);
    g.fillStyle = played ? INK.press : INK.skipped;
    g.fillRect(landX, 4, 2, PRESS_HEIGHT - 8);
    g.fillStyle = played ? INK.text : INK.skipped;
    g.fillText(played ? BAND_EVENT_LABELS[p.cue] : `${BAND_EVENT_LABELS[p.cue]} ${p.result}`, landX + 4, 12 + (i % 3) * 12);
  }
}

function drawHeat(s: BandSession): void {
  const top = HEIGHT - HEAT_HEIGHT;
  const scale = (v: number) => top + HEAT_HEIGHT - 4 - (Math.min(v, HEAT_CEILING) / HEAT_CEILING) * (HEAT_HEIGHT - 8);
  g.fillStyle = INK.hot;
  for (const part of BAND_PARTS) {
    const rule = BAND.parts[part];
    if ("always" in rule) continue;
    g.fillRect(GUTTER, scale(rule.enterAt), width - GUTTER, 1);
    g.fillText(`${part} in`, width - 60, scale(rule.enterAt) - 3);
  }
  g.strokeStyle = INK.heat;
  g.beginPath();
  for (let x = GUTTER; x <= xOf(viewNow); x += COLUMN_STEP) g.lineTo(x, scale(s.heatAt(timeOf(x))));
  g.stroke();
}

function drawGutter(): void {
  const s = live?.session;
  const rows: [string, number, number, string][] = [
    ["events", 0, PRESS_HEIGHT, ""],
    ...BAND_PARTS.map((p): [string, number, number, string] => [p, partTop(p), PART_HEIGHT, s ? shareOf(s, p, viewNow).toFixed(2) : ""]),
    ["heat", HEIGHT - HEAT_HEIGHT, HEAT_HEIGHT, s ? s.heatAt(viewNow).toFixed(2) : ""],
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

function ruleText(part: BandPart): string {
  const r = BAND.parts[part];
  if ("always" in r) return "always";
  const needs = r.needs ? `, with ${r.needs}` : "";
  return `in at heat ${r.enterAt}${needs}. Out under heat ${r.leaveAt} after ${r.holdBars} bars`;
}

const combatButton = toggle("Combat", () => live !== null, flipCombat, "btn-l");
const stabButton = toggle("Stabs", () => stabs, () => (stabs = !stabs), "btn-l");
stabButton.classList.add("on");
stabButton.title = "Play each event's own accent on its landing";
const eventGroups = BAND_EVENT_GROUPS.map((group) => el("div", { class: "score-lab-buttons" }, ...group.map((cue) => el("button", { onclick: () => fire(cue) }, BAND_EVENT_LABELS[cue]))));
const controls = el("div", { class: "panel" }, el("div", { class: "score-lab-buttons" }, combatButton, stabButton), ...eventGroups);
const rules = el("div", { class: "panel" }, ...BAND_PARTS.map((p) => el("div", { class: "dim" }, `${p}: ${ruleText(p)}`)), el("div", { class: "dim" }, `Changes only every ${BAND.phraseBars} bars`));
const holder = el("div", { class: "score-lab-canvas" }, canvas);
const timeline = el("div", { class: "panel" }, holder);
const ledgerRows = el("div", { class: "score-lab-rows" });
const ledger = el("div", { class: "panel" }, ledgerRows);

function syncLedger(): void {
  const plans = live?.session.plans ?? [];
  const key = String(plans.length);
  if (ledgerRows.dataset.key === key) return;
  ledgerRows.dataset.key = key;
  const rows = plans.filter((p) => p.changes.length > 0).reverse();
  ledgerRows.replaceChildren(...rows.map((p) => el("div", { class: "row" }, `bar ${p.bar + 1}  heat ${p.heat.toFixed(1)}  ${p.changes.map((c) => `${c.part} ${c.on ? "in" : "out"}: ${c.why}`).join("  ")}`)));
}

function frame(): void {
  if (live) played(live, live.session.tick());
  combatButton.classList.toggle("on", live !== null);
  draw();
  syncLedger();
  requestAnimationFrame(frame);
}

root.replaceChildren(el("div", { class: "score-lab-side" }, controls, rules), timeline, ledger);
new ResizeObserver(() => fitCanvas(holder.clientWidth)).observe(holder);
fitCanvas(holder.clientWidth);
requestAnimationFrame(frame);
