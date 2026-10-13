import { t, type Msg } from "../text/msg";

export interface InputMode {
  touch: boolean;
  phone: boolean;
}

export const PHONE_MAX = { width: 560, height: 480 };
export const COARSE_QUERY = "(pointer: coarse)";

export function phoneQuery(max: typeof PHONE_MAX): string {
  return `(max-width: ${max.width}px), (max-height: ${max.height}px)`;
}

export function inputModeOf(matches: (query: string) => boolean): InputMode {
  return { touch: matches(COARSE_QUERY), phone: matches(phoneQuery(PHONE_MAX)) };
}

let shown: InputMode = { touch: false, phone: false };

export function watchInputMode(root: HTMLElement, onChange: (mode: InputMode) => void): InputMode {
  const coarse = window.matchMedia(COARSE_QUERY);
  const small = window.matchMedia(phoneQuery(PHONE_MAX));
  const current = (): InputMode => ({ touch: coarse.matches, phone: small.matches });
  const apply = (): void => {
    const mode = current();
    root.classList.toggle("touch", mode.touch);
    root.classList.toggle("phone", mode.phone);
    shown = mode;
    onChange(mode);
  };
  coarse.addEventListener("change", apply);
  small.addEventListener("change", apply);
  const first = current();
  root.classList.toggle("touch", first.touch);
  root.classList.toggle("phone", first.phone);
  shown = first;
  return first;
}

export function touchMode(): boolean {
  return shown.touch;
}

export function phoneMode(): boolean {
  return shown.phone;
}

export function closeLabel(): Msg {
  return touchMode() ? t("menu.close") : t("menu.closeEsc");
}
