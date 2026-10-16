import { defaultSetup } from '../sim/settings';
import { openQuest, QUESTS } from "../sim/quests";
import { GAME_OPENED_QUESTS } from "../data/quests";
import { describe, expect, it } from "vitest";
import { playerVehicle } from "../sim/damage";
import { addVehicle, emptyWorld, furyRoadWorld, npcBrain, openingStopPoint, startCombat, testDrive } from "../sim/testkit";
import { vehicleStats } from "../sim/stats";
import { refreshVision } from "../sim/vision";
import { cloneWorld, endTurn, newWorld, setMoveOrder, startPose } from "../sim/world";
import { startKit } from "../data/start";
import { CONDITION } from "../data/wear";
import { findSpot, gridOf, isMounted, MOUNT_CELLS, mountedParts, type Spot } from "../sim/grid";
import { addGoods, moveItem } from "../sim/inventory";
import { siteOf } from "../sim/market";
import { sitePads } from "../sim/sites";
import { startRepair } from "../sim/jobs";
import { takeAllLoot } from "../sim/locations";
import { OPENING_WRECK_ID } from "../sim/opening";
import { startSearch } from "../sim/search";
import type { World } from "../sim/types";
import { TEST_MAP } from "../test/map";
import { clearTips, doneTips, openingStep, setTipsOff, tipsOff, tipToShow, type TipId } from "./tips";

describe("driving tips", () => {
  it("walks the player from a waypoint to Space, stopping, stop waypoints and manual mode", () => {
    const w = emptyWorld();
    const me = playerVehicle(w);
    const seen = new Set<TipId>();
    expect(tipToShow(w, false, seen, null)).toBe("waypoint");

    me.order = { kind: "stopAt", dest: { x: 40, y: 30 } };
    expect(doneTips(w, new Set())).toContain("waypoint");
    seen.add("waypoint");
    expect(tipToShow(w, false, seen, null)).toBe("drive");

    me.speed = 2;
    seen.add("drive");
    expect(tipToShow(w, true, seen, null)).toBe("autoStop");

    seen.add("autoStop");
    expect(tipToShow(w, false, seen, null)).toBe("stop");

    me.speed = 0;
    me.order = { kind: "brake" };
    seen.add("stop");
    expect(tipToShow(w, false, seen, null)).toBe("stopAt");

    me.order = { kind: "stopAt", dest: { x: 40, y: 30 } };
    expect(doneTips(w, new Set())).toContain("stopAt");
    seen.add("stopAt");
    expect(tipToShow(w, false, seen, null)).toBe("manual");

    me.direct = true;
    seen.add("manual");
    expect(tipToShow(w, false, seen, null)).toBe("zones");
  });

  it("asks to drive a truck that parked after a drive, whose physics speed is not quite 0", () => {
    const w = emptyWorld();
    const me = playerVehicle(w);
    me.speed = 0.0004;
    me.order = { kind: "through", dest: { x: 40, y: 30 } };
    const seen = new Set<TipId>(["waypoint"]);
    expect(doneTips(w, seen)).not.toContain("drive");
    expect(tipToShow(w, false, seen, null)).toBe("drive");
  });

  it("holds a later driving tip until the one before it is seen", () => {
    const w = emptyWorld();
    playerVehicle(w).speed = 2;
    expect(tipToShow(w, false, new Set(), null)).toBe("waypoint");
  });

  it("marks tips done by what the player did", () => {
    const w = emptyWorld();
    const me = playerVehicle(w);
    me.order = { kind: "brake" };
    me.direct = true;
    w.events.push({ t: "honk", vehicle: me.id });
    expect(doneTips(w, new Set()).sort()).toEqual(["honk", "manual", "stop"]);
  });

  it("shows no tip to a player who cannot act", () => {
    const w = emptyWorld();
    w.player.state = "dead";
    expect(tipToShow(w, false, new Set(), null)).toBeNull();
  });

  it("shows no tip while a quest is on screen", () => {
    const w = emptyWorld();
    openQuest(w, QUESTS, GAME_OPENED_QUESTS.arrival, "start");
    expect(tipToShow(w, false, new Set(), null)).toBeNull();
  });
});

