import { bindAttr, unbindAttr } from "../text/language";
import type { Msg } from "../text/msg";
import { el } from "./dom";

export interface SwitchChoice<T> {
  value: T;
  label: Msg;
  lang?: string;
  hook?: string;
}

export interface SwitchSpec<T> {
  label: Msg;
  choices: SwitchChoice<T>[];
  current: () => T;
  pick: (value: T) => void;
  off: (value: T) => Msg | null;
  subscribe: (fn: () => void) => () => void;
  rootClass?: string;
  buttonClass?: string;
  dataKey?: string;
}

export class OptionSwitch<T> {
  readonly root: HTMLElement;
  private readonly buttons: Map<T, HTMLElement>;
  readonly dispose: () => void;

  constructor(parent: HTMLElement, private readonly spec: SwitchSpec<T>) {
    this.buttons = new Map(spec.choices.map((choice) => [choice.value, this.button(choice)]));
    this.root = el("div", { class: `option-switch ${spec.rootClass ?? ""}`.trim(), role: "group" }, ...this.buttons.values());
    bindAttr(this.root, "aria-label", spec.label);
    parent.append(this.root);
    this.mark();
    this.dispose = spec.subscribe(() => this.mark());
  }

  mark(): void {
    const current = this.spec.current();
    for (const [value, button] of this.buttons) {
      button.setAttribute("aria-pressed", String(value === current));
      const reason = this.spec.off(value);
      if (reason === null) {
        button.removeAttribute("aria-disabled");
        unbindAttr(button, "data-reason");
      } else {
        button.setAttribute("aria-disabled", "true");
        bindAttr(button, "data-reason", reason);
      }
    }
  }

  private button(choice: SwitchChoice<T>): HTMLElement {
    const attrs: Record<string, string | ((e: Event) => void)> = { onclick: () => this.choose(choice.value) };
    if (this.spec.buttonClass !== undefined) attrs.class = this.spec.buttonClass;
    if (choice.lang !== undefined) attrs.lang = choice.lang;
    if (choice.hook !== undefined && this.spec.dataKey !== undefined) attrs[`data-${this.spec.dataKey}`] = choice.hook;
    return el("button", attrs, choice.label);
  }

  private choose(value: T): void {
    if (this.spec.off(value) !== null) return;
    this.spec.pick(value);
  }
}
