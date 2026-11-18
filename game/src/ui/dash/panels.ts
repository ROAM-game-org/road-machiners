import { type Msg, num, SPACE, verbatim } from "../../text/msg";
import { textNode } from "../../text/language";
import { registerRichTip } from "../touch-tip";
import { createIcon, type IconName } from "../cards";
import { el } from "../dom";
import { coinEl } from "../units";
import { deviceCast } from "./skin";
import { BakedPart } from "./baked";
import { BAKED } from "./baked";
import { clampShare, setLcd, DRIVE_PLATE, isOff, lamp, plateKey, Rocker, setAttrText, setData, setFlag, showControl, svgNode, type RockerView } from "./skin";

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

const SPEED_DIAL: Dial = { cx: DRIVE_PLATE.boxes.dialHub[0], cy: DRIVE_PLATE.boxes.dialHub[1], sweep: 230 };
const SPEED_SEGMENTS = 30;
const SEGMENT_RADIUS = 248;
const UNIT_DROP = 86;
const TICK_OUTER = 301;
const LABEL_RADIUS = 180;

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
  private readonly needle = needle(SPEED_DIAL, "speed-needle", LABEL_RADIUS - 32, 23);
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
    this.scale.replaceChildren(...ticks.map((tick) => radial(SPEED_DIAL, tick.major ? "dial-tick major" : "dial-tick", tick.share, TICK_OUTER - (tick.major ? 23 : 11), TICK_OUTER)));
    for (const old of this.numbers) old.remove();
    this.numbers = ticks.filter((tick) => tick.major).map((tick) => {
      const at = polar(SPEED_DIAL, tick.share, LABEL_RADIUS);
      return this.pin(dialText("dial-number", num(tick.speed, "int")), at.x, at.y);
    });
  }
}

export interface ArcSetup {
  low: Msg;
  high: Msg;
  tone: "fuel" | "heat";
}

const ARC_SWEEP = 100;
const ARC_SEGMENTS = 6;
const ARC_VIEW_W = 100;
const ARC_REACH = 0.43;
const ARC_HUB_RISE = 0.16;
const ARC_STROKE = 0.143;
const ARC_NEEDLE = 1.14;
const ARC_HUB = 0.116;
const ARC_LABEL_GAP = 0.3;

export class ArcGauge {
  readonly root: HTMLElement;
  private readonly gauge = svgNode("g", { class: "arc-gauge" });
  private readonly dial: Dial;
  private readonly needle: SVGElement;

  constructor(setup: ArcSetup, glass: readonly [number, number]) {
    const height = (ARC_VIEW_W * glass[1]) / glass[0];
    const radius = ARC_VIEW_W * ARC_REACH;
    this.dial = { cx: ARC_VIEW_W / 2, cy: height * (1 - ARC_HUB_RISE), sweep: ARC_SWEEP };
    this.needle = needle(this.dial, "arc-needle", radius * ARC_NEEDLE, radius * ARC_HUB);
    this.gauge.classList.add(`arc-${setup.tone}`);
    const segments = svgNode("g", { class: "arc-segments", "stroke-width": (radius * ARC_STROKE).toFixed(2) });
    segments.append(...Array.from({ length: ARC_SEGMENTS }, (_, i) => svgNode("path", { class: `arc-segment arc-segment-${i}`, d: arcPath(this.dial, i / ARC_SEGMENTS + 0.01, (i + 0.84) / ARC_SEGMENTS, radius) })));
    this.gauge.append(segments, this.needle);
    const svg = svgNode("svg", { class: "gauge-drawing", viewBox: `0 0 ${ARC_VIEW_W} ${height.toFixed(2)}`, "aria-hidden": "true" });
    svg.append(this.gauge);
    const label = (cls: string, msg: Msg, share: number): HTMLElement => {
      const at = polar(this.dial, share, radius);
      const node = dialText(`arc-end ${cls} arc-${setup.tone}`, msg);
      node.style.left = `${((at.x / ARC_VIEW_W) * 100).toFixed(2)}%`;
      node.style.top = `${(((at.y + radius * ARC_LABEL_GAP) / height) * 100).toFixed(2)}%`;
      return node;
    };
    this.root = el("div", { class: "gauge-zone", role: "img" }, svg, label("arc-low", setup.low, 0), label("arc-high", setup.high, 1));
  }

