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
    el("span", { class: "switch-option" }, o.checked ? o.on : o.off),
    switchHandle(o),
    o.key ? keyCorner(o.key) : null,
  );
}

function switchHandle(o: SwitchOptions): HTMLElement {
  return o.locked ? createIcon("lock") : switchLever(o.checked);
}

function switchLever(up: boolean): HTMLElement {
  return el("span", { class: up ? "switch-lever up" : "switch-lever down" }, el("span", { class: "switch-nut" }), el("span", { class: "switch-bat" }));
}
