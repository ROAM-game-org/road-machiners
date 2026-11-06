import { afterEach, describe, expect, it, vi } from "vitest";
import { WORLD_SETTINGS } from "../data/modes";
import type { WorldSettings } from "../sim/types";
import { settingDescription, settingName } from "../text/names";
import type { BootRequest } from "../three/save-slots";
import { resolve } from "../text/resolve";
import { FakeNode } from "../test/fake-dom";
import { isConfirmOpen } from "./confirm-dialog";
import { isNewGameOpen, openNewGame } from "./new-game";

function sliderOf(screen: FakeNode, id: string): FakeNode {
  const found = screen.all((n) => n.tag === "input" && n.attrs.id === `setting-${id}`)[0];
  if (!found) throw new Error(`No ${id} slider`);
  return found;
}

async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r));
}

async function startAndAnswer(ui: FakeNode, screen: FakeNode, answer: "Start new game" | "Cancel"): Promise<void> {
  screen.button("Start").fire("click");
  ui.withClass("confirm-dialog")!.button(answer).fire("click");
  await settle();
}

function spyStorage() {
  return { setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn(), getItem: vi.fn(() => null) };
}

let last: FakeNode | null = null;

function open() {
  const ui = new FakeNode("div");
  const win = new FakeNode("window");
  const opener = new FakeNode("button");
  const local = spyStorage();
  const session = spyStorage();
  FakeNode.active = opener;
  vi.stubGlobal("document", { createElement: (t: string) => new FakeNode(t), createTextNode: (text: string) => Object.assign(new FakeNode("#text"), { children: [text] }), getElementById: () => ui, get activeElement() { return FakeNode.active; } });
  vi.stubGlobal("window", Object.assign(win, { localStorage: local, sessionStorage: session }));
  const requests: BootRequest[] = [];
  const actions = { requestBoot: (r: BootRequest) => requests.push(r), reload: vi.fn() };
  const onClose = vi.fn();
  openNewGame(actions, onClose);
  const screen = ui.all((n) => n.className.split(" ").includes("new-game"))[0];
  last = screen;
  const slide = (id: string, value: number) => {
    const input = sliderOf(screen, id);
    input.fire("input", { target: { value: String(value) } });
  };
  const wroteStorage = () => [local, session].some((s) => s.setItem.mock.calls.length + s.removeItem.mock.calls.length + s.clear.mock.calls.length > 0);
  return { ui, win, screen, opener, actions, requests, onClose, slide, wroteStorage };
}

