
import { MIX, type Bus } from "../data/sounds";
import type { Mixer } from "../audio/mixer";
import { bindAttr, setText } from "../text/language";
import { t, type Msg } from "../text/msg";
import { el } from "./dom";
import { createSwitch } from "./switch";

const KEY = "roam-sound";
const BUSES: Bus[] = ["music", "sfx", "ambient", "ui"];
const LABEL: Record<Bus, Msg> = { music: t("sound.music"), sfx: t("sound.sfx"), ambient: t("sound.ambient"), ui: t("sound.ui") };

type Settings = { muted: boolean; volume: Record<Bus, number> };

function defaults(): Settings {
  return { muted: false, volume: { ...MIX.busVolume } };
}

export function parseSettings(raw: string | null): Settings {
  if (raw === null) return defaults();
  const s = JSON.parse(raw);
  const ok = typeof s?.muted === "boolean" && BUSES.every((b) => typeof s.volume?.[b] === "number" && s.volume[b] >= 0 && s.volume[b] <= 1);
  if (!ok) throw new Error(`Stored sound settings are invalid: ${raw}`);
  return s;
}

const STEPS = 20;
const SWEEP = 135;
const DRAG_FULL_PX = 160;
const DRAG_DEAD_PX = 3;
const DRAG_STEPS = 100;

export function dragged(start: number, dx: number, dy: number): number {
  if (Math.abs(dx) + Math.abs(dy) < DRAG_DEAD_PX) return start;
  const value = Math.round((start + (dx - dy) / DRAG_FULL_PX) * DRAG_STEPS) / DRAG_STEPS;
  return Math.min(1, Math.max(0, value));
}

export function turned(value: number, steps: number): number {
  return Math.min(1, Math.max(0, Math.round(value * STEPS + steps) / STEPS));
}

export function knobAngle(value: number): number {
  return (value * 2 - 1) * SWEEP;
}

export function nextTrackKey(onclick: () => void): HTMLElement {
  const button = el("button", { class: "radio-next", title: t("sound.next"), "aria-label": t("sound.next"), onclick });
  button.innerHTML = `<svg viewBox="0 0 14 8" focusable="false"><path d="M0 0L5 4L0 8ZM5 0L10 4L5 8Z"/><rect x="10.5" width="1.6" height="8"/></svg>`;
  return button;
}

const KNOB_KEYS: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 };

export type SoundView = { root: HTMLElement; dispose(): void };

export class SoundSettings {
  private settings: Settings;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly mixer: Mixer, private readonly storage: Storage) {
    this.settings = parseSettings(storage.getItem(KEY));
    for (const b of BUSES) mixer.setBusVolume(b, this.settings.volume[b]);
    mixer.setMuted(this.settings.muted);
  }

  volume(bus: Bus): number {
    return this.settings.volume[bus];
  }

  muted(): boolean {
    return this.settings.muted;
  }

  setVolume(bus: Bus, value: number): void {
    if (value === this.settings.volume[bus]) return;
    this.settings.volume[bus] = value;
    this.mixer.setBusVolume(bus, value);
    this.changed();
  }

  toggleMute(): void {
    this.settings.muted = !this.settings.muted;
    this.mixer.setMuted(this.settings.muted);
    this.changed();
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private changed(): void {
    this.storage.setItem(KEY, JSON.stringify(this.settings));
    for (const listener of this.listeners) listener();
  }
}

function muteSwitch(settings: SoundSettings): SoundView {
  const root = el("div", { class: "sound-mute" });
  const draw = () => {
    const muted = settings.muted();
    root.replaceChildren(createSwitch({ on: t("sound.on"), off: t("sound.mute"), checked: !muted, title: muted ? t("sound.unmuteTitle") : t("sound.muteTitle"), onclick: () => settings.toggleMute() }));
  };
  draw();
  return { root, dispose: settings.onChange(draw) };
}

export function soundSection(settings: SoundSettings): SoundView {
  const mute = muteSwitch(settings);
  const knobs = BUSES.map((bus) => knobCell(settings, bus));
  const root = el("div", { class: "sound-row" }, ...knobs.map((k) => k.root), mute.root);
  return { root, dispose: () => [mute, ...knobs].forEach((v) => v.dispose()) };
}

function knobCell(settings: SoundSettings, bus: Bus): SoundView {
  const dial = el("div", { class: "knob-dial" }, el("span", { class: "knob-notch" }));
  const knob = el("div", { class: "knob", role: "slider", tabindex: 0, "aria-label": t("sound.volume", { bus: LABEL[bus] }), "aria-valuemin": 0, "aria-valuemax": 100 }, dial);
  const readout = el("span", { class: "knob-readout" });
  const cell = el("div", { class: "knob-cell" }, knob, el("span", { class: "knob-labels" }, el("span", { class: "knob-label" }, LABEL[bus]), readout));
  const draw = () => {
    const volume = settings.volume(bus);
    const percent = Math.round(volume * 100);
    knob.setAttribute("aria-valuenow", String(percent));
    bindAttr(knob, "aria-valuetext", t("sound.percent", { n: percent }));
    setText(readout, t("sound.percent", { n: percent }));
    knob.style.setProperty("--knob-angle", `${knobAngle(volume)}deg`);
  };
  bindDrag(cell, settings, bus);
  cell.addEventListener("wheel", (e) => {
    e.preventDefault();
    settings.setVolume(bus, turned(settings.volume(bus), -Math.sign(e.deltaY)));
  });
  knob.addEventListener("keydown", (e) => {
    const steps = KNOB_KEYS[e.code];
    if (steps === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    settings.setVolume(bus, turned(settings.volume(bus), steps));
  });
  draw();
  return { root: cell, dispose: settings.onChange(draw) };
}

function bindDrag(cell: HTMLElement, settings: SoundSettings, bus: Bus): void {
  let drag: { pointerId: number; x: number; y: number; value: number } | null = null;
  cell.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || drag) return;
    e.preventDefault();
    cell.setPointerCapture(e.pointerId);
    drag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, value: settings.volume(bus) };
    cell.classList.add("turning");
  });
  cell.addEventListener("pointermove", (e) => {
    if (drag?.pointerId === e.pointerId) settings.setVolume(bus, dragged(drag.value, e.clientX - drag.x, e.clientY - drag.y));
  });
  cell.addEventListener("lostpointercapture", (e) => {
    if (drag?.pointerId !== e.pointerId) return;
    drag = null;
    cell.classList.remove("turning");
  });
}
