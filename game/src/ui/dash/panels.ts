import { type Msg, num, SPACE, verbatim } from "../../text/msg";
import { textNode } from "../../text/language";
import { registerRichTip } from "../touch-tip";
import { createIcon, type IconName } from "../cards";
import { el } from "../dom";
import { coinEl } from "../units";
import { clampShare, setLcd, DRIVE_PLATE, RADIO_PLATE, isOff, keyCap, kitPiece, lamp, Plate, Rocker, setAttrText, tray, setData, setFlag, showControl, svgNode, type RockerView } from "./skin";

export type StatTone = "base" | "warn" | "danger";

export interface Dial {
  cx: number;
  cy: number;
  sweep: number;
}

export function polar(dial: Dial, share: number, radius: number): { x: number; y: number } {
  const angle = ((share - 0.5) * dial.sweep * Math.PI) / 180;
  return { x: dial.cx + radius * Math.sin(angle), y: dial.cy - radius * Math.cos(angle) };
}

export function arcPath(dial: Dial, from: number, to: number, radius: number): string {
  const a = polar(dial, from, radius);
  const b = polar(dial, to, radius);
  const large = (to - from) * dial.sweep > 180 ? 1 : 0;
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}A${radius} ${radius} 0 ${large} 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

function radial(dial: Dial, cls: string, share: number, inner: number, outer: number): SVGElement {
  const a = polar(dial, share, inner);
  const b = polar(dial, share, outer);
  return svgNode("line", { class: cls, x1: a.x.toFixed(1), y1: a.y.toFixed(1), x2: b.x.toFixed(1), y2: b.y.toFixed(1) });
}

export type Pin = (node: HTMLElement, x: number, y: number) => HTMLElement;

function dialText(cls: string, msg: Msg): HTMLElement {
  return el("span", { class: `dial-text ${cls}`, "aria-hidden": "true" }, msg);
}

export function needleAngle(share: number, sweep: number): number {
  return (clampShare(share) - 0.5) * sweep;
}

function needle(dial: Dial, cls: string, length: number, hub: number): SVGElement {
  const group = svgNode("g", { class: `dial-needle ${cls}`, style: `transform-origin:${dial.cx}px ${dial.cy}px` });
  group.append(
    svgNode("path", { class: "needle-arm", d: `M${dial.cx - hub * 0.28} ${dial.cy}L${dial.cx} ${dial.cy - length}L${dial.cx + hub * 0.28} ${dial.cy}Z` }),
    svgNode("circle", { class: "needle-hub", cx: dial.cx, cy: dial.cy, r: hub }),
  );
  return group;
}

function turnNeedle(node: SVGElement, dial: Dial, share: number): void {
  const angle = `${needleAngle(share, dial.sweep).toFixed(2)}deg`;
  if ((node as SVGElement & ElementCSSInlineStyle).style.getPropertyValue("--needle") !== angle) (node as SVGElement & ElementCSSInlineStyle).style.setProperty("--needle", angle);
}

export interface ScaleTick {
  speed: number;
  share: number;
  major: boolean;
}

const MAJOR_STEPS = [10, 20, 30, 40, 50, 60, 80, 100, 120, 200, 250, 500];
const MAJOR_GAPS_AT_MOST = 3;
const MINORS_PER_MAJOR = [8, 5, 4, 2, 1];

export function dialShare(speed: number, top: number): number {
  if (!(top > 0)) throw new Error(`A dial needs a scale end above 0, got ${top}`);
  return clampShare(speed / top);
}

export function scaleTicks(top: number): ScaleTick[] {
  if (!Number.isInteger(top) || top <= 0) throw new Error(`A scale ends on a whole number above 0, got ${top}`);
  const major = MAJOR_STEPS.find((step) => top / step <= MAJOR_GAPS_AT_MOST && top % step === 0) ?? top;
  const step = major / (MINORS_PER_MAJOR.find((count) => Number.isInteger(major / count)) ?? 1);
  const ticks: ScaleTick[] = [];
  for (let speed = 0; speed <= top; speed += step) ticks.push({ speed, share: speed / top, major: speed % major === 0 });
  return ticks;
}

const DIAL_ENDS = [60, 80, 100, 120, 160, 200, 240, 300, 400, 500];

export function dialEnd(top: number): number {
  const end = DIAL_ENDS.find((e) => e >= top);
  if (end === undefined) throw new Error(`The speed dial ends at ${DIAL_ENDS[DIAL_ENDS.length - 1]} km/h at most, got ${top}`);
  return end;
}