describe("horn tip", () => {
  it("shows once an NPC is in sight and keeps a shown tip in place", () => {
    const w = emptyWorld();
    const seen = new Set<TipId>(["waypoint", "drive", "stop", "stopAt", "manual", "salvage"]);
    expect(tipToShow(w, false, seen, null)).toBeNull();

    const npc = addVehicle(w, "scavengers", "scout", [], { x: 32, y: 30 });
    npc.brain = npcBrain("scavenger", npc.pos, ["scavenger"]);
    refreshVision(w);
    expect(tipToShow(w, false, seen, null)).toBe("honk");

    const driving = new Set<TipId>();
    expect(tipToShow(w, false, driving, "waypoint")).toBe("waypoint");
  });

  it("ignores an NPC out of sight", () => {
    const w = emptyWorld();
    const npc = addVehicle(w, "scavengers", "scout", [], { x: 58, y: 58 });
    npc.brain = npcBrain("scavenger", npc.pos, ["scavenger"]);
    refreshVision(w);
    expect(tipToShow(w, false, new Set(["waypoint"]), null)).toBeNull();
  });
});

describe("aim tip", () => {
  const driving = new Set<TipId>(["waypoint", "drive", "stop", "stopAt", "manual", "salvage"]);

  function withRaider() {
    const w = emptyWorld();
    const npc = addVehicle(w, "raiders", "scout", [], { x: 32, y: 30 });
    npc.brain = npcBrain("raider", npc.pos, ["raider"]);
    refreshVision(w);
    return { w, npc };
  }

  it("shows for an armed player once a hostile is in sight, ahead of the horn tip", () => {
    const { w } = withRaider();
    expect(tipToShow(w, false, driving, null)).toBe("aim");
  });

  it("stays away from a neutral", () => {
    const w = emptyWorld();
    const npc = addVehicle(w, "traders", "scout", [], { x: 32, y: 30 });
    npc.brain = npcBrain("trader", npc.pos, ["trader"]);
    refreshVision(w);
    expect(tipToShow(w, false, driving, null)).toBe("honk");
  });

  it("is done once a gun aims at a part", () => {
    const { w, npc } = withRaider();
    const me = playerVehicle(w);
    const gun = vehicleStats(w, me).weapons[0].part.id;
    me.weaponOrders[gun] = { targetId: npc.id, aim: "body" };
    expect(doneTips(w, new Set())).not.toContain("aim");
    me.weaponOrders[gun] = { targetId: npc.id, aim: "engine" };
    expect(doneTips(w, new Set())).toContain("aim");
  });
});

describe("salvage tip", () => {
  const driven = new Set<TipId>(["waypoint", "drive"]);
  const awayFrom = (w: World, d: number) => {
    const spawn = startPose().pos;
    playerVehicle(w).pos = { x: spawn.x + d, y: spawn.y };
  };

  it("waits until the truck is 20 tiles from the start and the driving tip is seen", () => {
    const w = emptyWorld();
    awayFrom(w, 15);
    expect(tipToShow(w, false, driven, null)).not.toBe("salvage");
    awayFrom(w, 25);
    expect(tipToShow(w, false, driven, null)).toBe("salvage");
    expect(tipToShow(w, false, new Set(["waypoint"]), null)).not.toBe("salvage");
  });

  it("stays away during combat", () => {
    const w = emptyWorld();
    awayFrom(w, 25);
    const npc = addVehicle(w, "raiders", "scout", [], { x: 60, y: 30 });
    startCombat(w, npc, playerVehicle(w));
    expect(tipToShow(w, false, driven, null)).not.toBe("salvage");
  });

  it("is done by searching any stock but the opening wreck", () => {
    const w = emptyWorld();
    w.player.scavenged = [OPENING_WRECK_ID];
    expect(doneTips(w, new Set())).not.toContain("salvage");
    w.player.scavenged = [OPENING_WRECK_ID, "road-wreck-1"];
    expect(doneTips(w, new Set())).toContain("salvage");
  });

  it("waits for the opening to end", () => {
    const w = newWorld(1, startKit("standard"), TEST_MAP, defaultSetup("roaming"));
    const spawn = startPose().pos;
    playerVehicle(w).pos = { x: spawn.x + 25, y: spawn.y };
    expect(openingStep(w)).not.toBeNull();
    expect(tipToShow(w, false, new Set(["waypoint", "drive"]), null)).not.toBe("salvage");
  });
});