  update(share: number, warn: boolean, title: Msg): void {
    turnNeedle(this.needle, this.dial, share);
    setFlag(this.gauge, "warn", warn);
    setAttrText(this.root, "title", title);
    setAttrText(this.root, "aria-label", title);
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
  private readonly plate = new BakedPart("drive", BAKED.drive, "drive-plate", DRIVE_PLATE);
  private readonly coolFrames = this.plate.sprite("cool", "cool-up");
  private readonly rockerFrames = [0, 1, 2].map((i) => this.plate.sprite(`rocker${i}`, `rocker${i}-off`));
  private readonly speed: SpeedDial;
  private readonly fuel: ArcGauge;
  private readonly heat: ArcGauge;
  private speedView: DriveView | null = null;
  private readonly speedSpot = el("span", { class: "plate-spot", role: "img" });
  private readonly cool: HTMLButtonElement;
  private readonly manual: Rocker;
  private readonly lights: Rocker;
  private readonly overdrive: Rocker;

  constructor(setup: DriveSetup) {
    const labels = setup.labels;
    const pin: Pin = (node, x, y) => this.plate.pin(node, [x, y]);
    this.speed = new SpeedDial(labels.speedUnit, pin);
    this.fuel = new ArcGauge({ low: verbatim("E"), high: verbatim("F"), tone: "fuel" }, BAKED.drive.desktop.zones.fuel.size);
    this.heat = new ArcGauge({ low: verbatim("C"), high: verbatim("H"), tone: "heat" }, BAKED.drive.desktop.zones.heat.size);
    this.plate.drawing("drive-drawing").append(this.speed.root);
    this.plate.zone(this.fuel.root, "fuel");
    this.plate.zone(this.heat.root, "heat");
    this.plate.place(this.speedSpot, "face");
    registerRichTip(this.speedSpot, () => this.speedTip());
    this.cool = this.plate.zone(plateKey("baked-key cool-key", labels.cool, setup.onCool), "coolHit");
    const sink = this.plate.follow(el("span", { class: "key-print cool-print", "aria-hidden": "true" }, labels.cool), "coolText", "coolTextDown");
    this.cool.addEventListener("pointerdown", () => this.pressCool(true, sink));
    for (const end of ["pointerup", "pointercancel", "pointerleave"]) this.cool.addEventListener(end, () => this.pressCool(false, sink));
    this.manual = this.rocker(labels.manual, "R", setup.onManual, 0);
    this.lights = this.rocker(labels.lights, "L", setup.onLights, 1);
    this.overdrive = this.rocker(labels.overdrive, "O", setup.onOverdrive, 2);
    this.root = el("div", { class: "hud-drive" }, this.plate.root);
  }

  private speedTip(): HTMLElement {
    const view = this.speedView!;
    const line = (cls: string, ...parts: Msg[]) => el("div", { class: cls }, ...parts.map((part) => textNode(part)));
    return el("div", { class: "speed-tip" }, line("speed-head", view.speedTitle), ...view.speedLines.map((entry) => line(`speed-line tone-${entry.tone}`, entry.label, SPACE, entry.value)));
  }

  private pressCool(down: boolean, sink: (pressed: boolean) => void): void {
    const pressed = down && !isOff(this.cool);
    this.coolFrames.show(pressed ? "cool-down" : "cool-up");
    sink(pressed);
  }

  private rocker(label: Msg, key: string, onFlip: () => void, slot: 0 | 1 | 2): Rocker {
    const rocker = new Rocker(label, key, onFlip, false);
    this.plate.zone(rocker.root, `rockerHit${slot}`);
    this.plate.pin(rocker.label, `label${"ABC"[slot]}` as "labelA");
    return rocker;
  }

  showSpeed(speed: number): void {
    if (this.speedView) this.speed.update({ ...this.speedView, speed });
  }

  update(view: DriveView): void {
    this.speed.update(view);
    this.fuel.update(view.fuel, view.fuelWarn, view.fuelTitle);
    this.heat.update(view.heat, view.heatWarn, view.heatTitle);
    this.speedView = view;
    setAttrText(this.speedSpot, "aria-label", view.speedTitle);
    [view.manual, view.lights, view.overdrive].forEach((rocker, i) => this.rockerFrames[i].show(`rocker${i}-${rocker.checked ? "on" : "off"}`));
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
  private readonly cells: HTMLElement[][];
  private readonly plate = new BakedPart("stats", BAKED.stats, "stats-plate", STATS_LAYOUT);

  constructor(unit: Msg) {
    const cell = (id: string, icon: HTMLElement, iconZone: string, digits: HTMLElement): HTMLElement[] => [
      this.plate.zone(el("span", { class: "stat-icon", "data-resource": id, role: "img" }, icon), iconZone),
      this.plate.zone(el("span", { class: "stat-lcd", "data-resource": id, role: "img" }, digits), id),
    ];
    this.cells = [cell("money", coinEl(), "coin", this.money), cell("supplies", createIcon("supplies"), "bag", this.supplies), cell("health", createIcon("health"), "cross", this.health)];
    this.plate.zone(el("span", { class: "plate-label stat-unit" }, unit), "unit");
    this.root = el("div", { class: "hud-stats readouts" }, this.plate.root);
  }

  update(view: StatsView): void {
    setLcd(this.money, String(view.money), MONEY_CELLS);
    setFlag(this.money, "negative", view.money < 0);
    setLcd(this.supplies, String(Math.round(view.supplies)), STAT_CELLS);
    setData(this.supplies, "tone", view.suppliesTone);
    setLcd(this.health, String(Math.round(view.health)), STAT_CELLS);
    const titles = [view.moneyTitle, view.suppliesTitle, view.healthTitle];
    this.cells.forEach((nodes, i) => {
      for (const node of nodes) {
        if (i > 0) setAttrText(node, "title", titles[i]);
        setAttrText(node, "aria-label", titles[i]);
      }
    });
  }
}

const STATS_LAYOUT = { width: 304.9, height: 52, boxes: {} };
const KEYS_LAYOUT = { width: 211, height: 52, boxes: {} };

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

const KEY_ICON_ZONES: readonly (readonly [string, string])[] = [["icon0", "icon0Down"], ["icon1", "icon1Down"], ["icon2", "icon2Down"], ["icon3", "icon3Down"], ["icon4", "icon4Down"]];

export class SystemKeys {
  readonly root: HTMLElement;
  private readonly keys: Record<SystemKey, HTMLButtonElement>;

  private readonly plate = new BakedPart("keys", BAKED.keys, "keys-plate", KEYS_LAYOUT);

  constructor(labels: Record<SystemKey, Msg>, actions: Record<SystemKey, () => void>) {
    const entries = SYSTEM_KEYS.map((name, i) => {
      const key = this.plate.zone(plateKey(`baked-key system-key system-${name}`, labels[name], actions[name]), `hit${i}`);
      const mark = lamp("key-mark");
      setData(mark, "lamp", "amber");
      key.append(mark);
      setData(key, "action", name);
      const frames = this.plate.sprite(`key${i}`, `key${i}-up`);
      const sink = this.plate.follow(el("span", { class: "key-icon system-icon", "aria-hidden": "true" }, createIcon(SYSTEM_ICONS[name])), ...KEY_ICON_ZONES[i]!);
      const press = (down: boolean): void => {
        frames.show(down ? `key${i}-down` : `key${i}-up`);
        sink(down);
      };
      key.addEventListener("pointerdown", () => press(!isOff(key)));
      for (const end of ["pointerup", "pointercancel", "pointerleave"]) key.addEventListener(end, () => press(false));
      return [name, key] as const;
    });
    this.keys = Object.fromEntries(entries) as Record<SystemKey, HTMLButtonElement>;
    this.root = el("div", { class: "hud-system" }, this.plate.root);
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

export function wheelFrame(scrollTop: number, frames: number): number {
  return Math.floor(wheelTurn(Math.max(0, scrollTop)) * frames) % frames;
}

const RADIO_LAYOUT = { width: 1279, height: 695, boxes: {} };

export interface DashRow {
  drive: number;
  weapons: number;
  radio: number;
  tray: number;
  gap: number;
}

export interface DashFit {
  zoom: number;
  gap: number;
}

export function dashFit(layer: { width: number; height: number }, row: DashRow): DashFit {
  const width = row.drive + row.weapons + row.radio;
  const tall = (row.radio * RADIO_LAYOUT.height) / RADIO_LAYOUT.width + row.tray;
  const zoom = Math.min(1, layer.width / width, (layer.height - 2 * row.gap) / tall);
  const gap = Math.max(0, Math.min(row.gap, (layer.width - width * zoom) / 2));
  return { zoom, gap };
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

const KNOB_MARK_REACH = 36;

export class RadioDeck {
  readonly root: HTMLElement;
  readonly talk = el("div", { class: "deck-talk" });
  readonly log = el("div", { class: "deck-log" });
  private readonly plate = new BakedPart("radio", BAKED.radio, "radio-plate", RADIO_LAYOUT);
  private readonly wheel = el("span", { class: "deck-wheel", role: "scrollbar", "aria-orientation": "vertical" });
  private readonly wheelFrames = this.plate.sprite("wheel", "wheel-0");
  private readonly knobFrames = this.plate.sprite("knob", "knob-1");
  private readonly playFrames = this.plate.sprite("play", "play-up");
  private mode: "play" | "auto" = "play";
  private readonly lcdDay = el("span", { class: "lcd-digits lcd-day" });
  private readonly lcdHour = el("span", { class: "lcd-digits lcd-hour" });
  private readonly lcdMinute = el("span", { class: "lcd-digits lcd-minute" });
  private readonly lcd: HTMLElement;
  private readonly knob: HTMLButtonElement;
  private readonly marks: HTMLButtonElement[];
  private readonly turn: HTMLButtonElement;
  private scroller: HTMLElement | null = null;
  private held = false;
  private index = 0;

  constructor(private readonly setup: DeckSetup) {
    this.plate.zone(this.talk, "talk");
    this.plate.zone(this.log, "log");
    this.plate.zone(this.wheel, "wheel");
    this.lcd = this.plate.zone(el("div", { class: "deck-lcd", role: "timer" }, el("span", { class: "lcd-word" }, setup.dayWord), this.lcdDay, el("span", { class: "lcd-time" }, this.lcdHour, this.lcdMinute)), "lcd");
    this.marks = TIME_SPEEDS.map((speed, i) => {
      const mark = el("button", { type: "button", class: "knob-mark", style: this.markStyle(i) }, setup.speedLabel(speed)) as HTMLButtonElement;
      mark.addEventListener("click", () => this.pick(i));
      return mark;
    });
    this.plate.zone(el("div", { class: "knob-marks" }, ...this.marks), "knobMarks");
    this.knob = this.plate.zone(el("button", { type: "button", class: "knob-key" }) as HTMLButtonElement, "knob");
    this.knob.addEventListener("click", () => this.pick((this.index + 1) % TIME_SPEEDS.length));
    this.turn = this.plate.zone(plateKey("baked-key play-key", setup.turnLabel, () => undefined), "play");
    this.turn.addEventListener("pointerdown", (e) => this.press(e));
    this.turn.addEventListener("pointerup", () => this.release());
    this.turn.addEventListener("pointercancel", () => this.release());
    this.wheel.addEventListener("pointerdown", (e) => this.dragWheel(e));
    this.root = el("div", { class: "hud-radio" }, deviceCast(), this.plate.root);
    new ResizeObserver(([entry]) => shareRadioScale(entry.contentRect.width)).observe(this.plate.root);
  }

  bindLog(scroller: HTMLElement): void {
    this.scroller = scroller;
    scroller.addEventListener("scroll", () => this.wheelFrames.show(`wheel-${wheelFrame(scroller.scrollTop, this.wheelFrames.count())}`));
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
    this.knobFrames.show(`knob-${view.speed.index}`);
    this.marks.forEach((mark, i) => setFlag(mark, "on", i === view.speed.index));
    showControl(this.knob, { title: view.speed.title, reason: view.speed.reason });
    setFlag(this.knob, "running", view.speed.running);
    setAttrText(this.turn, "title", view.turn.title);
    setAttrText(this.turn, "aria-label", view.turn.label);
    setData(this.turn, "mode", view.turn.auto ? "auto" : "turn");
    this.mode = view.turn.auto ? "auto" : "play";
    this.showPlay();
    if (view.turn.disabled) this.turn.setAttribute("aria-disabled", "true");
    else this.turn.removeAttribute("aria-disabled");
    setFlag(this.plate.root, "off-air", view.offAir);
  }

  private showPlay(): void {
    this.playFrames.show(`${this.mode}-${this.held ? "down" : "up"}`);
  }

  private markStyle(i: number): string {
    const angle = (knobAngle(i, TIME_SPEEDS.length) * Math.PI) / 180;
    const side = Math.sin(angle) < 0 ? -100 : 0;
    return `left:${(50 + KNOB_MARK_REACH * Math.sin(angle)).toFixed(1)}%;top:${(50 - KNOB_MARK_REACH * Math.cos(angle)).toFixed(1)}%;translate:${side}% -50%`;
  }

  private pick(index: number): void {
    if (isOff(this.knob) || index === this.index) return;
    this.setup.onSpeed(index);
  }

  private press(e: PointerEvent): void {
    if (e.button !== 0 || isOff(this.turn) || this.held) return;
    this.held = true;
    this.showPlay();
    this.turn.setPointerCapture(e.pointerId);
    this.setup.onTurnPress();
  }

  private release(): void {
    if (!this.held) return;
    this.held = false;
    this.showPlay();
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
