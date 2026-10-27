import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbackForm } from "./feedback-form";
import { HelpPanel } from "./game-menu";
import { defaultSetup } from "../sim/settings";

type Listener = { fn: (e: unknown) => void; capture: boolean };

class FakeNode {
  className = "";
  innerHTML = "";
  style: Record<string, unknown> = { setProperty: () => {} };
  dataset: Record<string, string> = {};
  children: unknown[] = [];
  classList = { add: () => {}, remove: () => {}, toggle: () => false, contains: () => false };
  constructor(readonly tag: string) {}
  append(...c: unknown[]) { this.children.push(...c); }
  replaceChildren(...c: unknown[]) { this.children = c; }
  setAttribute() {}
  removeAttribute() {}
  addEventListener() {}
  removeEventListener() {}
  remove() {}
  querySelector() { return null; }
}

const listeners: Listener[] = [];

function stubDom(): void {
  vi.stubGlobal("document", {
    createElement: (t: string) => new FakeNode(t),
    createElementNS: (_ns: string, t: string) => new FakeNode(t),
    createTextNode: (text: string) => Object.assign(new FakeNode("#text"), { children: [text] }),
    getElementById: () => new FakeNode("div"),
    documentElement: new FakeNode("html"),
  });
  listeners.length = 0;
  vi.stubGlobal("window", {
    innerWidth: 1280,
    innerHeight: 720,
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    addEventListener: (type: string, fn: Listener["fn"], capture?: boolean) => type === "keydown" && listeners.push({ fn, capture: capture === true }),
    removeEventListener: (type: string, fn: Listener["fn"], capture?: boolean) => {
      const at = listeners.findIndex((l) => l.fn === fn && l.capture === (capture === true));
      if (type === "keydown" && at >= 0) listeners.splice(at, 1);
    },
  });
}

function pressEscape(): { reachedBubble: boolean } {
  const seen = { reachedBubble: false };
  let stopped = false;
  const event = { code: "Escape", stopPropagation: () => void (stopped = true) };
  for (const l of listeners.filter((x) => x.capture)) l.fn(event);
  if (!stopped) for (const l of listeners.filter((x) => !x.capture)) (seen.reachedBubble = true), l.fn(event);
  return seen;
}

describe("Escape in a Menu panel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("closes the help panel and stops before the game's Escape", () => {
    stubDom();
    const help = new HelpPanel(() => defaultSetup("roaming"));
    help.open();
    listeners.push({ fn: () => {}, capture: false });
    expect(help.isOpen()).toBe(true);
    expect(pressEscape().reachedBubble).toBe(false);
    expect(help.isOpen()).toBe(false);
  });

  it("closes the report form and stops before the game's Escape", () => {
    stubDom();
    const form = new FeedbackForm(new FakeNode("div") as never, null, vi.fn(), "", {} as never);
    form.open("bug");
    listeners.push({ fn: () => {}, capture: false });
    expect(form.isOpen()).toBe(true);
    expect(pressEscape().reachedBubble).toBe(false);
    expect(form.isOpen()).toBe(false);
  });
});