describe("sell tip", () => {
  const seen = new Set<TipId>(["waypoint", "drive", "autoStop", "stop", "stopAt", "manual", "zones", "salvage", "honk", "farewell"]);
  const atBowl = () => emptyWorld(sitePads(siteOf("bowl"))[0]);

  it("shows at a shop pad while the truck holds a good the shop lists", () => {
    const w = atBowl();
    playerVehicle(w).speed = 0;
    addGoods(w, playerVehicle(w), "scrap", 1);
    expect(tipToShow(w, false, seen, null)).toBe("sell");
    playerVehicle(w).speed = 5;
    expect(tipToShow(w, false, seen, null)).toBeNull();
  });

  it("wins over the salvage tip for a player who has not searched beyond the opening", () => {
    const w = atBowl();
    playerVehicle(w).speed = 0;
    addGoods(w, playerVehicle(w), "scrap", 1);
    const unsearched = new Set<TipId>(["waypoint", "drive", "autoStop", "stop", "stopAt", "manual", "zones"]);
    expect(tipToShow(w, false, unsearched, null)).toBe("sell");
    expect(tipToShow(w, false, unsearched, "salvage")).toBe("sell");
  });

  it("ignores goods the shop does not list and pads without cargo", () => {
    const w = atBowl();
    playerVehicle(w).speed = 0;
    playerVehicle(w).items = playerVehicle(w).items.filter((it) => it.kind !== "good");
    expect(tipToShow(w, false, seen, null)).toBeNull();
  });

  it("never shows off a pad", () => {
    const w = emptyWorld();
    addGoods(w, playerVehicle(w), "scrap", 1);
    expect(tipToShow(w, false, seen, null)).toBeNull();
  });

  it("is done by a profitable sale", () => {
    const w = atBowl();
    expect(doneTips(w, new Set())).not.toContain("sell");
    w.player.xpBySource.profit = 1;
    expect(doneTips(w, new Set())).toContain("sell");
  });
});

describe("farewell tip", () => {
  const allButFarewell: TipId[] = ["waypoint", "drive", "autoStop", "stop", "stopAt", "manual", "zones", "salvage", "honk"];

  it("shows once the player drives well past where traders first show up", () => {
    const w = emptyWorld();
    const spawn = startPose().pos;
    playerVehicle(w).pos = { x: spawn.x + 60, y: spawn.y };
    expect(tipToShow(w, false, new Set(allButFarewell), null)).toBeNull();
    playerVehicle(w).pos = { x: spawn.x + 80, y: spawn.y };
    expect(tipToShow(w, false, new Set(allButFarewell), null)).toBe("farewell");
  });

  it("waits for the horn tip", () => {
    const w = emptyWorld();
    const spawn = startPose().pos;
    playerVehicle(w).pos = { x: spawn.x + 80, y: spawn.y };
    expect(tipToShow(w, false, new Set(allButFarewell.filter((id) => id !== "honk")), null)).toBeNull();
  });
});

