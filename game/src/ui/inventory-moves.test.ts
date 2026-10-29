import { describe, expect, it } from "vitest";
import { REGION } from "../data/region";
import { partDef } from "../data/parts";
import { makePart } from "../sim/factory";
import { gridOf, isMounted, itemCells, mountedParts, placementError } from "../sim/grid";
import { fieldMoveIsInstant, moveItem, mountPart, plannedRefitTurns, plannedVehicle, removeAllGoods, spareParts, startRefit, stowPart, stowSpot } from "../sim/inventory";
import { sitePads } from "../sim/sites";
import { emptyWorld } from "../sim/testkit";
import { update } from "../sim/world";
import type { GridItem, Rot, World } from "../sim/types";
import { DOUBLE_CLICK_MS, dragStartOf, doubleClickCommand, isDoubleClick, isRotateKey, needsHold, canFieldPatch, pickupTruck, planAfterMove, selectionAfterClick, touchGridTap, type ClickedItem } from "./inventory-moves";
import { emptyHidden } from "../sim/salvage";

const bowl = REGION.towns.find((t) => t.id === "bowl")!;
const gridClick = (item: GridItem): ClickedItem => ({ source: "grid", item, id: item.id, stockId: null, truckId: null });
const freeCargoSpots = (w: World, avoid: GridItem[] = []): { x: number; y: number; rot: Rot }[] => {
  const me = w.vehicles[0];
  const taken = new Set([...me.items, ...avoid].flatMap(itemCells).map((c) => `${c.x},${c.y}`));
  return gridOf(me).cells.flatMap((row, y) => row.flatMap((cell, x) => (cell === "." && !taken.has(`${x},${y}`) ? [{ x, y, rot: 0 as Rot }] : [])));
};
const partOf = (w: World, defId: string) => w.vehicles[0].items.find((it) => it.kind === "part" && it.part.defId === defId)!;

describe("click selection", () => {
  it("selects a clicked item", () => {
    expect(selectionAfterClick(null, "a")).toBe("a");
  });

  it("clears the selection when the selected item is clicked again", () => {
    expect(selectionAfterClick("a", "a")).toBeNull();
  });

  it("moves the selection to another clicked item", () => {
    expect(selectionAfterClick("a", "b")).toBe("b");
  });
});

describe("double click timing", () => {
  it("counts a second click on the same item inside the window", () => {
    expect(isDoubleClick({ id: "a", at: 1000 }, "a", 1000 + DOUBLE_CLICK_MS)).toBe(true);
  });

  it("ignores a slow second click", () => {
    expect(isDoubleClick({ id: "a", at: 1000 }, "a", 1001 + DOUBLE_CLICK_MS)).toBe(false);
  });

  it("ignores a click on another item and a first click", () => {
    expect(isDoubleClick({ id: "a", at: 1000 }, "b", 1001)).toBe(false);
    expect(isDoubleClick(null, "a", 1001)).toBe(false);
  });
});

describe("hold before drag", () => {
  it("asks a hold for installed parts only", () => {
    const w = emptyWorld();
    const spare = { ...partOf(w, "cage"), id: "spare", x: 0, y: 5 };
    stowPart(w, w.vehicles[0], makePart(w, "cage", 0));
    expect(needsHold("scout", partOf(w, "mg"))).toBe(true);
    expect(needsHold("scout", spare)).toBe(false);
    expect(needsHold("scout", w.vehicles[0].items.find((it) => it.kind === "good")!)).toBe(false);
  });
});

