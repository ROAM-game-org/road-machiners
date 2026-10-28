import { createIcon, type IconName } from "./cards";
import { el, type Child } from "./dom";
import type { Msg } from "../text/msg";

export type ChipOptions = {
  icon?: IconName;
  readout?: boolean;
  title?: Msg;
  label?: Msg;
  bad?: boolean;
  extra?: HTMLElement[];
  className?: string;
};

export function chipEl(value: Child, opts: ChipOptions = {}): HTMLElement {
  const classes = ["chip", opts.bad ? "bad" : "", opts.className ?? ""].filter(Boolean).join(" ");
  const attrs: Record<string, string | Msg> = { class: classes };
  if (opts.title) attrs.title = opts.title;
  if (opts.label) attrs["aria-label"] = opts.label;
  const shown = opts.readout && value !== null ? el("span", { class: "num" }, value) : value;
  return el("span", attrs, opts.icon ? createIcon(opts.icon) : null, shown, ...(opts.extra ?? []));
}
