import { describe, expect, it } from "vitest";
import { say } from "../text/language";
import { emptyWorld } from "../sim/testkit";
import type { QuestLive } from "../sim/types";
import { lookReason } from "./unstuck-reason";

const live: QuestLive = { quest: "bowl_hattie", lang: "en", ink: "{}", lines: [], choices: [], costs: [], checks: [] };

describe("lookReason", () => {
  it("is none while no scene is on view", () => {
    expect(lookReason(emptyWorld())).toBeNull();
  });

  it("names the scene exactly while a quest is live", () => {
    const world = emptyWorld();
    world.player.quests.live = live;
    expect(say(lookReason(world)!)).toBe("Not during a scene");
    world.player.quests.live = null;
    expect(lookReason(world)).toBeNull();
  });
});
