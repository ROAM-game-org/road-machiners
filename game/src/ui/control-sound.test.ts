import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTROL_CUES, HAND_MS, SOUNDS } from "../data/sounds";
import { installControlSounds, keyPress, pressCue, pressSoundOf, type PressSound } from "./control-sound";

describe("pressCue", () => {
  it("gives each press kind its own cue", () => {
    const kinds: PressSound[] = ["key", "screen", "switch", "latch", "latch-lit", "knob"];
    const cues = kinds.map((k) => pressCue(k, false));
    expect(cues).toEqual(["key-press", "screen-press", "switch-on", "latch-in", "latch-out", "knob-step"]);
    expect(new Set(cues).size).toBe(kinds.length);
  });

  it("sounds a lit switch going down and an unlit one going up", () => {
    expect(pressCue("switch", true)).toBe("switch-off");
    expect(pressCue("switch", false)).toBe("switch-on");
  });

  it("stays silent for a control that does not move", () => {
    expect(pressCue("none", false)).toBeNull();
    expect(pressCue("none", true)).toBeNull();
  });

  it("only names cues the catalog has", () => {
    for (const kind of ["key", "screen", "switch", "latch", "latch-lit", "knob"] as const) {
      expect(CONTROL_CUES).toContain(pressCue(kind, false));
      expect(SOUNDS[pressCue(kind, false)!]).toBeDefined();
    }
  });
});

describe("pressSoundOf", () => {
  it("reads a value with the spaces a stylesheet leaves", () => {
    expect(pressSoundOf(" latch-lit", "tab")).toBe("latch-lit");
  });

  it("throws on an empty or unknown value and names the button", () => {
    expect(() => pressSoundOf("", "mystery-key")).toThrow(/mystery-key/);
    expect(() => pressSoundOf("clunk", "mystery-key")).toThrow(/clunk/);
  });
});

describe("keyPress", () => {
  type Fake = { className: string; isConnected: boolean; shown: boolean; checked: boolean; sound: string };

  function control(sound: string, over: Partial<Fake> = {}): HTMLElement {
    const f: Fake = { className: "ctl", isConnected: true, shown: true, checked: false, sound, ...over };
    return {
      className: f.className,
      isConnected: f.isConnected,
      checkVisibility: () => f.shown,
      getAttribute: (n: string) => (n === "aria-checked" ? String(f.checked) : null),
      sound: f.sound,
    } as unknown as HTMLElement;
  }

  function setup() {
    const heard: string[] = [];
    const listeners: Record<string, (e: unknown) => void> = {};
    vi.stubGlobal("getComputedStyle", (el: { sound: string }) => ({ getPropertyValue: () => el.sound }));
    vi.stubGlobal("Element", class {});
    installControlSounds({ addEventListener: (n: string, fn: (e: unknown) => void) => (listeners[n] = fn) } as unknown as Document, (c) => heard.push(c));
    const keyClick = (el: HTMLElement) => {
      const target = Object.assign(new (globalThis as unknown as { Element: new () => object }).Element(), {
        closest: (sel: string) => (sel === "button" ? Object.assign(el, { closest: () => el }) : null),
      });
      listeners.click({ isTrusted: true, detail: 0, target });
    };
    return { heard, keyClick };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("sounds a switch by its state before the flip", () => {
    const { heard } = setup();
    keyPress(control("switch", { checked: true }));
    keyPress(control("switch", { checked: false }));
    expect(heard).toEqual(["switch-off", "switch-on"]);
  });

  it("plays nothing for none, hidden, detached or missing controls", () => {
    const { heard } = setup();
    keyPress(control("none"));
    keyPress(control("key", { shown: false }));
    keyPress(control("key", { isConnected: false }));
    keyPress(null);
    expect(heard).toEqual([]);
  });

  it("keeps the keyboard click of the same control silent, once", () => {
    vi.useFakeTimers();
    const { heard, keyClick } = setup();
    const a = control("key");
    const b = control("key");
    keyPress(a);
    keyClick(a);
    keyClick(b);
    expect(heard).toEqual(["key-press", "key-press"]);
  });

  it("sounds the keyboard click again after the hand window", () => {
    vi.useFakeTimers();
    const { heard, keyClick } = setup();
    const a = control("key");
    keyPress(a);
    vi.advanceTimersByTime(HAND_MS + 1);
    keyClick(a);
    expect(heard).toEqual(["key-press", "key-press"]);
  });
});
