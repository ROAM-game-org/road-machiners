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
  vi.stubGlobal("getComputedStyle", () => ({ borderLeftWidth: "0", borderRightWidth: "0" }));
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("performance", { now: () => 0 });
  vi.stubGlobal("window", { addEventListener: (type: string, fn: (e: unknown) => void) => type === "keydown" && keyHandlers.push(fn), innerWidth: 1280, innerHeight: 720 });
}

const line = (text: string, tags: string[] = []) => ({ text, tags });
const sceneOf = (lines: QuestLive["lines"], choices: string[] = [], lang: QuestLive["lang"] = "en", ink = "{}"): QuestLive => ({ quest: "bowl_hattie", lang, ink, lines, choices, costs: choices.map(() => null), checks: choices.map(() => null) });
const THREE_PAGES = sceneOf([line("a1"), line("a2", ["page"]), line("a3", ["page"])]);
const textOf = (node: FakeNode | string): string => (typeof node === "string" ? node : node.children.map(textOf).join(" "));

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
    const { screen, root, world } = build(() => { throw boom; });
    screen.render();
    const press = () => { for (const fn of keyHandlers) fn({ code: "Digit1", ctrlKey: false, metaKey: false, altKey: false, stopImmediatePropagation: () => {}, preventDefault: () => {} }); };
    expect(press).toThrow(boom);
    expect(world().player.quests.live).toBeNull();
    expect(root.style.display).toBe("none");
  });

  const space = () => { const seen = { stopped: false }; for (const fn of keyHandlers) fn({ code: "Space", ctrlKey: false, metaKey: false, altKey: false, stopImmediatePropagation: () => void (seen.stopped = true), preventDefault: () => {} }); return seen; };
  const digit = (code: string) => { for (const fn of keyHandlers) fn({ code, ctrlKey: false, metaKey: false, altKey: false, stopImmediatePropagation: () => {}, preventDefault: () => {} }); };
  const withLive = (live: QuestLive | null) => { const b = build(() => {}); const w = b.world(); w.player.quests.live = live; return b; };
  const setLive = (b: ReturnType<typeof build>, live: QuestLive | null) => { b.world().player.quests.live = live; };

  it("draws a scene the window has not drawn yet and acts on no press until it shows", () => {
    const b = withLive(THREE_PAGES);
    b.screen.render();
    const reading = b.screen as unknown as { page: number };
    reading.page = 2;
    setLive(b, null);
    b.screen.render();
    setLive(b, sceneOf([line("b1")]));
    expect(space).not.toThrow();
    expect(textOf(b.root)).toContain("b1");
    expect(reading.page).toBe(0);
    expect(b.world().player.quests.live?.lines[0].text).toBe("b1");
  });

  it("never picks a choice of a scene the player has not seen", () => {
    const b = withLive(THREE_PAGES);
    b.screen.render();
    setLive(b, null);
    b.screen.render();
    const offer = sceneOf([line("b1")], ["go"]);
    setLive(b, offer);
    digit("Digit1");
    expect(b.world().player.quests.live).toBe(offer);
    expect(textOf(b.root)).toContain("b1");
    setLive(b, null);
    b.screen.render();
    setLive(b, offer);
    expect(space().stopped).toBe(true);
    expect(b.world().player.quests.live).toBe(offer);
  });

  it("redraws a scene relanguaged with the same ink", () => {
    const b = withLive(sceneOf([line("hello"), line("more", ["page"])]));
    b.screen.render();
    const reading = b.screen as unknown as { page: number };
    reading.page = 1;
    setLive(b, sceneOf([line("privet")], [], "ru"));
    b.screen.render();
    expect(textOf(b.root)).toContain("privet");
    expect(reading.page).toBe(0);
  });

  it("refuses a click with no quest on view, hides the window and names the fault", () => {
    const { root, click, setWorld, world } = build(() => {});
    setWorld(leaveQuest(world()));
    expect(click).toThrow("The quest window took a click with no quest on view");
    expect(root.style.display).toBe("none");
  });
});
