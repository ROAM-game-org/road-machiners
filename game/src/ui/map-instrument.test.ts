import { describe, expect, it } from "vitest";
import { emptyWorld } from "../sim/testkit";
import { resolve } from "../text/resolve";
import { t } from "../text/msg";
import { systemViewsOf } from "./hud";

describe("the map key", () => {
  it("names the map and its M key in a mode with the exploration map", () => {
    const map = systemViewsOf(emptyWorld()).map;

    expect(resolve(map.title, "en")).toBe("Map");
    expect(map.key).toBe("M");
    expect(map.reason).toBeNull();
  });

  it("is blocked in Chaos Highway, which has no map", () => {
    const w = emptyWorld();
    w.setup = { ...w.setup, mode: "chaosHighway" };

    expect(resolve(systemViewsOf(w).map.reason!, "en")).toBe(resolve(t("hud.noMap"), "en"));
  });
});
