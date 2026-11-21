import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOUCH } from "../config";
import { playerVehicle } from "../sim/damage";
import { emptyWorld } from "../sim/testkit";
import type { World } from "../sim/types";
import type { UiHost } from "./host";
import { MapTab } from "./map-tab";

type Listener = (e: unknown) => void;

const canvas = vi.hoisted(() => {
  const listeners = new Map<string, (e: unknown) => void>();
  return {
    listeners,
    tagName: "canvas",
    addEventListener: (type: string, fn: (e: unknown) => void) => listeners.set(type, fn),
    setPointerCapture: () => {},
  };
});

const panned = vi.hoisted(() => ({ by: [] as [number, number][] }));

vi.mock("./map-view", () => ({
  MapView: class {
    canvas = canvas;
    reset() {}
    update() {}
    canZoomIn() { return true; }
    canZoomOut() { return true; }
    localPoint(x: number, y: number) { return { x, y }; }
    panBy(dx: number, dy: number) { panned.by.push([dx, dy]); }
    pick(x: number, y: number) { return { x: x + 100, y: y + 100 }; }
  },
  mapScene: () => ({}),
  poseOf: () => null,
  observeBox: () => {},
}));

class FakeElement {
  children: unknown[] = [];
  classList = { add: () => {}, remove: () => {} };
  append(...c: unknown[]) { this.children.push(...c); }
  setAttribute() {}
  addEventListener() {}
}

function fire(type: string, x: number, y: number, extra: object = {}): void {
  const handler = canvas.listeners.get(type) as Listener;
  handler({ pointerId: 1, clientX: x, clientY: y, shiftKey: false, ...extra });
}

function tab(world: World, playing = false) {
  const applied: World[] = [];
  const waiting: (() => void)[] = [];
  const host = { world: () => world, apply: (next: World) => applied.push(next), whenTurnEnds: (action: () => void) => (playing ? waiting.push(action) : action()) } as unknown as UiHost;
  new MapTab(host);
  return Object.assign(applied, { endTurn: () => waiting.splice(0).forEach((action) => action()) });
}

describe("map tab waypoint click", () => {
  beforeEach(() => {
    canvas.listeners.clear();
    panned.by = [];
    vi.stubGlobal("document", { createElement: () => new FakeElement(), createTextNode: (text: string) => ({ text }) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sets the move order where a click lands", () => {
    const world = emptyWorld();
    const applied = tab(world);
    fire("pointerdown", 10, 10);
    fire("pointerup", 12, 11);
    expect(applied).toHaveLength(1);
    expect(playerVehicle(applied[0]).order).toMatchObject({ kind: "through", dest: { x: 112, y: 111 } });
  });

  it("stops at the spot on shift click", () => {
    const applied = tab(emptyWorld());
    fire("pointerdown", 10, 10);
    fire("pointerup", 10, 10, { shiftKey: true });
    expect(playerVehicle(applied[0]).order?.kind).toBe("stopAt");
  });

  it("does not set an order after a drag, and pans instead", () => {
    const applied = tab(emptyWorld());
    fire("pointerdown", 10, 10);
    fire("pointermove", 10 + TOUCH.slopPx + 5, 10);
    fire("pointerup", 10 + TOUCH.slopPx + 5, 10);
    expect(applied).toHaveLength(0);
    expect(panned.by).toEqual([[TOUCH.slopPx + 5, 0]]);
  });

  it("does not set an order when a drag returns to its start", () => {
    const applied = tab(emptyWorld());
    fire("pointerdown", 10, 10);
    fire("pointermove", 10 + TOUCH.slopPx + 5, 10);
    fire("pointermove", 10, 10);
    fire("pointerup", 10, 10);
    expect(applied).toHaveLength(0);
  });

  it("sets the order when the turn ends, not while it plays", () => {
    const applied = tab(emptyWorld(), true);
    fire("pointerdown", 10, 10);
    fire("pointerup", 10, 10);
    expect(applied).toHaveLength(0);
    applied.endTurn();
    expect(applied).toHaveLength(1);
  });

  it("does nothing when the pointer is cancelled", () => {
    const applied = tab(emptyWorld());
    fire("pointerdown", 10, 10);
    fire("pointercancel", 10, 10);
    fire("pointerup", 10, 10);
    expect(applied).toHaveLength(0);
  });
});
