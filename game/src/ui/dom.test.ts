import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { t } from "../text/msg";
import { disabledWith, isBrowserChord, namesKey } from "./dom";

const NO_SAVES = t("save.none");

const keys = { ctrlKey: false, metaKey: false, altKey: false };

describe("isBrowserChord", () => {
  it("treats Ctrl, Meta and Alt as chords", () => {
    expect(isBrowserChord({ ...keys, ctrlKey: true })).toBe(true);
    expect(isBrowserChord({ ...keys, metaKey: true })).toBe(true);
    expect(isBrowserChord({ ...keys, altKey: true })).toBe(true);
  });
  it("treats AltGr (Ctrl+Alt) as a chord", () => {
    expect(isBrowserChord({ ...keys, ctrlKey: true, altKey: true })).toBe(true);
  });
  it("leaves bare keys and Shift to the game", () => {
    expect(isBrowserChord(keys)).toBe(false);
    expect(isBrowserChord({ ...keys, shiftKey: true } as KeyboardEvent)).toBe(false);
  });
});

describe("disabledWith", () => {
  it("passes the click through when there is no reason", () => {
    const click = vi.fn();
    const attrs = disabledWith(null, click);
    attrs.onclick();
    expect(click).toHaveBeenCalledOnce();
    expect(attrs["aria-disabled"]).toBeUndefined();
  });

  it("blocks the click and carries the reason when there is one", () => {
    const click = vi.fn();
    const attrs = disabledWith(NO_SAVES, click);
    attrs.onclick();
    expect(click).not.toHaveBeenCalled();
    expect(attrs["aria-disabled"]).toBe("true");
    expect(attrs["data-reason"]).toBe(NO_SAVES);
  });
});

describe("namesKey", () => {
  it("finds a bracketed or parenthesized key cap", () => {
    expect(namesKey("Close [C]")).toBe(true);
    expect(namesKey("Center on truck (F)")).toBe(true);
    expect(namesKey("[0] All")).toBe(true);
    expect(namesKey("Leave [Esc]")).toBe(true);
  });

  it("leaves plain words and other brackets", () => {
    expect(namesKey("Close")).toBe(false);
    expect(namesKey("Rank (2)")).toBe(false);
    expect(namesKey("Rank [2 of 5]")).toBe(false);
  });
});
