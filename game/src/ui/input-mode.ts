import { concat, SPACE, t, verbatim, type Msg } from "../text/msg";
import { el } from "./dom";
import { padGlyphFor } from "./pad/pad-model";
import { type Extent, type UiSize } from "./ui-size";

export interface InputMode {
  touch: boolean;
  pad: boolean;
  slim: boolean;
  narrow: boolean;
  tight: boolean;
  compact: boolean;
}

export const SLIM_MAX_WIDTH = 480;
export const NARROW_MAX_WIDTH = 720;
export const TIGHT_MAX_WIDTH = 880;
export const COMPACT_MAX_WIDTH = 1100;
export const COARSE_QUERY = "(pointer: coarse)";

export function inputModeOf(coarse: boolean, layer: Extent): Omit<InputMode, "pad"> {
  return {
    touch: coarse,
    slim: layer.width <= SLIM_MAX_WIDTH,
    narrow: layer.width <= NARROW_MAX_WIDTH,
    tight: layer.width <= TIGHT_MAX_WIDTH,
    compact: layer.width <= COMPACT_MAX_WIDTH,
  };
}

const NONE: InputMode = { touch: false, pad: false, slim: false, narrow: false, tight: false, compact: false };
let shown: InputMode = NONE;
let padOn = false;
let reapply: () => void = () => undefined;
const listeners = new Set<(mode: InputMode) => void>();

export function subscribeInputMode(fn: (mode: InputMode) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function mark(root: HTMLElement, mode: InputMode): void {
  root.classList.toggle("touch", mode.touch);
  root.classList.toggle("pad", mode.pad);
  root.classList.toggle("slim", mode.slim);
  root.classList.toggle("narrow", mode.narrow);
  root.classList.toggle("tight", mode.tight);
  root.classList.toggle("compact", mode.compact);
  shown = mode;
}

export function watchInputMode(roots: HTMLElement[], size: UiSize): InputMode {
  const coarse = window.matchMedia(COARSE_QUERY);
  const current = (): InputMode => {
    const layer = size.layerSize();
    const mode = layer.width > 0 && layer.height > 0 ? inputModeOf(coarse.matches, layer) : shown;
    return { ...mode, pad: padOn };
  };
  const apply = (): void => {
    for (const root of roots) mark(root, current());
    document.documentElement.classList.toggle("pad", padOn);
    for (const fn of listeners) fn(shown);
  };
  reapply = apply;
  coarse.addEventListener("change", apply);
  size.subscribe(apply);
  for (const root of roots) mark(root, current());
  return shown;
}

export function touchMode(): boolean {
  return shown.touch;
}

export function padMode(): boolean {
  return shown.pad;
}

export function setPadMode(on: boolean): void {
  if (padOn === on) return;
  padOn = on;
  reapply();
}

export function narrowMode(): boolean {
  return shown.narrow;
}

export const ESCAPE = { key: "Esc" };
export const RECENTER_KEY = "F";

function shownKey(key: string): string | null {
  if (shown.pad) return padGlyphFor(key);
  return touchMode() ? null : key;
}

export function keyLabel(text: Msg, key: string, place: "after" | "before" = "after"): Msg {
  const named = shownKey(key);
  if (named === null) return text;
  const cap = t("ui.key", { key: named });
  return concat(place === "after" ? [text, SPACE, cap] : [cap, SPACE, text]);
}

export function keyTip(text: Msg, key: string): Msg {
  return keyLabel(text, key, "before");
}

export function keyCap(key: string): HTMLElement | null {
  const named = shownKey(key);
  if (named === null) return null;
  return el("kbd", { class: shown.pad ? "key pad-glyph" : "key" }, verbatim(named));
}