describe("opening tips", () => {
  let template: World | undefined;
  const opening = (): World => cloneWorld((template ??= newWorld(1, startKit("standard"), TEST_MAP, defaultSetup("roaming"))));

  const turns = (w: World, n: number): World => {
    let next = w;
    for (let i = 0; i < n; i++) next = endTurn(next, testDrive);
    return next;
  };
  const untilIdle = (w: World): World => {
    let next = w;
    for (let i = 0; i < 10 && playerVehicle(next).job; i++) next = turns(next, 1);
    return next;
  };
  const refresh = (w: World, seen: Set<TipId>): TipId | null => {
    for (const id of doneTips(w, seen)) seen.add(id);
    return tipToShow(w, false, seen, null);
  };
  const parked = (w: World): World => {
    const me = playerVehicle(w);
    me.pos = openingStopPoint(w);
    me.speed = 0;
    me.order = null;
    return w;
  };
  const engineId = (w: World): string => mountedParts(playerVehicle(w)).find((p) => p.defId === "stockEngine")!.id;
  const cage = (w: World) => playerVehicle(w).items.find((it) => it.kind === "part" && it.part.defId === "cage")!;
  const cageSpot = (w: World, mount: boolean): Spot => {
    const me = playerVehicle(w);
    const item = cage(w);
    const others = me.items.filter((it) => it !== item);
    const spot = mount ? findSpot(gridOf(me), others, item, MOUNT_CELLS.armor, null) : findSpot(gridOf(me), others, item, null, MOUNT_CELLS.armor);
    if (!spot) throw new Error("No spot for the cage");
    return spot;
  };
  const looted = (): World => takeAllLoot(untilIdle(startSearch(parked(opening()), OPENING_WRECK_ID)), OPENING_WRECK_ID);

  it("walks a new player from the wreck through search, loot, patch and the cage, then hands over to the driving tips", () => {
    const seen = new Set<TipId>();
    let w = opening();
    expect(refresh(w, seen)).toBe("wreck");

    w = setMoveOrder(w, { kind: "stopAt", dest: openingStopPoint(w) });
    expect(refresh(w, seen)).toBe("wreck");
    expect(seen.has("waypoint") || seen.has("stopAt")).toBe(false);

    w = parked(w);
    expect(refresh(w, seen)).toBe("search");
    expect(seen.has("wreck")).toBe(true);

    w = startSearch(w, OPENING_WRECK_ID);
    expect(refresh(w, seen)).toBe("search");
    w = untilIdle(w);
    expect(refresh(w, seen)).toBe("loot");

    w = takeAllLoot(w, OPENING_WRECK_ID);
    expect(refresh(w, seen)).toBe("patch");

    w = untilIdle(startRepair(w, engineId(w)));
    expect(refresh(w, seen)).toBe("install");

    w = untilIdle(moveItem(w, cage(w).id, cageSpot(w, true)));
    expect(openingStep(w)).toBeNull();
    expect(refresh(w, seen)).toBe("waypoint");
    expect([...seen]).toEqual(["wreck", "search", "loot", "patch", "install"]);
  });

  it("drops the patch step once the engine is junk, as no patch fixes it", () => {
    const w = looted();
    const engine = mountedParts(playerVehicle(w)).find((p) => p.id === engineId(w))!;
    engine.wear = CONDITION.maxWear + 1;
    engine.hp = 0;
    expect(refresh(w, new Set<TipId>())).not.toBe("patch");
  });

  it("skips a step the player closes and lets the driving tips show", () => {
    const w = opening();
    expect(tipToShow(w, false, new Set(), null)).toBe("wreck");
    expect(tipToShow(w, false, new Set<TipId>(["wreck"]), null)).toBe("waypoint");
  });

  it("keeps the step through a wrong pick: the cab patched first, the cage stowed in cargo", () => {
    const seen = new Set<TipId>();
    let w = looted();
    expect(refresh(w, seen)).toBe("patch");
    const cab = mountedParts(playerVehicle(w)).find((p) => p.defId === "cabPickup")!;
    w = untilIdle(startRepair(w, cab.id));
    expect(refresh(w, seen)).toBe("patch");

    w = untilIdle(startRepair(w, engineId(w)));
    w = untilIdle(moveItem(w, cage(w).id, cageSpot(w, false)));
    expect(isMounted(playerVehicle(w).chassisId, cage(w))).toBe(false);
    expect(refresh(w, seen)).toBe("install");
  });

  it("goes moot when an NPC empties the wreck first", () => {
    const w = opening();
    const stock = w.salvage.find((s) => s.id === OPENING_WRECK_ID)!;
    stock.goods = { scrap: 0, parts: 0 };
    stock.parts = [];
    expect(openingStep(w)).toBeNull();
    expect(tipToShow(w, false, new Set(), null)).toBe("waypoint");
  });

  it("skips the patch step once no parts are left to patch with", () => {
    let w = looted();
    const me = playerVehicle(w);
    me.items = me.items.filter((it) => !(it.kind === "good" && it.good === "parts"));
    expect(openingStep(w)).toBe("install");
    w = untilIdle(moveItem(w, cage(w).id, cageSpot(w, true)));
    expect(openingStep(w)).toBeNull();
  });

  it("has no opening step in a game without the opening wreck, like an old save", () => {
    expect(openingStep(emptyWorld())).toBeNull();
  });
});

describe("tips in a Fury Road run", () => {
  it("runs no opening and offers no horn", () => {
    const w = furyRoadWorld(3);
    addVehicle(w, "raiders", "wagon", ["mg"], { x: playerVehicle(w).pos.x + 4, y: playerVehicle(w).pos.y }).brain = npcBrain("buggy", playerVehicle(w).pos, ["raider"]);
    refreshVision(w);
    const seen = new Set<TipId>(["waypoint", "drive", "autoStop", "stop", "stopAt", "manual", "zones", "aim"]);
    playerVehicle(w).pos = { x: playerVehicle(w).pos.x + 25, y: playerVehicle(w).pos.y };

    expect(openingStep(w)).toBeNull();
    expect(tipToShow(w, false, seen, null)).not.toBe("honk");
    expect(tipToShow(w, false, seen, null)).not.toBe("salvage");
  });
});

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  } as Storage;
}

describe("tips switch", () => {
  it("reads absent as on and 1 as off, and throws on anything else", () => {
    const s = memoryStorage();
    expect(tipsOff(s)).toBe(false);
    s.setItem("roam.tipsOff", "1");
    expect(tipsOff(s)).toBe(true);
    s.setItem("roam.tipsOff", "yes");
    expect(() => tipsOff(s)).toThrow();
  });

  it("round-trips through storage", () => {
    const s = memoryStorage();
    setTipsOff(s, true);
    expect(tipsOff(s)).toBe(true);
    setTipsOff(s, false);
    expect(s.getItem("roam.tipsOff")).toBeNull();
  });

  it("clears with the seen tips for a new game", () => {
    const s = memoryStorage();
    s.setItem("roam.tips", "[]");
    setTipsOff(s, true);
    clearTips(s);
    expect([s.getItem("roam.tips"), s.getItem("roam.tipsOff")]).toEqual([null, null]);
  });
});