export function litSegments(share: number, count: number): number {
  return Math.round(clampShare(share) * count);
}

const SPEED_DIAL: Dial = { cx: 407, cy: 418, sweep: 230 };
const SPEED_SEGMENTS = 30;
const SEGMENT_RADIUS = 276;
const UNIT_DROP = 96;
const TICK_OUTER = 334;
const LABEL_RADIUS = 200;

export interface SpeedView {
  speed: number;
  top: number;
  max: number;
  pace: number | null;
}

export class SpeedDial {
  readonly root = svgNode("g", { class: "speed-dial" });
  private readonly segments: SVGElement[] = [];
  private readonly scale = svgNode("g", { class: "dial-scale" });
  private readonly pace = svgNode("path", { class: "dial-pace", d: `M${SPEED_DIAL.cx} ${SPEED_DIAL.cy - TICK_OUTER - 4}l-14 -24h28z`, style: `transform-origin:${SPEED_DIAL.cx}px ${SPEED_DIAL.cy}px` });
  private readonly needle = needle(SPEED_DIAL, "speed-needle", LABEL_RADIUS - 36, 26);
  private drawnTop = 0;
  private numbers: HTMLElement[] = [];

  constructor(unit: Msg, private readonly pin: Pin) {
    const ring = svgNode("g", { class: "dial-segments" });
    for (let i = 0; i < SPEED_SEGMENTS; i++) {
      const segment = svgNode("path", { class: "dial-segment", d: arcPath(SPEED_DIAL, i / SPEED_SEGMENTS + 0.004, (i + 0.78) / SPEED_SEGMENTS, SEGMENT_RADIUS) });
      this.segments.push(segment);
      ring.append(segment);
    }
    this.root.append(ring, this.scale, this.pace, this.needle);
    pin(dialText("dial-unit", unit), SPEED_DIAL.cx, SPEED_DIAL.cy + UNIT_DROP);
  }

  update(view: SpeedView): void {
    this.drawScale(view.top);
    const lit = litSegments(dialShare(view.speed, view.top), SPEED_SEGMENTS);
    const beyond = SPEED_SEGMENTS - litSegments(dialShare(view.max, view.top), SPEED_SEGMENTS);
    this.segments.forEach((segment, i) => {
      setFlag(segment, "lit", i < lit);
      setFlag(segment, "beyond", i >= SPEED_SEGMENTS - beyond);
    });
    turnNeedle(this.needle, SPEED_DIAL, dialShare(view.speed, view.top));
    setFlag(this.pace, "hidden", view.pace === null);
    if (view.pace !== null) turnNeedle(this.pace, SPEED_DIAL, dialShare(view.pace, view.top));
  }

  private drawScale(top: number): void {
    if (top === this.drawnTop) return;
    this.drawnTop = top;
    const ticks = scaleTicks(top);
    this.scale.replaceChildren(...ticks.map((tick) => radial(SPEED_DIAL, tick.major ? "dial-tick major" : "dial-tick", tick.share, TICK_OUTER - (tick.major ? 26 : 12), TICK_OUTER)));
    for (const old of this.numbers) old.remove();
    this.numbers = ticks.filter((tick) => tick.major).map((tick) => {
      const at = polar(SPEED_DIAL, tick.share, LABEL_RADIUS);
      return this.pin(dialText("dial-number", num(tick.speed, "int")), at.x, at.y);
    });
  }
}

export interface ArcSetup {
  cx: number;
  low: Msg;
  high: Msg;
  tone: "fuel" | "heat";
}

const ARC_CY = 242;
const ARC_SWEEP = 100;
const ARC_RADIUS = 112;
const ARC_SEGMENTS = 6;
const ARC_LABEL_GAP = 34;

export class ArcGauge {
  readonly root = svgNode("g", { class: "arc-gauge" });
  private readonly dial: Dial;
  private readonly needle: SVGElement;

