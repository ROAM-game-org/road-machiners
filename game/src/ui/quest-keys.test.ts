import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyWorld } from "../sim/testkit";
import type { QuestLive, World } from "../sim/types";
import { QuestScreen } from "./quest-screen";

class FakeNode {
  className = "";
  innerHTML = "";
  style: Record<string, unknown> = { setProperty: () => {} };
  dataset: Record<string, string> = {};
  children: (FakeNode | string)[] = [];
  attrs = new Map<string, string>();
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
  replaceChildren(...c: (FakeNode | string)[]) { this.children = c; }
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  addEventListener() {}
  querySelector() { return null; }
}

type KeyHandler = (e: unknown) => void;
const handlers: KeyHandler[] = [];

function stubDom(): void {
  vi.stubGlobal("document", {
    createElement: (t: string) => new FakeNode(t),
    createElementNS: (_ns: string, t: string) => new FakeNode(t),
    createTextNode: (text: string) => Object.assign(new FakeNode("#text"), { children: [text] }),
    getElementById: () => new FakeNode("div"),
  });
  vi.stubGlobal("window", { addEventListener: (type: string, fn: KeyHandler) => type === "keydown" && handlers.push(fn), innerWidth: 1280, innerHeight: 720 });
}

function press(code: string): { stopped: boolean } {
  const seen = { stopped: false };
  const event = { code, ctrlKey: false, metaKey: false, altKey: false, stopImmediatePropagation: () => void (seen.stopped = true), preventDefault: () => {} };
  for (const handler of handlers) handler(event);
  return seen;
}

function screenWith(world: World, lookOver: boolean): void {
  stubDom();
  handlers.length = 0;
  new QuestScreen({ world: () => world, apply: () => {}, announce: () => {}, runKey: () => {} } as never, () => lookOver, () => null);
}

const SCENE: QuestLive = { quest: "bowl_hattie", lang: "en", ink: "{}", lines: [], choices: [], costs: [], checks: [] };

describe("keys during a scene", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lets I, C and J through to the game, and keeps every other key", () => {
    const world = emptyWorld();
    world.player.quests.live = { ...SCENE };
    screenWith(world, false);
    expect(press("KeyI").stopped).toBe(false);
    expect(press("KeyC").stopped).toBe(false);
    expect(press("KeyJ").stopped).toBe(false);
    expect(press("Digit1").stopped).toBe(true);
    expect(press("Escape").stopped).toBe(true);
  });

  it("lets every key through, and acts on none, while a look screen is over the scene", () => {
    const world = emptyWorld();
    world.player.quests.live = { ...SCENE };
    screenWith(world, true);
    for (const code of ["Digit1", "Space", "Enter", "Escape", "KeyI"]) expect(press(code).stopped).toBe(false);
    expect(world.player.quests.live).toEqual(SCENE);
  });

  it("takes no key when no scene is open", () => {
    screenWith(emptyWorld(), false);
    expect(press("Digit1").stopped).toBe(false);
  });
});
