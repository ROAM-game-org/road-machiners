import { afterEach, describe, expect, it, vi } from "vitest";
import { addVehicle, emptyWorld, spotWorld } from "../sim/testkit";
import type { QuestLive, World } from "../sim/types";
import { InventoryScreen } from "./inventory";

class FakeNode {
  className = "";
  innerHTML = "";
  style: Record<string, unknown> = { setProperty: () => {}, removeProperty: () => {} };
  dataset: Record<string, string> = {};
  children: (FakeNode | string)[] = [];
  attrs = new Map<string, string>();
  isConnected = true;
  clientWidth = 400;
  clientHeight = 300;
  classList = {
    add: (c: string) => void (this.className = `${this.className} ${c}`.trim()),
    remove: (c: string) => void (this.className = this.className.split(" ").filter((x) => x !== c).join(" ")),
    toggle: (c: string, on?: boolean) => {
      const has = this.className.split(" ").includes(c);
      const want = on ?? !has;
      if (want && !has) this.classList.add(c);
      if (!want && has) this.classList.remove(c);
      return want;
    },
    contains: (c: string) => this.className.split(" ").includes(c),
  };
  constructor(readonly tag: string) {}
  append(...c: (FakeNode | string)[]) { this.children.push(...c); }
  prepend(...c: (FakeNode | string)[]) { this.children.unshift(...c); }
  replaceChildren(...c: (FakeNode | string)[]) { this.children = c; }
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  getAttribute(k: string) { return this.attrs.get(k) ?? null; }
  removeAttribute(k: string) { this.attrs.delete(k); }
  addEventListener() {}
  closest() { return null; }
  contains() { return false; }
  querySelectorAll(sel: string) { return sel.startsWith(".") ? this.all((n) => n !== this && n.className.split(" ").includes(sel.slice(1))) : []; }
  querySelector(sel: string) { return this.querySelectorAll(sel)[0] ?? null; }
  remove() {}
  scrollIntoView() {}
  getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) }; }
  all(pred: (n: FakeNode) => boolean): FakeNode[] {
    const here = pred(this) ? [this] : [];
    return [...here, ...this.children.flatMap((c) => (typeof c === "string" ? [] : c.all(pred)))];
  }
}

const ui = new FakeNode("div");

function stubDom(): void {
  vi.stubGlobal("document", {
    createElement: (t: string) => new FakeNode(t),
    createElementNS: (_ns: string, t: string) => new FakeNode(t),
    createTextNode: (text: string) => Object.assign(new FakeNode("#text"), { children: [text] }),
    getElementById: () => ui,
    body: { insertAdjacentHTML: () => {} },
    querySelector: () => null,
  });
  vi.stubGlobal("window", { addEventListener: () => {}, matchMedia: () => ({ matches: false, addEventListener: () => {} }), innerWidth: 1280, innerHeight: 720 });
}

const SCENE: QuestLive = { quest: "bowl_hattie", lang: "en", ink: "{}", lines: [], choices: [], costs: [], checks: [] };

function screenOver(world: World): { screen: InventoryScreen; applied: World[] } {
  stubDom();
  const applied: World[] = [];
  const screen = new InventoryScreen({ world: () => world, apply: (next: World) => applied.push(next), announce: () => {}, searchStock: () => {} } as never);
  return { screen, applied };
}

function openInventory(world: World): FakeNode {
  screenOver(world).screen.toggle();
  return ui.children[ui.children.length - 1] as FakeNode;
}

describe("the inventory during a scene", () => {
  afterEach(() => {
    ui.children = [];
    vi.unstubAllGlobals();
  });

  it("turns Rotate off with the scene reason", () => {
    const world = emptyWorld();
    addVehicle(world, "independent", "buggy", ["mg", "stockEngine"], { x: 5, y: 5 });
    world.player.quests.live = { quest: "bowl_hattie", lang: "en", ink: "{}", lines: [], choices: [], costs: [], checks: [] };
    const root = openInventory(world);
    const rotate = root.all((n) => n.tag === "button" && n.className === "btn-s")[0];
    expect(rotate.attrs.get("aria-disabled")).toBe("true");
    expect(rotate.attrs.get("data-reason")).toBe("Not during a scene");
  });

  it("turns every world command of a loot screen off with the reason, and applies nothing on a click", () => {
    const { w, stock } = spotWorld();
    w.player.quests.live = { ...SCENE };
    const { screen, applied } = screenOver(w);
    screen.openLoot(stock.id);
    const loot = (ui.children[ui.children.length - 1] as FakeNode).all((n) => n.className.includes("inv-loot"))[0];
    const commands = loot.all((n) => n.tag === "button");
    expect(commands.length).toBeGreaterThan(0);
    for (const button of commands) {
      expect(button.attrs.get("aria-disabled")).toBe("true");
      expect(button.attrs.get("data-reason")).toBe("Not during a scene");
    }
    expect(applied).toEqual([]);
  });

  it("works again once the scene ends", () => {
    const { w, stock } = spotWorld();
    const { screen } = screenOver(w);
    screen.openLoot(stock.id);
    const loot = (ui.children[ui.children.length - 1] as FakeNode).all((n) => n.className.includes("inv-loot"))[0];
    const takeAll = loot.all((n) => n.tag === "button").filter((b) => !b.attrs.has("aria-disabled"));
    expect(takeAll.length).toBeGreaterThan(0);
  });

  it("throws if a command reaches the view during a scene", () => {
    const world = emptyWorld();
    world.player.quests.live = { ...SCENE };
    const { screen } = screenOver(world);
    const view = (screen as unknown as { view: { run(cmd: (w: World) => World): void } }).view;
    expect(() => view.run((w) => w)).toThrow("Inventory command in look mode");
  });
});

describe("the inventory while knocked out", () => {
  afterEach(() => {
    ui.children = [];
    vi.unstubAllGlobals();
  });

  it("turns every world command of a loot screen off with Knocked out, and works after the wake", () => {
    const { w, stock } = spotWorld();
    w.player.state = "knockedOut";
    const { screen, applied } = screenOver(w);
    screen.openLoot(stock.id);
    const loot = (ui.children[ui.children.length - 1] as FakeNode).all((n) => n.className.includes("inv-loot"))[0];
    const commands = loot.all((n) => n.tag === "button");
    expect(commands.length).toBeGreaterThan(0);
    for (const button of commands) {
      expect(button.attrs.get("aria-disabled")).toBe("true");
      expect(button.attrs.get("data-reason")).toBe("Knocked out");
    }
    expect(applied).toEqual([]);

    w.player.state = "active";
    screen.openLoot(stock.id);
    const woke = (ui.children[ui.children.length - 1] as FakeNode).all((n) => n.className.includes("inv-loot"))[0];
    expect(woke.all((n) => n.tag === "button").filter((b) => !b.attrs.has("aria-disabled")).length).toBeGreaterThan(0);
  });

  it("throws if a command reaches the view while knocked out", () => {
    const world = emptyWorld();
    world.player.state = "knockedOut";
    const { screen } = screenOver(world);
    const view = (screen as unknown as { view: { run(cmd: (w: World) => World): void } }).view;
    expect(() => view.run((w) => w)).toThrow("Inventory command in look mode");
  });
});
