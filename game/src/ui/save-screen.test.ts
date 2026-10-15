import { afterEach, describe, expect, it, vi } from "vitest";
import type { BootRequest, SlotId, SlotInfo } from "../three/save-slots";
import { isNewGameOpen } from "./new-game";
import { resolve } from "../text/resolve";
import { clock } from "./format";
import { SavePanel } from "./save-panel";
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
  fire(type: string, extra: object = {}) { for (const f of this.listeners.get(type) ?? []) f({ stopPropagation: () => {}, ...extra }); }
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

const info = (slot: SlotId, savedAt: number, turn: number | null = 0, mode: SlotInfo['mode'] = 'roaming'): SlotInfo => ({ slot, savedAt, turn, mode });
const SAVES = [info('slot2', 900, 120), info('auto', 500, 40, 'furyRoad')];

function open(saves: SlotInfo[]) {
  const ui = new FakeNode("div");
  const opener = new FakeNode("button");
  vi.stubGlobal("document", { createElement: (t: string) => new FakeNode(t), createTextNode: (text: string) => Object.assign(new FakeNode("#text"), { children: [text] }), getElementById: () => ui, activeElement: opener });
  vi.stubGlobal("window", Object.assign(new FakeNode("window"), { localStorage: { getItem: () => null, setItem: vi.fn() } }));
  const requests: BootRequest[] = [];
  const actions = { requestBoot: (r: BootRequest) => requests.push(r), reload: vi.fn(), confirm: vi.fn(() => true) };
  const chosen = vi.fn();
  void chooseStart(saves, actions).then(chosen);
  const menu = ui.byClass("start-menu")[0];
  return { ui, menu, requests, actions, chosen };
}

describe("the start menu", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the title, Continue, Load, New game and Options", () => {
    const { menu } = open(SAVES);

    expect(menu.all((n) => n.tag === "h1")[0].textContent).toBe("Road Machiners");
    expect(menu.all((n) => n.tag === "button").map((b) => b.textContent)).toEqual(["Continue", "Load", "New game", "Options"]);
  });

  it("continues the newest save and closes, with focus on Continue", async () => {
    const { ui, menu, chosen } = open(SAVES);
    expect(menu.button("Continue").focused).toBe(1);

    menu.button("Continue").fire("click");
    await Promise.resolve();

    expect(chosen).toHaveBeenCalledWith("slot2");
    expect(ui.byClass("start-menu")).toEqual([]);
  });

  it("turns Continue and Load off with no save, and puts focus on New game", async () => {
    const { menu, chosen } = open([]);
    const continueButton = menu.button("Continue");

    expect(continueButton.attrs["aria-disabled"]).toBe("true");
    expect(menu.button("Load").attrs["aria-disabled"]).toBe("true");
    expect(menu.byClass("start-save")).toEqual([]);
    expect(menu.button("New game").focused).toBe(1);
    continueButton.fire("click");
    await Promise.resolve();
    expect(chosen).not.toHaveBeenCalled();
  });

  it("opens the New game screen and stays open under it", () => {
    const { ui, menu, chosen } = open(SAVES);

    menu.button("New game").fire("click");

    expect(isNewGameOpen()).toBe(true);
    expect(ui.byClass("start-menu")).toHaveLength(1);
    expect(chosen).not.toHaveBeenCalled();
    ui.byClass("new-game")[0].button("Back").fire("click");
  });

  it("names the save Continue resumes under the button", () => {
    const { menu } = open(SAVES);

    const caption = menu.byClass("start-save")[0];
    expect(caption.textContent).toBe(`Slot 2Roaming${resolve(clock(120).full, "en")}`);
    expect(menu.button("Continue").attrs["aria-describedby"]).toBe(caption.attrs.id);
  });

  it("marks a damaged newest save and still resumes it", async () => {
    const { menu, chosen } = open([info("auto", 900, null, null)]);

    expect(menu.byClass("start-save")[0].textContent).toContain("Old or damaged save");
    expect(menu.byClass("bad")).toHaveLength(1);
    menu.button("Continue").fire("click");
    await Promise.resolve();
    expect(chosen).toHaveBeenCalledWith("auto");
  });

  it("lists every save under Load and boots the picked one without a confirm", async () => {
    const { ui, menu, chosen, actions } = open(SAVES);

    menu.button("Load").fire("click");
    const rows = ui.byClass("save-row");
    expect(rows.map((r) => r.attrs["data-slot"])).toEqual(["slot2", "auto"]);
    rows[1].fire("click");
    await Promise.resolve();

    expect(chosen).toHaveBeenCalledWith("auto");
    expect(actions.confirm).not.toHaveBeenCalled();
    expect(ui.byClass("start-menu")).toEqual([]);
    expect(ui.byClass("save-panel")).toEqual([]);
  });

  it("closes the list on Escape and puts focus back on Load", () => {
    const { ui, menu } = open(SAVES);
    const load = menu.button("Load");

    load.fire("click");
    (window as unknown as FakeNode).fire("keydown", { code: "Escape" });

    expect(ui.byClass("save-panel")).toEqual([]);
    expect(ui.byClass("start-menu")).toHaveLength(1);
    expect(load.focused).toBe(1);
  });
});

describe("the in-game Load panel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("confirms before it reboots into the picked save", () => {
    const { ui } = open([]);
    const confirm = vi.fn(() => false);
    vi.stubGlobal("window", Object.assign(new FakeNode("window"), { confirm }));
    const reboot = vi.fn();
    const panel = new SavePanel({ list: () => SAVES, manualSlots: () => [], save: vi.fn(), reboot, exportSave: vi.fn(), exportLog: vi.fn() });

    panel.openLoad();
    const row = ui.byClass("save-row")[0];
    row.fire("click");
    expect(reboot).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    row.fire("click");

    expect(confirm).toHaveBeenCalledTimes(2);
    expect(reboot).toHaveBeenCalledWith("slot2");
  });
});
