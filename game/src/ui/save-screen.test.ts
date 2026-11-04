import { afterEach, describe, expect, it, vi } from "vitest";
import type { BootRequest, SlotId, SlotInfo } from "../three/save-slots";
import { t } from "../text/msg";
import { isNewGameOpen } from "./new-game";
import { pickTextFile } from "./dom";
import { resolve } from "../text/resolve";
import { clock } from "./format";
import { SavePanel } from "./save-panel";
import { chooseStart } from "./save-screen";
import { SoundSettings } from "./sound";
import type { Mixer } from "../audio/mixer";

vi.mock("./dom", async (original) => ({ ...(await original<Record<string, unknown>>()), pickTextFile: vi.fn() }));

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
const SAVES = [info('slot2', 900, 120), info('auto', 500, 40, 'chaosHighway')];

const importSave = vi.fn();

function open(saves: SlotInfo[]) {
  const ui = new FakeNode("div");
  const opener = new FakeNode("button");
  vi.stubGlobal("document", { createElement: (t: string) => new FakeNode(t), createTextNode: (text: string) => Object.assign(new FakeNode("#text"), { children: [text] }), getElementById: () => ui, activeElement: opener });
  vi.stubGlobal("window", Object.assign(new FakeNode("window"), { localStorage: { getItem: () => null, setItem: vi.fn() } }));
  const requests: BootRequest[] = [];
  const actions = { requestBoot: (r: BootRequest) => requests.push(r), reload: vi.fn(), confirm: vi.fn(() => true) };
  const chosen = vi.fn();
  const sound = new SoundSettings({ setBusVolume: vi.fn(), setMuted: vi.fn() } as unknown as Mixer, { getItem: () => null, setItem: vi.fn() } as unknown as Storage);
  void chooseStart(saves, actions, sound, importSave).then(chosen);
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
    expect(menu.all((n) => n.tag === "button").map((b) => b.textContent)).toEqual(["Continue", "Load", "Import save", "New game", "Options"]);
  });

  it("plays the slot an imported file lands in", async () => {
    const { menu, ui, chosen } = open([]);
    vi.mocked(pickTextFile).mockResolvedValue("file text");
    importSave.mockResolvedValue({ slot: "slot1" });

    menu.button("Import save").fire("click");
    await vi.waitFor(() => expect(chosen).toHaveBeenCalledWith("slot1"));

    expect(importSave).toHaveBeenCalledWith("file text");
    expect(ui.byClass("start-menu")).toEqual([]);
  });

  it("shows why a file was refused and stays open", async () => {
    const { menu, chosen } = open([]);
    vi.mocked(pickTextFile).mockResolvedValue("file text");
    importSave.mockResolvedValue({ refusal: t("save.importUnreadable") });

    menu.button("Import save").fire("click");
    await vi.waitFor(() => expect(menu.byClass("bad")).toHaveLength(1));

    expect(menu.byClass("bad")[0].textContent).toBe("This file is not a save");
    expect(chosen).not.toHaveBeenCalled();
  });

  it("does nothing when the picker is cancelled", async () => {
    const { menu } = open([]);
    importSave.mockClear();
    vi.mocked(pickTextFile).mockResolvedValue(null);

    menu.button("Import save").fire("click");
    await Promise.resolve();

    expect(importSave).not.toHaveBeenCalled();
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

describe("the in-game Save panel Import save", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reopens with the refusal under the buttons", async () => {
    const { ui } = open([]);
    vi.mocked(pickTextFile).mockResolvedValue("file text");
    importSave.mockResolvedValue({ refusal: t("save.importNoSlot") });
    const panel = new SavePanel({ list: () => [], manualSlots: () => [], save: vi.fn(), mode: () => "roaming" as const, reboot: vi.fn(), exportSave: vi.fn(), exportLog: vi.fn(), importSave });

    panel.openSave();
    ui.byClass("save-exports")[0].button("Import save").fire("click");
    await vi.waitFor(() => expect(ui.byClass("bad")).toHaveLength(1));

    expect(ui.byClass("bad")[0].textContent).toBe("All save slots are full");
    expect(ui.byClass("save-panel")).toHaveLength(1);
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
    const panel = new SavePanel({ list: () => SAVES, manualSlots: () => [], save: vi.fn(), mode: () => "roaming" as const, reboot, exportSave: vi.fn(), exportLog: vi.fn(), importSave });

    panel.openLoad();
    const row = ui.byClass("save-row")[0];
    row.fire("click");
    expect(reboot).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    row.fire("click");

    expect(confirm).toHaveBeenCalledTimes(2);
    expect(reboot).toHaveBeenCalledWith("slot2");
  });

  describe("saving over another mode", () => {
    function savePanel(saves: SlotInfo[], mode: "roaming" | "chaosHighway", answer: boolean) {
      const ui = new FakeNode("div");
      vi.stubGlobal("document", { createElement: (t: string) => new FakeNode(t), createTextNode: (text: string) => Object.assign(new FakeNode("#text"), { children: [text] }), getElementById: () => ui, activeElement: new FakeNode("button") });
      const confirm = vi.fn(() => answer);
      vi.stubGlobal("window", Object.assign(new FakeNode("window"), { confirm }));
      const save = vi.fn();
      const panel = new SavePanel({ list: () => saves, manualSlots: () => ["slot1"], save, mode: () => mode, reboot: vi.fn(), exportSave: vi.fn(), exportLog: vi.fn() });
      panel.openSave();
      ui.byClass("save-row")[0].fire("click");
      return { confirm, save };
    }

    it("asks, naming the slot and both modes, and keeps the slot on cancel", () => {
      const { confirm, save } = savePanel([info("slot1", 900, 120, "roaming")], "chaosHighway", false);
      expect(confirm).toHaveBeenCalledTimes(1);
      const asked = String((confirm.mock.calls[0] as unknown[])[0]);
      expect(asked).toContain("Slot 1");
      expect(asked).toContain("Roaming");
      expect(asked).toContain("Chaos Highway");
      expect(save).not.toHaveBeenCalled();
    });

    it("saves when the player confirms", () => {
      const { save } = savePanel([info("slot1", 900, 120, "roaming")], "chaosHighway", true);
      expect(save).toHaveBeenCalledWith("slot1");
    });

    it("asks the other way round too", () => {
      const { confirm, save } = savePanel([info("slot1", 900, 120, "chaosHighway")], "roaming", false);
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(save).not.toHaveBeenCalled();
    });

    it.each([
      ["an empty slot", []],
      ["a slot of the same mode", [info("slot1", 900, 120, "chaosHighway")]],
      ["a damaged slot", [{ slot: "slot1", savedAt: 900, turn: null, mode: null } as SlotInfo]],
    ])("saves at once over %s", (_name, saves) => {
      const { confirm, save } = savePanel(saves as SlotInfo[], "chaosHighway", false);
      expect(confirm).not.toHaveBeenCalled();
      expect(save).toHaveBeenCalledWith("slot1");
    });
  });
});