describe("the New game screen", () => {
  afterEach(() => {
    if (isNewGameOpen()) last?.button("Back").fire("click");
    vi.unstubAllGlobals();
  });

  it("shows the title, a selected Roaming card with its description, World Settings, Back and Start, with focus on Start", () => {
    const { screen } = open();
    const roaming = screen.all((n) => n.attrs["data-mode"] === "roaming")[0];

    expect(screen.textContent).toContain("New game");
    expect(roaming.attrs["aria-checked"]).toBe("true");
    expect(roaming.textContent).toContain("The open wasteland");
    expect(screen.button("World settings")).toBeDefined();
    expect(screen.button("Back")).toBeDefined();
    expect(screen.button("Start").focused).toBe(1);
  });

  it("expands World Settings inline with a row per setting at its default and bounds", () => {
    const { screen } = open();
    const section = screen.all((n) => n.className === "world-settings")[0];
    expect(section.hidden).toBe(true);
    screen.button("World settings").fire("click");

    expect(section.hidden).toBe(false);
    expect(screen.all((n) => n.attrs["data-setting"] === "enemyGearGrowth")).toEqual([]);
    screen.all((n) => n.attrs["data-mode"] === "chaosHighway")[0].fire("click");
    for (const [id, def] of Object.entries(WORLD_SETTINGS)) {
      const slider = sliderOf(screen, id);
      expect([slider.attrs.min, slider.attrs.max, slider.attrs.step, slider.attrs.value]).toEqual([def.min, def.max, def.step, def.default].map(String));
      const row = screen.all((n) => n.attrs["data-setting"] === id)[0];
      expect(row.textContent).toContain(resolve(settingName(id as keyof WorldSettings), "en"));
      expect(row.textContent).toBe(`${resolve(settingName(id as keyof WorldSettings), "en")}100%`);
      expect(row.all((n) => n.tag === "label")[0].attrs.title).toBe(resolve(settingDescription(id as keyof WorldSettings), "en"));
      expect(row.all((n) => n.className === "default-tick")[0].attrs.style).toBe(`--default-at: ${(def.default - def.min) / (def.max - def.min)}`);
    }
  });

  it("writes nothing and calls no command when opened and closed with Back, and gives focus back", () => {
    const { screen, ui, requests, actions, wroteStorage, onClose, opener } = open();
    screen.button("Back").fire("click");

    expect(requests).toEqual([]);
    expect(actions.reload).not.toHaveBeenCalled();
    expect(wroteStorage()).toBe(false);
    expect(ui.children).toEqual([]);
    expect(isNewGameOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(opener.focused).toBe(1);
  });

  it("leaves nothing after a changed slider and Back", () => {
    const { screen, slide, requests, wroteStorage } = open();
    slide("damage", 1.5);
    expect(screen.all((n) => n.attrs["data-setting"] === "damage")[0].textContent).toContain("150%");
    screen.button("Back").fire("click");

    expect(requests).toEqual([]);
    expect(wroteStorage()).toBe(false);
  });

  it("closes on Escape and writes nothing", () => {
    const { win, requests, onClose } = open();
    win.fire("keydown", { code: "Escape" });

    expect(isNewGameOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(requests).toEqual([]);
  });

  it("keeps the keys typed in the screen out of the game", () => {
    const { screen } = open();
    const stop = vi.fn();
    screen.fire("keydown", { code: "KeyC", stopPropagation: stop });

    expect(stop).toHaveBeenCalled();
  });

  it("restores every default on Reset to defaults", async () => {
    const { ui, screen, slide, requests } = open();
    slide("damage", 2);
    slide("fuelUse", 0.5);
    screen.button("Reset to defaults").fire("click");
    await startAndAnswer(ui, screen, "Start new game");

    expect(requests).toEqual([{ new: { mode: "roaming", settings: { damage: 1, fuelUse: 1, supplyUse: 1, enemyGearGrowth: 1 } }, intro: true }]);
  });

  it("starts without the intro when the Skip the intro switch is on", async () => {
    const { ui, screen, requests } = open();
    expect(screen.button("Skip the intro").attrs["aria-checked"]).toBe("false");
    screen.button("Skip the intro").fire("click");
    expect(screen.button("Skip the intro").attrs["aria-checked"]).toBe("true");
    await startAndAnswer(ui, screen, "Start new game");

    expect(requests).toEqual([{ new: { mode: "roaming", settings: { damage: 1, fuelUse: 1, supplyUse: 1, enemyGearGrowth: 1 } }, intro: false }]);
  });

  it("asks before Start and stays open with nothing written when the player says no", async () => {
    const { ui, screen, slide, requests, actions, wroteStorage } = open();
    slide("damage", 1.5);
    screen.button("Start").fire("click");
    const dialog = ui.withClass("confirm-dialog")!;
    expect(dialog.textContent).toContain("Start a new game?");
    dialog.button("Cancel").fire("click");
    await settle();

    expect(requests).toEqual([]);
    expect(actions.reload).not.toHaveBeenCalled();
    expect(wroteStorage()).toBe(false);
    expect(isNewGameOpen()).toBe(true);
    expect(isConfirmOpen()).toBe(false);
  });

  it("keeps New game open when Escape answers the dialog", async () => {
    const { ui, win, screen, requests, actions, onClose } = open();
    screen.button("Start").fire("click");
    win.fire("keydown", { code: "Escape" });
    await settle();

    expect(ui.withClass("confirm-dialog")).toBeNull();
    expect(isNewGameOpen()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
    expect(actions.reload).not.toHaveBeenCalled();
  });

  it("asks once even when Start is pressed twice before the answer", async () => {
    const { ui, screen, requests, actions } = open();
    screen.button("Start").fire("click");
    screen.button("Start").fire("click");
    ui.withClass("confirm-dialog")!.button("Start new game").fire("click");
    await settle();

    expect(requests).toHaveLength(1);
    expect(actions.reload).toHaveBeenCalledTimes(1);
  });

  it("leaves exactly one request with the picked values and reloads on a confirmed Start", async () => {
    const { ui, screen, slide, requests, actions } = open();
    slide("damage", 1.5);
    slide("fuelUse", 2);
    await startAndAnswer(ui, screen, "Start new game");

    expect(requests).toEqual([{ new: { mode: "roaming", settings: { damage: 1.5, fuelUse: 2, supplyUse: 1, enemyGearGrowth: 1 } }, intro: true }]);
    expect(actions.reload).toHaveBeenCalledTimes(1);
  });

  it("starts a Chaos Highway run with the picked enemy gear growth", async () => {
    const { ui, screen, slide, requests } = open();
    screen.all((n) => n.attrs["data-mode"] === "chaosHighway")[0].fire("click");
    slide("enemyGearGrowth", 0.5);
    await startAndAnswer(ui, screen, "Start new game");

    expect(requests).toEqual([{ new: { mode: "chaosHighway", settings: { damage: 1, fuelUse: 1, supplyUse: 1, enemyGearGrowth: 0.5 } }, intro: true }]);
  });

  it("refuses to start with a value off the slider's grid, before it asks", () => {
    const { ui, screen, slide, requests } = open();
    slide("supplyUse", 1.1);

    expect(() => screen.button("Start").fire("click")).toThrow(/supplyUse/);
    expect(ui.withClass("confirm-dialog")).toBeNull();
    expect(requests).toEqual([]);
  });
});
