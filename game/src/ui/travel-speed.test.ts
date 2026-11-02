import { describe, expect, it } from "vitest";
import { CONFIG } from "../config";
import { modeRulesOf } from "../sim/settings";
import { resolve } from "../text/resolve";
import { Travel } from "../three/travel";
import { controlsFor } from "./game-menu";
import { FASTER_KEY, SLOWER_KEY, TRAVEL_SPEED_CODES } from "./travel-speed";

function press(travel: Travel, code: string): void {
  travel.stepSpeed(TRAVEL_SPEED_CODES[code]);
}

describe("travel speed keys", () => {
  it("bind the bracket keys by physical code", () => {
    expect(TRAVEL_SPEED_CODES).toEqual({ BracketLeft: -1, BracketRight: 1 });
  });

  it("step the speed of Travel and do nothing past the ends", () => {
    const travel = new Travel(250, 11);
    press(travel, "BracketLeft");
    expect(travel.getSpeedIndex()).toBe(0);
    press(travel, "BracketRight");
    expect(travel.getSpeedIndex()).toBe(1);
    for (let i = 0; i < CONFIG.travelSpeeds.length + 2; i++) press(travel, "BracketRight");
    expect(travel.getSpeedIndex()).toBe(CONFIG.travelSpeeds.length - 1);
    press(travel, "BracketLeft");
    expect(travel.getSpeedIndex()).toBe(CONFIG.travelSpeeds.length - 2);
  });

  it("are in the help panel under Drive", () => {
    const row = controlsFor(modeRulesOf("roaming")).flatMap((g) => g.controls).find((c) => c.keys.includes(SLOWER_KEY));
    expect(row?.keys).toEqual([SLOWER_KEY, FASTER_KEY]);
    expect(resolve(row!.does, "en")).toBe("Travel speed");
    expect(resolve(row!.does, "ru")).not.toBe("Travel speed");
  });
});
