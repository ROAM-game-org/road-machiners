import { concat, SPACE, t, type Msg } from "../text/msg";
import { type Extent, type UiSize } from "./ui-size";

export interface InputMode {
  touch: boolean;
  phone: boolean;
  slim: boolean;
  narrow: boolean;
  compact: boolean;
}

export const PHONE_MAX = { width: 560, height: 480 };
export const SLIM_MAX_WIDTH = 480;
export const NARROW_MAX_WIDTH = 720;
export const COMPACT_MAX_WIDTH = 1100;
export const COARSE_QUERY = "(pointer: coarse)";

export function inputModeOf(coarse: boolean, layer: Extent): InputMode {
  return {
    touch: coarse,
    phone: layer.width <= PHONE_MAX.width || layer.height <= PHONE_MAX.height,
    slim: layer.width <= SLIM_MAX_WIDTH,
    narrow: layer.width <= NARROW_MAX_WIDTH,
    compact: layer.width <= COMPACT_MAX_WIDTH,
  };
}

const NONE: InputMode = { touch: false, phone: false, slim: false, narrow: false, compact: false };
let shown: InputMode = NONE;
const listeners = new Set<(mode: InputMode) => void>();

export function subscribeInputMode(fn: (mode: InputMode) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function mark(root: HTMLElement, mode: InputMode): void {
  root.classList.toggle("touch", mode.touch);
  root.classList.toggle("phone", mode.phone);
  root.classList.toggle("slim", mode.slim);
  root.classList.toggle("narrow", mode.narrow);
  root.classList.toggle("compact", mode.compact);
  shown = mode;
}

export function watchInputMode(roots: HTMLElement[], size: UiSize): InputMode {
  const coarse = window.matchMedia(COARSE_QUERY);
  const current = (): InputMode => {
    const layer = size.layerSize();
    return layer.width > 0 && layer.height > 0 ? inputModeOf(coarse.matches, layer) : shown;
  };
  const apply = (): void => {
    for (const root of roots) mark(root, current());
    for (const fn of listeners) fn(shown);
  };
  coarse.addEventListener("change", apply);
  size.subscribe(apply);
  for (const root of roots) mark(root, current());
  return shown;
}

export function touchMode(): boolean {
  return shown.touch;
}

export function phoneMode(): boolean {
  return shown.phone;
}

export const ESCAPE = { key: "Esc" };
export const RECENTER_KEY = "F";

export function keyLabel(text: Msg, key: string, place: "after" | "before" = "after"): Msg {
  if (touchMode()) return text;
  const cap = t("ui.key", { key });
  return concat(place === "after" ? [text, SPACE, cap] : [cap, SPACE, text]);
}

export function closeLabel(): Msg {
  return touchMode() ? t("menu.close") : t("menu.closeEsc");
}
