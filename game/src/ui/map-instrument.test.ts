import { describe, expect, it } from "vitest";
import { emptyWorld } from "../sim/testkit";
import { resolve } from "../text/resolve";
import { t } from "../text/msg";
import { systemViewsOf } from "./hud";

describe("the map key", () => {
  it("names the map and its M key in a mode with the exploration map", () => {
    const map = systemViewsOf(emptyWorld(), false, false).map;

    expect(resolve(map.title, "en")).toBe("Map");
    expect(map.key).toBe("M");
    expect(map.reason).toBeNull();
  });

  it("is blocked with the turn-playing reason while a turn plays", () => {
    const map = systemViewsOf(emptyWorld(), true, false).map;

    expect(map.reason).not.toBeNull();
    expect(resolve(map.reason!, "en")).not.toBe(resolve(map.title, "en"));
  });

  it("is blocked in Chaos Highway, which has no map", () => {
    const w = emptyWorld();
    w.setup = { ...w.setup, mode: "chaosHighway" };

    expect(resolve(systemViewsOf(w, false, false).map.reason!, "en")).toBe(resolve(t("hud.noMap"), "en"));
  });
});