  constructor(setup: ArcSetup, pin: Pin) {
    this.dial = { cx: setup.cx, cy: ARC_CY, sweep: ARC_SWEEP };
    this.needle = needle(this.dial, "arc-needle", 128, 13);
    this.root.classList.add(`arc-${setup.tone}`);
    const segments = Array.from({ length: ARC_SEGMENTS }, (_, i) =>
      svgNode("path", { class: `arc-segment arc-segment-${i}`, d: arcPath(this.dial, i / ARC_SEGMENTS + 0.01, (i + 0.84) / ARC_SEGMENTS, ARC_RADIUS) }),
    );
    const low = polar(this.dial, 0, ARC_RADIUS);
    const high = polar(this.dial, 1, ARC_RADIUS);
    this.root.append(...segments, this.needle);
    pin(dialText(`arc-end arc-${setup.tone}`, setup.low), low.x, low.y + ARC_LABEL_GAP);
    pin(dialText(`arc-end arc-high arc-${setup.tone}`, setup.high), high.x, high.y + ARC_LABEL_GAP);
  }

  update(share: number, warn: boolean): void {
    turnNeedle(this.needle, this.dial, share);
    setFlag(this.root, "warn", warn);
  }
}

export interface DriveLabels {
  manual: Msg;
  lights: Msg;
  overdrive: Msg;
  cool: Msg;
  speedUnit: Msg;
}

export interface DriveSetup {
  labels: DriveLabels;
  onManual: () => void;
  onLights: () => void;
  onOverdrive: () => void;
  onCool: () => void;
}

export interface CoolView {
  title: Msg;
  reason: Msg | null;
  locked: boolean;
}

export interface SpeedLineView {
  label: Msg;
  value: Msg;
  tone: "base" | "bad" | "good" | "plain";
}

export interface DriveView extends SpeedView {
  speedTitle: Msg;
  speedLines: SpeedLineView[];
  fuel: number;
  fuelTitle: Msg;
  fuelWarn: boolean;
  heat: number;
  heatTitle: Msg;
  heatWarn: boolean;
  manual: RockerView;
  lights: RockerView;
  overdrive: RockerView;
  cool: CoolView;
}

export class DrivePanel {
  readonly root: HTMLElement;
  private readonly plate = new Plate(DRIVE_PLATE, "drive-plate");
  private readonly speed: SpeedDial;
  private readonly fuel: ArcGauge;
  private readonly heat: ArcGauge;
  private speedView: DriveView | null = null;
  private readonly speedSpot = el("span", { class: "plate-spot", role: "img" });
  private readonly fuelSpot = el("span", { class: "plate-spot", role: "img" });
  private readonly heatSpot = el("span", { class: "plate-spot", role: "img" });
  private readonly cool: HTMLButtonElement;
  private readonly manual: Rocker;
  private readonly lights: Rocker;
  private readonly overdrive: Rocker;

  constructor(setup: DriveSetup) {
    const labels = setup.labels;
    const pin: Pin = (node, x, y) => this.plate.pin(node, [x, y]);
    this.speed = new SpeedDial(labels.speedUnit, pin);
    this.fuel = new ArcGauge({ cx: 908, low: verbatim("E"), high: verbatim("F"), tone: "fuel" }, pin);
    this.heat = new ArcGauge({ cx: 1194, low: verbatim("C"), high: verbatim("H"), tone: "heat" }, pin);
    this.plate.drawing("drive-drawing").append(this.speed.root, this.fuel.root, this.heat.root);
    this.plate.place(this.speedSpot, "face");
    registerRichTip(this.speedSpot, () => this.speedTip());
    this.plate.place(this.fuelSpot, "fuel");
    this.plate.place(this.heatSpot, "heat");
    this.cool = this.plate.place(keyCap("cool-key", labels.cool, setup.onCool, createIcon("water")), "coolKey");
    this.plate.pin(el("span", { class: "plate-label" }, labels.cool), "coolLabel");
    this.manual = this.rocker(labels.manual, "R", setup.onManual, "A");
    this.lights = this.rocker(labels.lights, "L", setup.onLights, "B");
    this.overdrive = this.rocker(labels.overdrive, "O", setup.onOverdrive, "C");
    this.root = el("div", { class: "hud-drive" }, this.plate.root);
  }

  private speedTip(): HTMLElement {
    const view = this.speedView!;
    const line = (cls: string, ...parts: Msg[]) => el("div", { class: cls }, ...parts.map((part) => textNode(part)));
    return el("div", { class: "speed-tip" }, line("speed-head", view.speedTitle), ...view.speedLines.map((entry) => line(`speed-line tone-${entry.tone}`, entry.label, SPACE, entry.value)));
  }

