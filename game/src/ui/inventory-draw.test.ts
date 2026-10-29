import { describe, expect, it } from "vitest";
import { CRATE_MASS } from "../data/goods";
import { makePart } from "../sim/factory";
import { addVehicle, emptyWorld, npcBrain } from "../sim/testkit";
import type { GridItem, Rot, World } from "../sim/types";
import { chassisDef } from "../data/chassis";
import { knockOutNpc } from "../sim/defeat";
import { bareGrid, baseGrid, corePart, findSpot, gridOf, MOUNT_CELLS } from "../sim/grid";
import { plannedTruck } from "../sim/inventory";
import { takeFromTruck } from "../sim/salvage";
import { refreshVision } from "../sim/vision";
import { resolve } from "../text/resolve";
import { cellAt, drawnLayer, LAYERS_PER_BAND, gridMetrics, gridSize, itemLabel, itemName, itemState, nextRot, rectOf, refitMarks, removalMarks, takenMarks, workMarkOf } from "./inventory-draw";
import { cellCenter, cellSteps } from "../sim/body";
import { kg } from "./units";
import { backgroundNeeds, ownNeed, pivotPx, shownNeed, type GarageLook } from "./garage-draw";
import type { GarageSprite } from "../three/render/garageRender";
import { partDef } from "../data/parts";

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

const PX_PER_METER = 100;

describe("grid metrics", () => {
  it("draw a cell as many pixels as the truck has meters, so the truck keeps its proportions", () => {
    const m = gridMetrics("bus", baseGrid("bus"), PX_PER_METER);

    const steps = cellSteps("bus");

    expect(m.cellW).toBeCloseTo(steps.col * PX_PER_METER, 9);
    expect(m.cellH).toBeCloseTo(steps.row * PX_PER_METER, 9);
    expect(m.cellH / m.cellW).toBeGreaterThan(1.5);
  });

  it("put neighbouring cells as far apart in pixels as their centers are in meters", () => {
    const m = gridMetrics("scout", baseGrid("scout"), PX_PER_METER);
    const a = cellCenter("scout", 2, 2);
    const b = cellCenter("scout", 3, 4);

    const pa = rectOf(m, 2, 2, 1, 1);
    const pb = rectOf(m, 3, 4, 1, 1);

    expect(pb.left - pa.left).toBeCloseTo((b.z - a.z) * PX_PER_METER, 6);
    expect(pb.top - pa.top).toBeCloseTo((a.x - b.x) * PX_PER_METER, 6);
  });

  it("find the cell under every pixel inside a cell, on the truck and in the spare rows", () => {
    const g = bareGrid("longbed");
    const m = gridMetrics("longbed", g, PX_PER_METER);

    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        const r = rectOf(m, x, y, 1, 1);
        expect(cellAt(m, r.left + 1, r.top + 1)).toEqual({ x, y });
        expect(cellAt(m, r.left + r.width - 1, r.top + r.height - 1)).toEqual({ x, y });
      }
  });

  it("draw spare rows square, since they hold only icon tiles", () => {
    const g = bareGrid("longbed");
    const m = gridMetrics("longbed", g, PX_PER_METER);

    const spare = rectOf(m, 0, g.chassisH, 1, 1);

    expect(spare.height).toBeCloseTo(spare.width, 9);
  });

  it("leave a gap between the truck and its spare rows", () => {
    const g = bareGrid("longbed");
    const m = gridMetrics("longbed", g, PX_PER_METER);

    const lastTruckRow = rectOf(m, 0, g.chassisH - 1, 1, 1);
    const firstSpareRow = rectOf(m, 0, g.chassisH, 1, 1);

    expect(g.h).toBeGreaterThan(g.chassisH);
    expect(firstSpareRow.top - (lastTruckRow.top + lastTruckRow.height)).toBeCloseTo(m.spareGap, 6);
    expect(m.spareGap).toBeGreaterThan(0);
  });

  it("add no gap to a truck without spare rows", () => {
    const g = baseGrid("scout");

    const m = gridMetrics("scout", g, PX_PER_METER);

    expect(m.spareGap).toBe(0);
    expect(gridSize(m).height).toBeCloseTo(g.h * m.cellH, 9);
  });

  it("size the grid to hold its last row and column", () => {
    const g = bareGrid("semi");
    const m = gridMetrics("semi", g, PX_PER_METER);

    const corner = rectOf(m, g.w - 1, g.h - 1, 1, 1);

    expect(gridSize(m).width).toBeCloseTo(corner.left + corner.width, 9);
    expect(gridSize(m).height).toBeCloseTo(corner.top + corner.height, 9);
  });
});

