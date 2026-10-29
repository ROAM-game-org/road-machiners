import { t, type Msg } from "../text/msg";
import { createIcon } from "./cards";
import { el } from "./dom";
import { keyLabel } from "./input-mode";

export interface SwitchOptions {
  on: Msg;
  off: Msg;
  checked: boolean;
  key?: string;
  title: Msg;
  reason?: Msg | null;
  locked?: boolean;
  onclick: () => void;
}

export function keyCorner(key: string): HTMLElement {
  return el("kbd", { class: "key-corner" }, t("ui.key", { key }));
}

export function createSwitch(o: SwitchOptions): HTMLElement {
  const reason = o.reason ?? null;
  return el(
    "button",
    {
      class: "switch",
      role: "switch",
      "aria-checked": String(o.checked),
      "aria-disabled": reason === null ? undefined : "true",
      title: reason ?? (o.key ? keyLabel(o.title, o.key) : o.title),
      onclick: () => reason === null && o.onclick(),
    },
    stackedLabel([o.on, o.off], o.checked ? 0 : 1, "switch-option"),
    switchHandle(o),
    o.key ? keyCorner(o.key) : null,
  );
}

export function stackedLabel(variants: Msg[], shown: number, className?: string): HTMLElement {
  return el(
    "span",
    { class: className ? `label-stack ${className}` : "label-stack" },
    ...variants.map((variant, i) => (i === shown ? el("span", {}, variant) : el("span", { class: "label-reserve", "aria-hidden": "true" }, variant))),
  );
}

export function lockSlot(locked: boolean): HTMLElement {
  return el("span", { class: locked ? "lock-slot" : "lock-slot label-reserve", "aria-hidden": locked ? undefined : "true" }, createIcon("lock"));
}

function switchHandle(o: SwitchOptions): HTMLElement {
  return el("span", { class: "switch-handle" }, o.locked ? createIcon("lock") : switchLever(o.checked ? "up" : "down"));
}

function switchLever(position: "up" | "down"): HTMLElement {
  return el("span", { class: `switch-lever ${position}` }, el("span", { class: "switch-nut" }), el("span", { class: "switch-bat" }));
}