  private rocker(label: Msg, key: string, onFlip: () => void, slot: "A" | "B" | "C"): Rocker {
    const rocker = new Rocker(label, key, onFlip);
    this.plate.pin(rocker.root, `rocker${slot}`);
    this.plate.pin(rocker.label, `label${slot}`);
    return rocker;
  }

  showSpeed(speed: number): void {
    if (this.speedView) this.speed.update({ ...this.speedView, speed });
  }

  update(view: DriveView): void {
    this.speed.update(view);
    this.fuel.update(view.fuel, view.fuelWarn);
    this.heat.update(view.heat, view.heatWarn);
    this.speedView = view;
    setAttrText(this.speedSpot, "aria-label", view.speedTitle);
    setAttrText(this.fuelSpot, "title", view.fuelTitle);
    setAttrText(this.fuelSpot, "aria-label", view.fuelTitle);
    setAttrText(this.heatSpot, "title", view.heatTitle);
    setAttrText(this.heatSpot, "aria-label", view.heatTitle);
    this.manual.update(view.manual);
    this.lights.update(view.lights);
    this.overdrive.update(view.overdrive);
    setFlag(this.cool, "locked", view.cool.locked);
    showControl(this.cool, { title: view.cool.title, reason: view.cool.reason, key: "G" });
  }
}

export interface StatsView {
  money: number;
  moneyTitle: Msg;
  supplies: number;
  suppliesTitle: Msg;
  suppliesTone: StatTone;
  health: number;
  healthTitle: Msg;
}

const STAT_CELLS = 3;
const MONEY_CELLS = 6;

export class StatsStrip {
  readonly root: HTMLElement;
  private readonly money = el("span", { class: "lcd-digits money-digits" });
  private readonly supplies = el("span", { class: "lcd-digits" });
  private readonly health = el("span", { class: "lcd-digits" });
  private readonly cells: HTMLElement[];

  constructor(unit: Msg) {
    this.cells = [
      trayCell("money", el("span", { class: "stat-icon" }, coinEl()), el("span", { class: "tray-window stat-lcd" }, this.money)),
      trayCell("supplies", el("span", { class: "stat-icon" }, createIcon("supplies")), el("span", { class: "tray-window stat-lcd stat-short" }, this.supplies), el("span", { class: "plate-label stat-unit" }, unit)),
      trayCell("health", el("span", { class: "stat-icon" }, createIcon("health")), el("span", { class: "tray-window stat-lcd stat-short" }, this.health)),
    ];
    this.root = el("div", { class: "hud-stats readouts" }, tray("stats-tray", ...this.cells));
  }

  update(view: StatsView): void {
    setLcd(this.money, String(view.money), MONEY_CELLS);
    setFlag(this.money, "negative", view.money < 0);
    setLcd(this.supplies, String(Math.round(view.supplies)), STAT_CELLS);
    setData(this.supplies, "tone", view.suppliesTone);
    setLcd(this.health, String(Math.round(view.health)), STAT_CELLS);
    const titles = [view.moneyTitle, view.suppliesTitle, view.healthTitle];
    this.cells.forEach((cell, i) => {
      if (i > 0) setAttrText(cell, "title", titles[i]);
      setAttrText(cell, "aria-label", titles[i]);
    });
  }
}

function trayCell(id: string, ...parts: HTMLElement[]): HTMLElement {
  return el("span", { class: "tray-cell", "data-resource": id, role: "img" }, ...parts);
}

export type SystemKey = "map" | "journal" | "car" | "character" | "menu";

export const SYSTEM_KEYS: readonly SystemKey[] = ["map", "journal", "car", "character", "menu"];

const SYSTEM_ICONS: Record<SystemKey, IconName> = { map: "map", journal: "journal", car: "truck", character: "driver", menu: "menu" };

export interface SystemKeyView {
  title: Msg;
  reason: Msg | null;
  marked: boolean;
  key?: string;
  hidden?: boolean;
}

export class SystemKeys {
  readonly root: HTMLElement;
  private readonly keys: Record<SystemKey, HTMLButtonElement>;

  constructor(labels: Record<SystemKey, Msg>, actions: Record<SystemKey, () => void>) {
    const entries = SYSTEM_KEYS.map((name) => {
      const key = keyCap(`system-key system-${name}`, labels[name], actions[name], createIcon(SYSTEM_ICONS[name]));
      const mark = lamp("key-mark");
      setData(mark, "lamp", "amber");
      key.append(mark);
      setData(key, "action", name);
      return [name, key] as const;
    });
    this.keys = Object.fromEntries(entries) as Record<SystemKey, HTMLButtonElement>;
    this.root = el("div", { class: "hud-system" }, tray("keys-tray", ...entries.map(([, key]) => key)));
  }

