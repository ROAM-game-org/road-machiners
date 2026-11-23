import { describe, expect, it, vi } from "vitest";
import type { GroundBake } from "../render/groundPaint";
import { packTypes } from "../sim/terrain";
import { TEST_MAP } from "../test/map";
import { startGroundBaker, type GroundBakerParts } from "./ground-off-thread";

vi.mock("../render/groundPaint", async (original) => ({
  ...(await original<typeof import("../render/groundPaint")>()),
  groundBakeFits: () => true,
  adoptGroundBake: vi.fn(),
}));

const bake = { pixels: new Uint8ClampedArray(4), glass: new Uint8Array(1), look: new Uint8Array(1) } as unknown as GroundBake;

class FakeWorker {
  posted: unknown[] = [];
  terminated = false;
  onmessage: ((event: { data: GroundBake }) => void) | null = null;
  postMessage(message: unknown): void {
    this.posted.push(message);
    queueMicrotask(() => this.onmessage?.({ data: bake }));
  }
  terminate(): void {
    this.terminated = true;
  }
}

const noStep = (): Promise<void> => Promise.resolve();

function parts(cached: GroundBake | null, useCache = true) {
  const workers: FakeWorker[] = [];
  const writes: string[] = [];
  const handed: unknown[] = [];
  const fake: GroundBakerParts = {
    openWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    },
    readCache: () => Promise.resolve(cached),
    writeCache: (key, written) => {
      writes.push(key);
      handed.push(written);
      return Promise.resolve();
    },
    useCache,
  };
  return { fake, workers, writes, written: handed };
}

describe("the ground baker", () => {
  it("sends the worker the tile types, size and atlas and no heights", async () => {
    const { fake, workers } = parts(null);

    await startGroundBaker(fake)(TEST_MAP.terrain, "k", noStep).baked;

    const request = workers[0].posted[0] as Record<string, unknown>;
    expect(Object.keys(request).sort()).toEqual(["atlas", "side", "size", "types"]);
    expect(request.size).toBe(TEST_MAP.terrain.size);
    expect(Array.from(request.types as Uint8Array)).toEqual(Array.from(packTypes(TEST_MAP.terrain.types)));
  });

  it("makes no worker for a bake the cache holds and writes nothing back", async () => {
    const { fake, workers, writes } = parts(bake);

    const baking = startGroundBaker(fake)(TEST_MAP.terrain, "k", noStep);
    await baking.baked;
    baking.keep();

    expect(workers).toHaveLength(0);
    expect(writes).toEqual([]);
  });

  it("bakes in one worker on a cache miss and writes the cache once, only when told to keep", async () => {
    const { fake, workers, writes, written } = parts(null);

    const baking = startGroundBaker(fake)(TEST_MAP.terrain, "k", noStep);
    await baking.baked;
    expect(writes).toEqual([]);
    baking.keep();
    baking.keep();

    expect(workers).toHaveLength(1);
    expect(workers[0].posted).toHaveLength(1);
    expect(workers[0].terminated).toBe(true);
    expect(writes).toEqual(["k"]);
    expect(written).toEqual([bake]);
  });

  it("keeps nothing when the worker could not bake", async () => {
    const { fake, writes } = parts(null);
    fake.openWorker = () => null;

    const baking = startGroundBaker(fake)(TEST_MAP.terrain, "k", noStep);
    await baking.baked;
    baking.keep();

    expect(writes).toEqual([]);
  });

  it("marks the cache read while the cache has not answered", async () => {
    const { fake } = parts(null);
    fake.readCache = () => new Promise(() => undefined);
    const steps: string[] = [];

    void startGroundBaker(fake)(TEST_MAP.terrain, "k", async (piece) => void steps.push(piece));
    await Promise.resolve();
    await Promise.resolve();

    expect(steps).toEqual(["reading the ground cache"]);
  });

  it("marks the bake only on a miss, and never on a hit", async () => {
    const miss: string[] = [];
    const missing = parts(null);
    missing.fake.openWorker = () => ({ postMessage: () => undefined, terminate: () => undefined }) as unknown as Worker;
    void startGroundBaker(missing.fake)(TEST_MAP.terrain, "k", async (piece) => void miss.push(piece));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(miss).toEqual(["reading the ground cache", "baking the ground"]);

    const hit: string[] = [];
    await startGroundBaker(parts(bake).fake)(TEST_MAP.terrain, "k", async (piece) => void hit.push(piece)).baked;
    expect(hit).toEqual(["reading the ground cache"]);
  });
});
