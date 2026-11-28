import { afterEach, describe, expect, it, vi } from "vitest";
import { addVehicle, emptyWorld } from "../sim/testkit";
import type { World } from "../sim/types";
import { FakeNode, stubDom, ui } from "./inventory-fake-dom";
import { InventoryView } from "./inventory";

type Probe = { selectedItem: string | null; scale: { apply(key: string, layout: object, target: null): void } };

function damagedGunWorld(): { w: World; gunId: string } {
  const w = emptyWorld();
  addVehicle(w, "independent", "buggy", ["mg", "stockEngine"], { x: 5, y: 5 });
  const gun = w.vehicles[0].items.find((it) => it.kind === "part" && it.part.defId === "mg");
  if (!gun || gun.kind !== "part") throw new Error("The test truck has no gun");
  gun.part.hp = 1;
  return { w, gunId: gun.id };
}

function viewOver(w: World, gunId: string | null, shape: { bench: boolean; columns?: number; dump?: boolean }): FakeNode {
  stubDom();
  const host = { world: () => w, apply: () => {}, announce: () => {}, searchStock: () => {}, menuOpen: () => false, getTurnPhase: () => null } as never;
  const view = new InventoryView(host, () => {}, shape.dump ?? !shape.bench);
  if (shape.bench) view.setHead({ title: new FakeNode("h2") as never, close: new FakeNode("button") as never });
  const probe = view as unknown as Probe;
  if (shape.columns) probe.scale.apply("test", { columns: shape.columns, cargoBeside: false, pxPerMeter: 20, spareCellPx: 20 }, null);
  probe.selectedItem = gunId;
  return view.render() as unknown as FakeNode;
}

const named = (root: FakeNode, cls: string) => root.all((n) => n.className.split(" ").includes(cls));
const holderOf = (root: FakeNode, cls: string) => root.all((n) => n.children.some((c) => typeof c !== "string" && c.className === cls))[0];
const lastChild = (node: FakeNode) => node.children[node.children.length - 1];

describe("where an action's cost prints", () => {
  afterEach(() => {
    ui.children = [];
    vi.unstubAllGlobals();
  });

  it.each([3, 2])("puts the cost lines last in the details well of a %i-column bench, over the key strip", (columns) => {
    const { w, gunId } = damagedGunWorld();
    const root = viewOver(w, gunId, { bench: true, columns });
    const well = holderOf(root, "inv-costs");
    expect(well.className).toBe("well");
    expect(lastChild(well)).toBe(named(root, "inv-costs")[0]);
    expect(named(root.all((n) => n.className === "inv-foot")[0], "inv-keys").length).toBeGreaterThan(0);
  });

  it("puts the cost lines first on the side screen of a hosted truck column", () => {
    const { w, gunId } = damagedGunWorld();
    const root = viewOver(w, gunId, { bench: false });
    const side = holderOf(root, "inv-costs");
    expect(side.className).toContain("inv-side");
    expect(side.children[0]).toBe(named(root, "inv-costs")[0]);
  });

  it("prints a line for Patch, Rotate and Strip and none for the keys with nothing to say", () => {
    const { w, gunId } = damagedGunWorld();
    const root = viewOver(w, gunId, { bench: true });
    const lines = named(named(root, "inv-costs")[0], "inv-cost");
    expect(lines).toHaveLength(3);
    expect(named(root, "inv-keys").flatMap((k) => named(k, "cost"))).toHaveLength(0);
  });

  it("keeps the keys' data-action and leaves the cost lines empty when nothing is picked", () => {
    const { w, gunId } = damagedGunWorld();
    const root = viewOver(w, gunId, { bench: true });
    expect(root.all((n) => n.attrs.get("data-action") === "rotate").length).toBeGreaterThan(0);
    const idle = viewOver(w, null, { bench: true });
    expect(named(idle, "inv-costs")[0].children).toHaveLength(0);
  });
});

describe("the Dump key", () => {
  afterEach(() => {
    ui.children = [];
    vi.unstubAllGlobals();
  });

  const dumpKeys = (root: FakeNode) => named(root.all((n) => n.className === "inv-foot")[0], "inv-keys").flatMap((k) => k.all((n) => n.attrs.get("data-drop") === "dump"));
  const crateOf = (w: World) => w.vehicles[0].items.find((it) => it.kind === "good")!.id;

  it("holds its place in every state", () => {
    const { w, gunId } = damagedGunWorld();
    expect(dumpKeys(viewOver(w, null, { bench: true, dump: false }))).toHaveLength(0);
    expect(dumpKeys(viewOver(w, null, { bench: true, dump: true }))).toHaveLength(1);
    expect(dumpKeys(viewOver(w, gunId, { bench: true, dump: true }))).toHaveLength(1);
    expect(dumpKeys(viewOver(w, crateOf(w), { bench: true, dump: true }))).toHaveLength(1);
    w.vehicles[0].job = { kind: "repair", partId: gunId, parts: 1, turnsLeft: 3, total: 3 };
    expect(dumpKeys(viewOver(w, crateOf(w), { bench: true, dump: true }))).toHaveLength(1);
  });

  it("is last in the strip", () => {
    const { w } = damagedGunWorld();
    const foot = viewOver(w, null, { bench: true, dump: true }).all((n) => n.className === "inv-foot")[0];
    const keys = foot.all((n) => n.tag === "button");
    expect(keys.length).toBeGreaterThan(1);
    expect(keys[keys.length - 1].attrs.get("data-drop")).toBe("dump");
  });
});