describe("double click in a garage", () => {
  it("uninstalls an installed part to storage at a stall", () => {
    const w = emptyWorld(sitePads(REGION.locations.find((l) => l.id === "pump-station")!)[0]);
    const next = doubleClickCommand(w, gridClick(partOf(w, "mg")))!(w);
    expect(next.player.storage.map((p) => p.defId)).toEqual(["mg"]);
  });

  it("uninstalls an installed part to storage", () => {
    const w = emptyWorld(sitePads(bowl)[0]);
    const cmd = doubleClickCommand(w, gridClick(partOf(w, "mg")))!;
    const next = cmd(w);
    expect(next.player.storage.map((p) => p.defId)).toEqual(["mg"]);
    expect(mountedParts(next.vehicles[0]).some((p) => p.defId === "mg")).toBe(false);
  });

  it("installs a spare part from the grid", () => {
    const w = emptyWorld(sitePads(bowl)[0]);
    removeAllGoods(w.vehicles[0]);
    stowPart(w, w.vehicles[0], makePart(w, "cage", 0));
    const spare = w.vehicles[0].items.filter((it) => it.kind === "part" && it.part.defId === "cage").find((it) => !isMounted("scout", it))!;
    const next = doubleClickCommand(w, gridClick(spare))!(w);
    expect(spareParts(next.vehicles[0])).toHaveLength(0);
  });

  it("installs a stored part on a free mount", () => {
    let w = emptyWorld(sitePads(bowl)[0]);
    w = update(w, (d) => { d.player.storage.push(makePart(d, "cage", 0)); });
    const part = w.player.storage[0];
    const chip: ClickedItem = { source: "storage", id: part.id, item: { id: `store-${part.id}`, x: 0, y: 0, rot: 0, kind: "part", part }, stockId: null, truckId: null };
    const next = doubleClickCommand(w, chip)!(w);
    expect(next.player.storage).toHaveLength(0);
    expect(mountedParts(next.vehicles[0]).filter((p) => p.defId === "cage")).toHaveLength(2);
  });

  it("does nothing for a part with no free mount", () => {
    let w = emptyWorld(sitePads(bowl)[0]);
    w = update(w, (d) => {
      d.player.storage.push(makePart(d, "cage", 0));
      while (mountPart(d, d.vehicles[0], makePart(d, "cage", 0)));
    });
    const part = w.player.storage[0];
    const chip: ClickedItem = { source: "storage", id: part.id, item: { id: `store-${part.id}`, x: 0, y: 0, rot: 0, kind: "part", part }, stockId: null, truckId: null };
    expect(doubleClickCommand(w, chip)).toBeNull();
  });

  it("does nothing for goods and built-in parts", () => {
    const w = emptyWorld(sitePads(bowl)[0]);
    const good = w.vehicles[0].items.find((it) => it.kind === "good")!;
    const core = w.vehicles[0].items.find((it) => it.kind === "part" && partDef(it.part.defId).kind === "core")!;
    expect(doubleClickCommand(w, gridClick(good))).toBeNull();
    expect(doubleClickCommand(w, gridClick(core))).toBeNull();
  });
});

describe("double click outside a garage", () => {
  it("does nothing on the truck grid in the field", () => {
    const w = emptyWorld();
    expect(doubleClickCommand(w, gridClick(partOf(w, "mg")))).toBeNull();
  });

  it("does nothing on the truck grid on a raider camp pad", () => {
    const w = emptyWorld(sitePads(REGION.locations.find((l) => l.id === "scrapjaw")!)[0]);
    expect(doubleClickCommand(w, gridClick(partOf(w, "mg")))).toBeNull();
  });

  it("moves a loot good into storage", () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.vehicles[0].items = w.vehicles[0].items.filter((it) => it.kind === "part");
    w.salvage.push({ id: "rich", pos: { x: 30, y: 30 }, radius: 1, goods: { scrap: 1 }, parts: [], hidden: emptyHidden() });
    w.player.scavenged.push("rich");
    const chip: ClickedItem = { source: "loot", id: "scrap", item: { id: "loot-scrap", x: 0, y: 0, rot: 0, kind: "good", good: "scrap" }, stockId: "rich", truckId: null };
    const next = doubleClickCommand(w, chip)!(w);
    expect(next.vehicles[0].items.filter((it) => it.kind === "good")).toHaveLength(1);
    expect(next.salvage.find((s) => s.id === "rich")!.goods.scrap).toBe(0);
  });

  it("moves a loot part into storage, never onto a mount", () => {
    const w = emptyWorld({ x: 30, y: 30 });
    removeAllGoods(w.vehicles[0]);
    const part = makePart(w, "cage", 0);
    w.salvage.push({ id: "rich", pos: { x: 30, y: 30 }, radius: 1, goods: {}, parts: [part], hidden: emptyHidden() });
    w.player.scavenged.push("rich");
    const chip: ClickedItem = { source: "loot", id: part.id, item: { id: `loot-${part.id}`, x: 0, y: 0, rot: 0, kind: "part", part }, stockId: "rich", truckId: null };
    const next = doubleClickCommand(w, chip)!(w);
    expect(next.vehicles[0].job).toBeNull();
    expect(spareParts(next.vehicles[0]).map((p) => p.id)).toContain(part.id);
  });

  it("does nothing when the loot does not fit", () => {
    const w = emptyWorld({ x: 30, y: 30 });
    while (stowPart(w, w.vehicles[0], makePart(w, "cage", 0)));
    const part = makePart(w, "cage", 0);
    w.salvage.push({ id: "rich", pos: { x: 30, y: 30 }, radius: 1, goods: {}, parts: [part], hidden: emptyHidden() });
    w.player.scavenged.push("rich");
    const chip: ClickedItem = { source: "loot", id: part.id, item: { id: `loot-${part.id}`, x: 0, y: 0, rot: 0, kind: "part", part }, stockId: "rich", truckId: null };
    expect(doubleClickCommand(w, chip)).toBeNull();
  });
});