describe("garage render needs", () => {
  function loadedScout() {
    const w = emptyWorld();
    const me = w.vehicles[0];
    return { w, me };
  }

  it("ask for every loose part of the player's truck at every spot it mounts on, and none of its built-in parts", () => {
    const { w, me } = loadedScout();

    const need = ownNeed(me, w.player.paint, []);

    const loose = me.items.filter((it) => it.kind === "part" && partDef(it.part.defId).kind !== "core");
    expect(loose.length).toBeGreaterThan(0);
    expect(need.parts.map((p) => p.part.id).sort()).toEqual(loose.map((it) => (it.kind === "part" ? it.part.id : "")).sort());
    for (const p of need.parts) expect(p.spots.length).toBeGreaterThan(0);
  });

  it("also ask for the parts the screen could drag onto the truck", () => {
    const { w, me } = loadedScout();
    const spare = makePart(w, "plates", 0);

    const need = ownNeed(me, w.player.paint, [{ id: "store-x", x: 0, y: 0, rot: 0, kind: "part", part: spare }]);

    expect(need.parts.some((p) => p.part.id === spare.id)).toBe(true);
  });

  it("ask only for the spots another truck's mounted parts stand on", () => {
    const { w, me } = loadedScout();

    const need = shownNeed(me, w.player.paint);

    for (const p of need.parts) {
      const it = me.items.find((x) => x.kind === "part" && x.part.id === p.part.id)!;
      expect(p.spots).toEqual([{ x: it.x, y: it.y, rot: it.rot }]);
    }
  });

  it("build the player's storage in the background with the truck", () => {
    const { w } = loadedScout();
    w.player.storage.push(makePart(w, "plates", 0));

    const needs = backgroundNeeds(w);

    expect(needs.flatMap((n) => n.parts).some((p) => p.part.id === w.player.storage[0].id)).toBe(true);
  });
});

describe("the garage grid's layers and marks", () => {
  const placedAt = (defId: string, x: number, y: number): GridItem => ({ ...item(defId, 0), x, y });
  const art = {} as HTMLElement;
  const z = (it: GridItem) => Number(/z-index:(\d+)/.exec(drawnLayer(it, art))![1]);

  it("draws a gun above an armor plate that reaches further down the truck", () => {
    expect(z(placedAt("mg", 0, 0))).toBeGreaterThan(z(placedAt("scrapSheet", 0, 20)));
  });

  it("keeps the fan above every part and under every gun", () => {
    expect(LAYERS_PER_BAND).toBeGreaterThan(z(placedAt("scrapSheet", 0, 40)));
    expect(z(placedAt("mg", 0, 0))).toBeGreaterThan(LAYERS_PER_BAND);
  });
});

describe("the pivot a fan starts from", () => {
  const sprite = (pivot: GarageSprite["pivot"]): GarageSprite => ({ url: "blob:x", left: 0, top: 0, width: 1, height: 1, pivot });
  const lookWith = (made: GarageSprite | null): { look: GarageLook; gun: GridItem } => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    const gun = me.items.find((it) => it.kind === "part" && partDef(it.part.defId).kind === "weapon")!;
    return { look: { renders: { sprite: () => made }, paint: w.player.paint, truck: me } as unknown as GarageLook, gun };
  };
  const m = gridMetrics("scout", gridOf(emptyWorld().vehicles[0]), 100);

  it("is the sprite's pivot in grid pixels", () => {
    const { look, gun } = lookWith(sprite({ x: 0.5, y: 1.25 }));
    expect(pivotPx(look, gun, m)).toEqual({ x: 50, y: 125 });
  });

  it("is missing for a gun drawn as a tile", () => {
    expect(pivotPx(null, lookWith(null).gun, m)).toBeNull();
    const { look, gun } = lookWith(null);
    expect(pivotPx(look, gun, m)).toBeNull();
  });

  it("throws for a drawn gun that carries no pivot", () => {
    const { look, gun } = lookWith(sprite(undefined));
    expect(() => pivotPx(look, gun, m)).toThrow(/no pivot/);
  });
});
