import { describe, expect, it } from "vitest";
import { CRATE_MASS } from "../data/goods";
import { makePart } from "../sim/factory";
import { addVehicle, emptyWorld, npcBrain } from "../sim/testkit";
import type { GridItem, Rot, World } from "../sim/types";
import { chassisDef } from "../data/chassis";
import { knockOutNpc } from "../sim/defeat";
import { corePart, findSpot, gridOf, MOUNT_CELLS } from "../sim/grid";
import { plannedTruck } from "../sim/inventory";
import { takeFromTruck } from "../sim/salvage";
import { refreshVision } from "../sim/vision";
import { resolve } from "../text/resolve";
import { itemLabel, itemName, itemState, nextRot, refitMarks, removalMarks, takenMarks, workMarkOf } from "./inventory-draw";
import { kg } from "./units";

const world = emptyWorld();
const item = (defId: string, rot: Rot): GridItem => ({ kind: "part", id: "i", x: 0, y: 0, rot, part: makePart(world, defId, 0) });
const crate = (good: string): GridItem => ({ id: good, x: 0, y: 0, rot: 0, kind: "good", good });

describe("goods cells", () => {
  it("say every good is a crate of the one crate mass", () => {
    for (const good of ["electronics", "tools"]) expect(resolve(itemState(crate(good), false), "en")).toBe(`Crate, ${resolve(kg(CRATE_MASS), "en")}`);
    expect(resolve(kg(CRATE_MASS), "en")).toBe("50 kg");
  });
});

describe("the parcel cell", () => {
  it("names a parcel and gives only its mass below the name", () => {
    const parcel: GridItem = { id: "p", x: 0, y: 0, rot: 0, kind: "parcel", contract: "ct" };
    expect(resolve(itemName(parcel), "en")).toBe("Parcel");
    expect(resolve(itemLabel(parcel).short, "en")).toBe("Parcel");
    expect(resolve(itemState(parcel, false), "en")).toBe("5 kg");
  });
});

describe("nextRot", () => {
  it("turns a gun through all four quarters", () => {
    const seen: Rot[] = [];
    let rot: Rot = 0;
    for (let i = 0; i < 4; i++) {
      rot = nextRot(item("mg", rot));
      seen.push(rot);
    }
    expect(seen).toEqual([1, 2, 3, 0]);
  });

  it("toggles any other part between 0 and 1", () => {
    expect(nextRot(item("stockEngine", 0))).toBe(1);
    expect(nextRot(item("stockEngine", 1))).toBe(0);
  });

  it("sends a non-gun at 2 or 3 back into the 0 and 1 toggle", () => {
    expect(nextRot(item("stockEngine", 2))).toBe(0);
    expect(nextRot(item("stockEngine", 3))).toBe(0);
  });
});

describe("the marks of a refit queue", () => {
  function queuedStrip() {
    const w = emptyWorld();
    w.vehicles[0].items = w.vehicles[0].items.filter((it) => it.kind !== "good");
    const gap = chassisDef("scout").radius + chassisDef("buggy").radius + 0.2;
    const raider = addVehicle(w, "scrapjaw", "buggy", ["mg", "stockEngine", "scrapSheet"], { x: 30 + gap, y: 30 });
    raider.brain = npcBrain("buggy", raider.pos, ["raider"]);
    corePart(raider, "cab").hp = 0;
    knockOutNpc(w, raider);
    refreshVision(w);
    let next = w;
    for (const defId of ["mg", "stockEngine", "scrapSheet"]) {
      const target = next.vehicles.find((v) => v.id === raider.id)!;
      const part = target.items.find((it) => it.kind === "part" && it.part.defId === defId)!;
      const planned = plannedTruck(next, next.vehicles[0]);
      const spot = findSpot(gridOf(planned), planned.items, { ...part, id: "probe" }, null, MOUNT_CELLS.weapon);
      if (!spot) throw new Error(`No spare spot for ${defId}`);
      next = takeFromTruck(next, raider.id, part.id, spot);
    }
    return { w: next, raider: next.vehicles.find((v) => v.id === raider.id)! };
  }

  const pickups = (w: World) => {
    const job = w.vehicles[0].job;
    if (job?.kind !== "refit") throw new Error("No refit");
    return [job, ...job.queue].map((step) => step.pickup!);
  };

  it("marks the part in progress as working and the queued parts as queued, on the player grid and the loot truck", () => {
    const { w, raider } = queuedStrip();
    const [head, ...queued] = pickups(w);
    const own = refitMarks(w, w.vehicles[0]);
    expect(own.get(head.itemId)).toBe("working");
    expect(queued.map((p) => own.get(p.itemId))).toEqual(["queued", "queued"]);
    const onTarget = removalMarks(w, raider);
    const itemOf = (partId: string) => raider.items.find((it) => it.kind === "part" && it.part.id === partId)!.id;
    expect(onTarget.get(itemOf(head.partId))).toBe("working");
    expect(queued.map((p) => onTarget.get(itemOf(p.partId)))).toEqual(["queued", "queued"]);
  });

  it("puts the progress meter only on the step in progress", () => {
    const { w } = queuedStrip();
    const [head] = pickups(w);
    expect(workMarkOf(w, w.vehicles[0])?.itemIds).toEqual(new Set([head.itemId]));
  });

  it("marks nothing while no refit runs", () => {
    const w = emptyWorld();
    expect(refitMarks(w, w.vehicles[0]).size).toBe(0);
    expect(takenMarks(w, []).size).toBe(0);
  });
});
