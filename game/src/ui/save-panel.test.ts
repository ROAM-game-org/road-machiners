import { describe, expect, it } from "vitest";
import { date, type Msg } from "../text/msg";
import { resolve } from "../text/resolve";
import { clock } from "./format";
import { slotDetail, slotMode, slotRealTime } from "./save-panel";

const en = (msg: Msg): string => resolve(msg, "en");

describe("save slot row", () => {
  it("shows the game clock in the HUD form, without the real date", () => {
    const detail = slotDetail({ slot: "slot1", savedAt: Date.UTC(2026, 9, 9), turn: 0, mode: "roaming" });
    expect(detail.tone).toBe("num");
    expect(en(detail.text)).toBe(en(clock(0).full));
    expect(en(detail.text)).toMatch(/^Day \d+ \d{1,2}:\d{2}$/);
  });

  it("keeps the real time for the tooltip", () => {
    const savedAt = Date.UTC(2026, 9, 9, 16, 22, 50);
    expect(en(slotRealTime({ slot: "slot1", savedAt, turn: 0, mode: "roaming" })!)).toBe(en(date(savedAt)));
  });

  it("reads an empty slot as faint and gives no tooltip", () => {
    expect(en(slotDetail(null).text)).toBe("Empty");
    expect(slotDetail(null).tone).toBe("dim");
    expect(slotRealTime(null)).toBeNull();
  });

  it("names the game mode of the save", () => {
    expect(en(slotMode({ slot: "slot1", savedAt: 0, turn: 0, mode: "chaosHighway" })!)).toBe("Chaos Highway");
    expect(en(slotMode({ slot: "slot1", savedAt: 0, turn: 0, mode: "roaming" })!)).toBe("Roaming");
    expect(slotMode({ slot: "auto", savedAt: 0, turn: null, mode: null })).toBeNull();
    expect(slotMode(null)).toBeNull();
  });

  it("reads a damaged save as a failure", () => {
    const detail = slotDetail({ slot: "auto", savedAt: 0, turn: null, mode: null });
    expect([en(detail.text), detail.tone]).toEqual(["Old or damaged save", "bad"]);
    expect(slotRealTime({ slot: "auto", savedAt: 0, turn: null, mode: null })).toBeNull();
  });
});