describe("field refit plan", () => {
  it("moves and turns a part any number of times without starting a job", () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    const mg = partOf(w, "mg");
    const away = stowSpot(me, mg);
    if (!away) throw new Error("No storage room");
    const turned = { ...away, rot: ((away.rot + 2) % 4) as Rot };
    let plan = planAfterMove(me, {}, mg.id, away);
    plan = planAfterMove(me, plan, mg.id, turned);
    expect(plan).toEqual({ [mg.id]: turned });
    expect(plannedVehicle(me, plan).items.find((it) => it.id === mg.id)).toMatchObject(turned);
    expect(me.items.find((it) => it.id === mg.id)).toMatchObject({ x: mg.x, y: mg.y });
    expect(me.job).toBeNull();
  });

  it("drops a part from the plan when it returns to its start", () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    const mg = partOf(w, "mg");
    const away = stowSpot(me, mg);
    if (!away) throw new Error("No storage room");
    const plan = planAfterMove(me, {}, mg.id, away);
    expect(planAfterMove(me, plan, mg.id, { x: mg.x, y: mg.y, rot: mg.rot })).toEqual({});
  });

  it("turns a gun round in place and starts one job from the plan", () => {
    const w = emptyWorld();
    const mg = partOf(w, "mg");
    const plan = planAfterMove(w.vehicles[0], {}, mg.id, { x: mg.x, y: mg.y, rot: 2 });
    expect(plannedRefitTurns(w, w.vehicles[0], plan)).toBeGreaterThan(0);
    expect(startRefit(w, plan).vehicles[0].job).toMatchObject({ kind: "refit" });
  });

  it("refuses a move the sim refuses", () => {
    const w = emptyWorld();
    expect(() => planAfterMove(w.vehicles[0], {}, partOf(w, "mg").id, { x: 9, y: 0, rot: 0 })).toThrow();
  });
});

describe("instant field moves", () => {
  const crateOf = (w: World, nth: number) => {
    const crate = w.vehicles[0].items.filter((it) => it.kind === "good")[nth];
    if (!crate) throw new Error(`The scout holds no crate number ${nth}`);
    return crate;
  };

  it("moves a crate at once and starts no job", () => {
    const w = emptyWorld();
    const freeCargo = freeCargoSpots(w)[0];
    const crate = crateOf(w, 1);
    expect(fieldMoveIsInstant(w.vehicles[0], {}, crate.id, freeCargo)).toBe(true);
    const next = moveItem(w, crate.id, freeCargo);
    expect(next.vehicles[0].items.find((it) => it.id === crate.id)).toMatchObject(freeCargo);
    expect(next.vehicles[0].job).toBeNull();
  });

  it("swaps two crates at once", () => {
    const w = emptyWorld();
    const a = crateOf(w, 0);
    const b = crateOf(w, 1);
    expect(fieldMoveIsInstant(w.vehicles[0], {}, a.id, { x: b.x, y: b.y, rot: 0 })).toBe(true);
  });

  it("keeps a mounted gun move as a plan", () => {
    const w = emptyWorld();
    const mg = partOf(w, "mg");
    const away = stowSpot(w.vehicles[0], mg)!;
    expect(fieldMoveIsInstant(w.vehicles[0], {}, mg.id, away)).toBe(false);
  });

  it("keeps a crate move onto a mount a planned gun leaves as a plan edit", () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    const mg = partOf(w, "mg");
    const plan = planAfterMove(me, {}, mg.id, stowSpot(me, mg)!);
    const crate = crateOf(w, 1);
    expect(fieldMoveIsInstant(me, plan, crate.id, { x: mg.x, y: mg.y, rot: 0 })).toBe(false);
  });

  it("keeps the plan valid after an instant crate move", () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    const mg = partOf(w, "mg");
    const away = stowSpot(me, mg)!;
    const plan = planAfterMove(me, {}, mg.id, away);
    const crate = crateOf(w, 1);
    const spot = freeCargoSpots(w, [{ ...mg, ...away }])[0];
    expect(fieldMoveIsInstant(me, plan, crate.id, spot)).toBe(true);
    const next = moveItem(w, crate.id, spot).vehicles[0];
    expect(plannedVehicle(next, plan).items.find((it) => it.id === mg.id)).toMatchObject(away);
    expect(next.job).toBeNull();
  });
});

