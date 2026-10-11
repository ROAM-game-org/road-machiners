import { afterEach, describe, expect, it, vi } from "vitest";
import type { BootRequest, SlotId } from "../three/save-slots";
import { isNewGameOpen } from "./new-game";
import { chooseStart } from "./save-screen";

class FakeNode {
  attrs: Record<string, string> = {};
  className = "";
  children: (FakeNode | string)[] = [];
  listeners = new Map<string, ((e: unknown) => void)[]>();
  parent: FakeNode | null = null;
  focused = 0;
  constructor(readonly tag: string) {}
  get textContent(): string { return this.children.map((c) => (typeof c === "string" ? c : c.textContent)).join(""); }
  set textContent(text: string) { this.children = [text]; }
  append(...c: (FakeNode | string)[]) { for (const n of c) if (typeof n !== "string") n.parent = this; this.children.push(...c); }
  replaceChildren(...c: (FakeNode | string)[]) { this.children = []; this.append(...c); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  addEventListener(type: string, fn: (e: unknown) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  removeEventListener(type: string, fn: (e: unknown) => void) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== fn)); }
  focus() { this.focused++; }
  fire(type: string) { for (const f of this.listeners.get(type) ?? []) f({ stopPropagation: () => {} }); }
  all(pred: (n: FakeNode) => boolean): FakeNode[] {
    return [...(pred(this) ? [this] : []), ...this.children.flatMap((c) => (typeof c === "string" ? [] : c.all(pred)))];
  }
  byClass(name: string): FakeNode[] { return this.all((n) => n.className.split(" ").includes(name)); }
  button(text: string): FakeNode {
    const found = this.all((n) => n.tag === "button" && n.textContent === text)[0];
    if (!found) throw new Error(`No ${text} button`);
    return found;
  }
}

function open(newest: SlotId | null) {
  const ui = new FakeNode("div");
  const opener = new FakeNode("button");
  vi.stubGlobal("document", { createElement: (t: string) => new FakeNode(t), createTextNode: (text: string) => Object.assign(new FakeNode("#text"), { children: [text] }), getElementById: () => ui, activeElement: opener });
  vi.stubGlobal("window", Object.assign(new FakeNode("window"), { localStorage: { getItem: () => null, setItem: vi.fn() } }));
  const requests: BootRequest[] = [];
  const actions = { requestBoot: (r: BootRequest) => requests.push(r), reload: vi.fn(), confirm: vi.fn(() => true) };
  const chosen = vi.fn();
  void chooseStart(newest, actions).then(chosen);
  const menu = ui.byClass("start-menu")[0];
  return { ui, menu, requests, actions, chosen };
}

describe("the start menu", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the title, Continue, New game and Options", () => {
    const { menu } = open("auto");

    expect(menu.all((n) => n.tag === "h1")[0].textContent).toBe("Road Machiners");
    expect(menu.all((n) => n.tag === "button").map((b) => b.textContent)).toEqual(["Continue", "New game", "Options"]);
  });

  it("continues the newest save and closes, with focus on Continue", async () => {
    const { ui, menu, chosen } = open("slot2");
    expect(menu.button("Continue").focused).toBe(1);

    menu.button("Continue").fire("click");
    await Promise.resolve();

    expect(chosen).toHaveBeenCalledWith("slot2");
    expect(ui.byClass("start-menu")).toEqual([]);
  });

  it("turns Continue off with no save, and puts focus on New game", async () => {
    const { menu, chosen } = open(null);
    const continueButton = menu.button("Continue");

    expect(continueButton.attrs["aria-disabled"]).toBe("true");
    expect(menu.button("New game").focused).toBe(1);
    continueButton.fire("click");
    await Promise.resolve();
    expect(chosen).not.toHaveBeenCalled();
  });

  it("opens the New game screen and stays open under it", () => {
    const { ui, menu, chosen } = open("auto");

    menu.button("New game").fire("click");

    expect(isNewGameOpen()).toBe(true);
    expect(ui.byClass("start-menu")).toHaveLength(1);
    expect(chosen).not.toHaveBeenCalled();
    ui.byClass("new-game")[0].button("Back").fire("click");
  });
});
