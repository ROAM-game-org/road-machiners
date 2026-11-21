import { adoptGroundBake, groundBakeFits, type GroundBake, type GroundBakeRequest } from "../render/groundPaint";
import { packedBuffers, packTerrain, type Terrain } from "../sim/terrain";
import { reportError } from "./crash";
import { readGroundCache, writeGroundCache } from "./ground-cache";
import { groundSide } from "./render/terrain";
import { workerFailure } from "./worker-load";

export type GroundBaking = { baked: Promise<void>; keep: () => void };

export type GroundBakerParts = {
  openWorker: () => Worker | null;
  readCache: (key: string) => Promise<GroundBake | null>;
  writeCache: (key: string, bake: GroundBake) => Promise<unknown>;
  useCache: boolean;
};

const REAL_PARTS: GroundBakerParts = {
  openWorker,
  readCache: readGroundCache,
  writeCache: writeGroundCache,
  useCache: !import.meta.env.DEV,
};

export function startGroundBaker(parts: GroundBakerParts = REAL_PARTS): (terrain: Terrain, key: string) => GroundBaking {
  return (terrain, key) => {
    const side = groundSide(terrain.size);
    let fresh: GroundBake | null = null;
    let kept = false;
    const writeFresh = (): void => {
      if (!fresh || kept) return;
      kept = true;
      void parts.writeCache(key, fresh);
    };
    const adopt = (bake: GroundBake | null): void => {
      if (bake && groundBakeFits(terrain, side, bake)) adoptGroundBake(terrain, bake);
      else if (bake) reportError(new Error("The ground bake does not fit the map"));
    };
    const bakeInWorker = (): Promise<void> =>
      new Promise((resolve) => {
        const worker = parts.openWorker();
        if (!worker) return resolve();
        let finished = false;
        const finish = (bake: GroundBake | null): void => {
          if (finished) return;
          finished = true;
          worker.terminate();
          fresh = bake;
          adopt(bake);
          resolve();
        };
        worker.onmessage = ({ data }: MessageEvent<GroundBake>) => finish(data);
        worker.onerror = (event) => {
          event.preventDefault();
          reportError(new Error(workerFailure("Ground worker", event)));
          finish(null);
        };
        worker.onmessageerror = () => {
          reportError(new Error("Could not read the ground worker response"));
          finish(null);
        };
        const packed = packTerrain({ ...terrain, routes: undefined });
        worker.postMessage({ terrain: packed, side } satisfies GroundBakeRequest, packedBuffers(packed));
      });
    const cached = parts.useCache ? parts.readCache(key).catch(() => null) : Promise.resolve(null);
    const baked = cached.then((hit) => {
      if (hit && groundBakeFits(terrain, side, hit)) return adopt(hit);
      return bakeInWorker();
    });
    return { baked, keep: writeFresh };
  };
}

function openWorker(): Worker | null {
  try {
    return new Worker(new URL("./render/ground-worker.ts", import.meta.url), { type: "module" });
  } catch (err) {
    reportError(err);
    return null;
  }
}
