import { afterEach, describe, expect, it, vi } from "vitest";
import { addState } from "../sim/states";
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
  offsetWidth = 400;
  offsetHeight = 300;
  clientHeight = 300;
  scrollTop = 0;
  parentElement: FakeNode | null = null;
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
  vi.stubGlobal("getComputedStyle", () => ({ overflowY: "visible", paddingBottom: "0px", getPropertyValue: () => "" }));
  vi.stubGlobal("window", { addEventListener: () => {}, matchMedia: () => ({ matches: false, addEventListener: () => {} }), innerWidth: 1280, innerHeight: 720 });
}

const SCENE: QuestLive = { quest: "bowl_hattie", lang: "en", ink: "{}", lines: [], choices: [], costs: [], checks: [] };

function screenOver(world: World): { screen: InventoryScreen; applied: World[] } {
  stubDom();
  const applied: World[] = [];
  const screen = new InventoryScreen({ world: () => world, apply: (next: World) => applied.push(next), announce: () => {}, searchStock: () => {}, getTurnPhase: () => null } as never);
  return { screen, applied };
}

describe("the inventory during a scene", () => {
  afterEach(() => {
    ui.children = [];
    vi.unstubAllGlobals();
  });

  it("turns every action of the card off with the scene reason, printed beside it", () => {
    const world = emptyWorld();
    addVehicle(world, "independent", "buggy", ["mg", "stockEngine"], { x: 5, y: 5 });
    world.player.quests.live = { quest: "bowl_hattie", lang: "en", ink: "{}", lines: [], choices: [], costs: [], checks: [] };
    const { screen } = screenOver(world);
    screen.toggle();
    const view = (screen as unknown as { view: { selectedItem: string; onChange(): void } }).view;
    const gun = world.vehicles[0].items.find((it) => it.kind === "part" && it.part.defId === "mg");
    if (!gun) throw new Error("The start truck has no gun");
    view.selectedItem = gun.id;
    view.onChange();
    const root = ui.children[ui.children.length - 1] as FakeNode;
    const rows = root.all((n) => n.className.split(" ").includes("action-rows"));
    const buttons = rows.flatMap((r) => r.all((n) => n.tag === "button"));
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.attrs.get("aria-disabled")).toBe("true");
      expect(button.attrs.get("data-reason")).toBe("Not during a scene");
    }
    expect(rows[0].all((n) => n.className === "cost off").length).toBe(buttons.length);
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

describe("the inventory looking another truck over", () => {
  afterEach(() => {
    ui.children = [];
    vi.unstubAllGlobals();
  });

  function lookScene() {
    const w = emptyWorld({ x: 30, y: 30 });
    const npc = addVehicle(w, "independent", "buggy", ["mg", "stockEngine"], { x: 34, y: 30 });
    addState(w, "sizedUp", w.player.vehicleId, npc.id, { kind: "none" });
    return { w, npc };
  }

  const rootOf = () => ui.children[ui.children.length - 1] as FakeNode;
  const targetOf = () => rootOf().all((n) => n.className.includes("inv-target"))[0];

  it("draws the truck's items and locks every control with the look-over reason", () => {
    const { w, npc } = lookScene();
    const { screen, applied } = screenOver(w);
    expect(screen.openLookedOver(w, npc.id)).toBe(true);
    expect(targetOf().all((n) => n.className.includes("item")).length).toBeGreaterThan(0);
    const view = (screen as unknown as { view: { selectedItem: string; onChange(): void } }).view;
    const gun = w.vehicles[0].items.find((it) => it.kind === "part" && it.part.defId === "mg");
    if (!gun) throw new Error("The start truck has no gun");
    view.selectedItem = gun.id;
    view.onChange();
    const rows = rootOf().all((n) => n.className.split(" ").includes("action-rows"));
    const buttons = rows.flatMap((r) => r.all((n) => n.tag === "button"));
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.attrs.get("aria-disabled")).toBe("true");
      expect(button.attrs.get("data-reason")).toBe("Not during a look-over");
    }
    expect(applied).toEqual([]);
  });

  it("throws if a command reaches the view", () => {
    const { w, npc } = lookScene();
    const { screen } = screenOver(w);
    screen.openLookedOver(w, npc.id);
    const view = (screen as unknown as { view: { run(cmd: (w: World) => World): void } }).view;
    expect(() => view.run((x) => x)).toThrow("Inventory command in look mode");
  });

  it("refuses a truck the player has not looked over", () => {
    const { w, npc } = lookScene();
    w.states = [];
    const { screen } = screenOver(w);
    expect(screen.openLookedOver(w, npc.id)).toBe(false);
    expect(screen.isOpen()).toBe(false);
  });

  it("says the truck got away once the look-over breaks", () => {
    const { w, npc } = lookScene();
    const { screen } = screenOver(w);
    screen.openLookedOver(w, npc.id);
    w.states = [];
    screen.render();
    const heads = targetOf().all((n) => n.tag === "h3");
    expect(JSON.stringify(heads)).toContain("got away");
  });

  it("puts the scene reason first", () => {
    const { w, npc } = lookScene();
    w.player.quests.live = { ...SCENE };
    const { screen } = screenOver(w);
    screen.openLookedOver(w, npc.id);
    const view = (screen as unknown as { view: { lookOnlyReason(): unknown } }).view;
    expect(JSON.stringify(view.lookOnlyReason())).toContain("look.inScene");
  });

  it("opens an editable inventory with the key after a look", () => {
    const { w, npc } = lookScene();
    const { screen } = screenOver(w);
    screen.openLookedOver(w, npc.id);
    screen.close();
    screen.toggle();
    const view = (screen as unknown as { view: { lookOnlyReason(): unknown } }).view;
    expect(view.lookOnlyReason()).toBeNull();
  });

  it("selects an item pressed in the target grid and never starts a drag or a touch place", () => {
    const { w, npc } = lookScene();
    const { screen, applied } = screenOver(w);
    screen.openLookedOver(w, npc.id);
    const view = (screen as unknown as {
      view: { selectedItem: string | null; startDrag(e: unknown, s: string, id: string, item: unknown, grab: unknown): void; beginGridTap(e: unknown): boolean; drag: unknown };
    }).view;
    const gun = npc.items.find((it) => it.kind === "part" && it.part.defId === "mg");
    if (!gun) throw new Error("The scout has no gun");
    view.startDrag({ button: 0, pointerType: "mouse" }, "truck", gun.id, gun, { x: 0, y: 0 });
    expect(view.selectedItem).toBe(gun.id);
    expect(view.drag).toBeNull();
    expect(view.beginGridTap({ pointerType: "touch", target: null })).toBe(false);
    expect(applied).toEqual([]);
  });
});
