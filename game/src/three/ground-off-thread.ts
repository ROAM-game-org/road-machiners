import { adoptGroundBake, groundBakeFits, type GroundBake, type GroundBakeRequest } from "../render/groundPaint";
import type { Terrain } from "../sim/terrain";
import { reportError } from "./crash";
import { readGroundCache, writeGroundCache } from "./ground-cache";
import { groundSide } from "./render/terrain";
import { workerFailure } from "./worker-load";

export function startGroundBaker(): (terrain: Terrain, key: string) => Promise<void> {
  const worker = openWorker();
  return (terrain, key) =>
    new Promise((resolve) => {
      if (!worker) return resolve();
      const side = groundSide(terrain.size);
      let finished = false;
      const finish = (bake: GroundBake | null): void => {
        if (finished) return;
        finished = true;
        worker.terminate();
        if (bake && groundBakeFits(terrain, side, bake)) adoptGroundBake(terrain, bake);
        else if (bake) reportError(new Error("The ground bake does not fit the map"));
        resolve();
      };
      worker.onmessage = ({ data }: MessageEvent<GroundBake>) => {
        void writeGroundCache(key, data);
        finish(data);
      };
      worker.onerror = (event) => {
        event.preventDefault();
        reportError(new Error(workerFailure("Ground worker", event)));
        finish(null);
      };
      worker.onmessageerror = () => {
        reportError(new Error("Could not read the ground worker response"));
        finish(null);
      };
      worker.postMessage({ terrain: { ...terrain, routes: undefined }, side } satisfies GroundBakeRequest);
      if (import.meta.env.DEV) return;
      void readGroundCache(key).then((cached) => {
        if (cached && groundBakeFits(terrain, side, cached)) finish(cached);
      });
    });
}

function openWorker(): Worker | null {
  try {
    return new Worker(new URL("./render/ground-worker.ts", import.meta.url), { type: "module" });
  } catch (err) {
    reportError(err);
    return null;
  }
}