  button(name: SystemKey): HTMLButtonElement {
    return this.keys[name];
  }

  update(views: Record<SystemKey, SystemKeyView>): void {
    for (const name of SYSTEM_KEYS) {
      const view = views[name];
      this.keys[name].style.display = view.hidden ? "none" : "";
      setFlag(this.keys[name], "marked", view.marked);
      showControl(this.keys[name], { title: view.title, reason: view.reason, key: view.key });
    }
  }
}

export interface LineChanges {
  added: number[];
  removed: number[];
}

export function lineChanges(oldIds: readonly number[], newIds: readonly number[]): LineChanges {
  const before = new Set(oldIds);
  const after = new Set(newIds);
  return { added: newIds.filter((id) => !before.has(id)), removed: oldIds.filter((id) => !after.has(id)) };
}

export const TIME_SPEEDS: readonly number[] = [1, 2, 4, 8];

const KNOB_SWEEP = 240;

export function knobAngle(index: number, count: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= count) throw new Error(`A knob position is a whole number below ${count}, got ${index}`);
  return count === 1 ? 0 : -KNOB_SWEEP / 2 + (KNOB_SWEEP * index) / (count - 1);
}

export const WHEEL_RIB_PX = 6;
const DAY_CELLS = 2;

export function wheelTurn(scrollTop: number): number {
  return (scrollTop / WHEEL_RIB_PX) % 1;
}

export interface ClockView {
  day: number;
  hour: number;
  minute: number;
  title: Msg;
}

export interface SpeedKnobView {
  index: number;
  title: Msg;
  reason: Msg | null;
  running: boolean;
}

export interface TurnKeyView {
  title: Msg;
  label: Msg;
  disabled: boolean;
  auto: boolean;
}

export interface DeckView {
  clock: ClockView;
  speed: SpeedKnobView;
  turn: TurnKeyView;
  offAir: boolean;
}

export interface DeckSetup {
  dayWord: Msg;
  turnLabel: Msg;
  speedLabel: (speed: number) => Msg;
  onSpeed: (index: number) => void;
  onTurnPress: () => void;
  onTurnRelease: () => void;
}

function twoDigits(value: number): string {
  if (!Number.isInteger(value) || value < 0) throw new Error(`A clock shows whole numbers from 0, got ${value}`);
  return String(value).padStart(2, "0");
}

function shareRadioScale(plateWidth: number): void {
  const root = document.documentElement;
  const units = Number(getComputedStyle(root).getPropertyValue("--hud-radio-n"));
  if (!(units > 0)) throw new Error("--hud-radio-n is not set");
  if (plateWidth > 0) root.style.setProperty("--hud-radio-scale", String(plateWidth / units));
}

export class RadioDeck {
  readonly root: HTMLElement;
  readonly talk = el("div", { class: "deck-talk" });
  readonly log = el("div", { class: "deck-log" });
  private readonly plate = new Plate(RADIO_PLATE, "radio-plate");
  private readonly wheel = el("span", { class: "deck-wheel", role: "scrollbar", "aria-orientation": "vertical" }, el("span", { class: "wheel-ribs", "aria-hidden": "true" }));
  private readonly lcdDay = el("span", { class: "lcd-digits lcd-day" });
  private readonly lcdHour = el("span", { class: "lcd-digits lcd-hour" });
  private readonly lcdMinute = el("span", { class: "lcd-digits lcd-minute" });
  private readonly lcd: HTMLElement;
  private readonly knob: HTMLButtonElement;
  private readonly knobFace = kitPiece("knob", "knob-face");
  private readonly marks: HTMLButtonElement[];
  private readonly turn: HTMLButtonElement;
  private scroller: HTMLElement | null = null;
  private held = false;
  private index = 0;

