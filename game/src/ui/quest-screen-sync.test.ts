import { afterEach, describe, expect, it, vi } from "vitest";
import { leaveQuest } from "../sim/quests";
import { emptyWorld } from "../sim/testkit";
import type { QuestLive, World } from "../sim/types";
import { QuestScreen } from "./quest-screen";

class FakeNode {
  className = "";
  innerHTML = "";
  style: Record<string, unknown> = { setProperty: () => {} };
  dataset: Record<string, string> = {};
  children: (FakeNode | string)[] = [];
  listeners = new Map<string, ((e: unknown) => void)[]>();
  classList = {
    add: (c: string) => void (this.className = `${this.className} ${c}`.trim()),
    remove: (c: string) => void (this.className = this.className.split(" ").filter((x) => x !== c).join(" ")),
    toggle: () => false,
    contains: (c: string) => this.className.split(" ").includes(c),
  };
  constructor(readonly tag: string) {}
  append(...c: (FakeNode | string)[]) { this.children.push(...c); }
  replaceChildren(...c: (FakeNode | string)[]) { this.children = c; }
  setAttribute() {}
  addEventListener(type: string, fn: (e: unknown) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  querySelector() { return null; }
}

const keyHandlers: ((e: unknown) => void)[] = [];
const roots: FakeNode[] = [];

function stubDom(): void {
  vi.stubGlobal("HTMLElement", FakeNode);
  vi.stubGlobal("document", {
    createElement: (t: string) => {
      const node = new FakeNode(t);
      roots.push(node);
      return node;
    },
    createElementNS: (_ns: string, t: string) => new FakeNode(t),
    createTextNode: (text: string) => Object.assign(new FakeNode("#text"), { children: [text] }),
    getElementById: () => new FakeNode("div"),
  });
  vi.stubGlobal("window", { addEventListener: (type: string, fn: (e: unknown) => void) => type === "keydown" && keyHandlers.push(fn), innerWidth: 1280, innerHeight: 720 });
}

const ENDED: QuestLive = { quest: "bowl_hattie", lang: "en", ink: "{}", lines: [], choices: [], costs: [], checks: [] };

function build(announce: (next: World) => void) {
  stubDom();
  keyHandlers.length = 0;
  roots.length = 0;
  let world = emptyWorld();
  world.player.quests.live = { ...ENDED };
  const host = { world: () => world, apply: () => {}, announce: (next: World) => { world = next; announce(next); }, runKey: () => {} };
  const screen = new QuestScreen(host as never, () => false, () => null);
  const root = roots.find((n) => n.className.includes("quest-screen"))!;
  const click = () => {
    const event = { target: new FakeNode("div"), stopImmediatePropagation: vi.fn() };
    for (const fn of root.listeners.get("click") ?? []) fn(event);
  };
  return { screen, root, click, setWorld: (w: World) => (world = w), world: () => world };
}

describe("quest window and the world", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lets a failing commit propagate and hides the window", () => {
    const boom = new Error("refresh broke");
    const { root, world } = build(() => { throw boom; });
    const press = () => { for (const fn of keyHandlers) fn({ code: "Digit1", ctrlKey: false, metaKey: false, altKey: false, stopImmediatePropagation: () => {}, preventDefault: () => {} }); };
    expect(press).toThrow(boom);
    expect(world().player.quests.live).toBeNull();
    expect(root.style.display).toBe("none");
  });

  it("refuses a click with no quest on view, hides the window and names the fault", () => {
    const { root, click, setWorld, world } = build(() => {});
    setWorld(leaveQuest(world()));
    expect(click).toThrow("The quest window took a click with no quest on view");
    expect(root.style.display).toBe("none");
  });
});