describe("pickups with a plan pending", () => {
  const scrap = (id: string, x: number, y: number): GridItem => ({ id, x, y, rot: 0, kind: "good", good: "scrap" });
  const problemAt = (truck: ReturnType<typeof pickupTruck>, item: GridItem) =>
    placementError(gridOf({ ...truck, items: [...truck.items, item] }), truck.items, item, null);

  it("returns the real truck with an empty plan", () => {
    const w = emptyWorld();
    expect(pickupTruck(w.vehicles[0], {})).toBe(w.vehicles[0]);
  });

  it("refuses cells taken in the drawn layout or still held in the real one", () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    const mg = partOf(w, "mg");
    const away = stowSpot(me, mg)!;
    const plan = planAfterMove(me, {}, mg.id, away);
    const truck = pickupTruck(me, plan);
    expect(problemAt(truck, scrap("n1", away.x, away.y))).not.toBeNull();
    expect(problemAt(truck, scrap("n2", mg.x, mg.y))).not.toBeNull();
    const open = freeCargoSpots(w, [{ ...mg, ...away }])[0];
    expect(problemAt(truck, scrap("n3", open.x, open.y))).toBeNull();
    expect(me.items.some((it) => it.id.startsWith("planned:"))).toBe(false);
  });

  it("picks a stow spot free in both layouts for a double click", () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    const mg = partOf(w, "mg");
    const plan = planAfterMove(me, {}, mg.id, stowSpot(me, mg)!);
    const truck = pickupTruck(me, plan);
    const spot = stowSpot(truck, scrap("n4", 0, 0))!;
    expect(problemAt(truck, { ...scrap("n4", 0, 0), ...spot })).toBeNull();
  });
});

describe("dragStartOf", () => {
  it("holds a touch on any item", () => {
    expect(dragStartOf("touch", false)).toBe("hold");
    expect(dragStartOf("touch", true)).toBe("hold");
  });

  it("holds a mouse only on a mounted part", () => {
    expect(dragStartOf("mouse", false)).toBe("now");
    expect(dragStartOf("mouse", true)).toBe("hold");
  });
});

describe("field patch gate", () => {
  it("offers a patch only for parts mounted on the real truck", () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    const cage = makePart(w, "cage", 0);
    stowPart(w, me, cage);
    expect(canFieldPatch(me, true, cage.id)).toBe(false);
    const mg = partOf(w, "mg");
    if (mg.kind !== "part") throw new Error("mg is not a part");
    expect(canFieldPatch(me, true, mg.part.id)).toBe(true);
    expect(canFieldPatch(me, false, mg.part.id)).toBe(false);
  });
});

describe("touch tap on the grid", () => {
  const two = { w: 2, h: 1 };

  it("previews the selected item centered on the tapped cell", () => {
    expect(touchGridTap(null, { x: 3, y: 4 }, { w: 3, h: 3 })).toEqual({ kind: "preview", at: { x: 2, y: 3 } });
  });

  it("previews with the footprint's first cell on the tap for an item two cells wide", () => {
    expect(touchGridTap(null, { x: 3, y: 4 }, two)).toEqual({ kind: "preview", at: { x: 3, y: 4 } });
  });

  it("places on a tap inside the preview, also on its far cell", () => {
    expect(touchGridTap({ x: 2, y: 2 }, { x: 2, y: 2 }, two)).toEqual({ kind: "place" });
    expect(touchGridTap({ x: 2, y: 2 }, { x: 3, y: 2 }, two)).toEqual({ kind: "place" });
  });

  it("moves the preview on a tap outside it", () => {
    expect(touchGridTap({ x: 2, y: 2 }, { x: 4, y: 2 }, two)).toEqual({ kind: "preview", at: { x: 4, y: 2 } });
  });

  it("follows a turned footprint", () => {
    const turned = { w: 1, h: 2 };
    expect(touchGridTap({ x: 2, y: 2 }, { x: 3, y: 2 }, turned)).toEqual({ kind: "preview", at: { x: 3, y: 2 } });
    expect(touchGridTap({ x: 2, y: 2 }, { x: 2, y: 3 }, turned)).toEqual({ kind: "place" });
  });
});

describe("isRotateKey", () => {
  const press = (over: Partial<KeyboardEvent>) => ({ code: "KeyR", repeat: false, ctrlKey: false, metaKey: false, altKey: false, ...over });

  it("accepts the physical R key whatever character it types", () => {
    expect(isRotateKey(press({}))).toBe(true);
  });

  it("ignores other physical keys, repeats and chords", () => {
    expect(isRotateKey(press({ code: "KeyT" }))).toBe(false);
    expect(isRotateKey(press({ repeat: true }))).toBe(false);
    expect(isRotateKey(press({ ctrlKey: true }))).toBe(false);
  });
});