  constructor(private readonly setup: DeckSetup) {
    this.plate.place(this.talk, "talk");
    this.plate.place(this.log, "log");
    this.plate.place(this.wheel, "wheel");
    this.lcd = this.plate.place(el("div", { class: "deck-lcd", role: "timer" }, el("span", { class: "lcd-word" }, setup.dayWord), this.lcdDay, el("span", { class: "lcd-time" }, this.lcdHour, this.lcdMinute)), "lcd");
    this.marks = TIME_SPEEDS.map((speed, i) => {
      const mark = el("button", { type: "button", class: "knob-mark", style: this.markStyle(i) }, setup.speedLabel(speed)) as HTMLButtonElement;
      mark.addEventListener("click", () => this.pick(i));
      return mark;
    });
    this.plate.place(el("div", { class: "knob-marks" }, ...this.marks), "knobMarks");
    this.knob = this.plate.place(el("button", { type: "button", class: "knob-key" }, this.knobFace) as HTMLButtonElement, "knob");
    this.knob.addEventListener("click", () => this.pick((this.index + 1) % TIME_SPEEDS.length));
    this.turn = this.plate.place(keyCap("play-key", setup.turnLabel, () => undefined, el("span", { class: "play-mark", "aria-hidden": "true" })), "play");
    this.turn.addEventListener("pointerdown", (e) => this.press(e));
    this.turn.addEventListener("pointerup", () => this.release());
    this.turn.addEventListener("pointercancel", () => this.release());
    this.wheel.addEventListener("pointerdown", (e) => this.dragWheel(e));
    this.root = el("div", { class: "hud-radio" }, this.plate.root);
    new ResizeObserver(([entry]) => shareRadioScale(entry.contentRect.width)).observe(this.plate.root);
  }

  bindLog(scroller: HTMLElement): void {
    this.scroller = scroller;
    scroller.addEventListener("scroll", () => this.wheel.style.setProperty("--wheel-turn", String(wheelTurn(scroller.scrollTop))));
    this.wheel.addEventListener("wheel", (e) => {
      e.preventDefault();
      scroller.scrollTop += e.deltaY;
    }, { passive: false });
  }

  update(view: DeckView): void {
    setLcd(this.lcdDay, String(view.clock.day), DAY_CELLS);
    setLcd(this.lcdHour, twoDigits(view.clock.hour), 2);
    setLcd(this.lcdMinute, twoDigits(view.clock.minute), 2);
    setAttrText(this.lcd, "aria-label", view.clock.title);
    this.index = view.speed.index;
    this.knobFace.style.setProperty("--knob", `${knobAngle(view.speed.index, TIME_SPEEDS.length)}deg`);
    this.marks.forEach((mark, i) => setFlag(mark, "on", i === view.speed.index));
    showControl(this.knob, { title: view.speed.title, reason: view.speed.reason });
    setFlag(this.knob, "running", view.speed.running);
    setAttrText(this.turn, "title", view.turn.title);
    setAttrText(this.turn, "aria-label", view.turn.label);
    setData(this.turn, "mode", view.turn.auto ? "auto" : "turn");
    if (view.turn.disabled) this.turn.setAttribute("aria-disabled", "true");
    else this.turn.removeAttribute("aria-disabled");
    setFlag(this.plate.root, "off-air", view.offAir);
  }

  private markStyle(i: number): string {
    const angle = (knobAngle(i, TIME_SPEEDS.length) * Math.PI) / 180;
    return `left:${(50 + 38 * Math.sin(angle)).toFixed(1)}%;top:${(50 - 38 * Math.cos(angle)).toFixed(1)}%`;
  }

  private pick(index: number): void {
    if (isOff(this.knob) || index === this.index) return;
    this.setup.onSpeed(index);
  }

  private press(e: PointerEvent): void {
    if (e.button !== 0 || isOff(this.turn) || this.held) return;
    this.held = true;
    this.turn.setPointerCapture(e.pointerId);
    this.setup.onTurnPress();
  }

  private release(): void {
    if (!this.held) return;
    this.held = false;
    this.setup.onTurnRelease();
  }

  private dragWheel(down: PointerEvent): void {
    const scroller = this.scroller;
    if (scroller === null || down.button !== 0) return;
    const start = scroller.scrollTop;
    this.wheel.setPointerCapture(down.pointerId);
    const move = (e: PointerEvent): void => {
      scroller.scrollTop = start + (e.clientY - down.clientY) * 2;
    };
    const stop = (): void => {
      this.wheel.removeEventListener("pointermove", move);
    };
    this.wheel.addEventListener("pointermove", move);
    this.wheel.addEventListener("pointerup", stop, { once: true });
    this.wheel.addEventListener("pointercancel", stop, { once: true });
  }
}
