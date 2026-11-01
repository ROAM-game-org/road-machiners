import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolve } from "../text/resolve";
import { t, verbatim } from "../text/msg";
import { OptionSwitch } from "./option-switch";

class FakeNode {
  attrs = new Map<string, string>();
  className = "";
  children: FakeNode[] = [];
  listeners = new Map<string, (() => void)[]>();
  constructor(readonly tag: string) {}
  append(...c: (FakeNode | string)[]) { for (const n of c) if (typeof n !== "string") this.children.push(n); }
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  removeAttribute(k: string) { this.attrs.delete(k); }
  addEventListener(type: string, fn: () => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  click() { for (const f of this.listeners.get("click") ?? []) f(); }
}

beforeEach(() => {
  vi.stubGlobal("document", { createElement: (tag: string) => new FakeNode(tag), createTextNode: () => new FakeNode("#text") });
});

function build(current: { value: number }, off: (value: number) => ReturnType<typeof t> | null, picks: number[]) {
  const subscribers = new Set<() => void>();
  const parent = new FakeNode("div");
  const switcher = new OptionSwitch<number>(parent as never, {
    label: verbatim("Size"),
    choices: [1, 2, 3].map((value) => ({ value, label: verbatim(String(value)) })),
    current: () => current.value,
    pick: (value) => picks.push(value),
    off,
    subscribe: (fn) => (subscribers.add(fn), () => subscribers.delete(fn)),
  });
  const buttons = (switcher.root as unknown as FakeNode).children;
  return { switcher, buttons, parent, subscribers };
}

describe("OptionSwitch", () => {
  it("marks the current value pressed and follows a change", () => {
    const current = { value: 2 };
    const { buttons, subscribers } = build(current, () => null, []);
    expect(buttons.map((b) => b.attrs.get("aria-pressed"))).toEqual(["false", "true", "false"]);
    current.value = 3;
    for (const fn of subscribers) fn();
    expect(buttons.map((b) => b.attrs.get("aria-pressed"))).toEqual(["false", "false", "true"]);
  });

  it("calls pick on a click of an on value", () => {
    const picks: number[] = [];
    const { buttons } = build({ value: 1 }, () => null, picks);
    buttons[2]!.click();
    expect(picks).toEqual([3]);
  });

  it("marks an off value aria-disabled with its reason and ignores its click", () => {
    const picks: number[] = [];
    const reason = t("options.uiSizeTooBig");
    const { buttons } = build({ value: 1 }, (value) => (value === 3 ? reason : null), picks);
    expect(buttons[2]!.attrs.get("aria-disabled")).toBe("true");
    expect(buttons[2]!.attrs.get("data-reason")).toBe(resolve(reason, "en"));
    expect(buttons[0]!.attrs.has("aria-disabled")).toBe(false);
    expect(buttons[0]!.attrs.has("data-reason")).toBe(false);
    buttons[2]!.click();
    expect(picks).toEqual([]);
  });

  it("stops following changes after dispose", () => {
    const { switcher, subscribers } = build({ value: 1 }, () => null, []);
    switcher.dispose();
    expect(subscribers.size).toBe(0);
  });
});
