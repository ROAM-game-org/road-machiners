import { adoptGroundBake, type GroundBake, type GroundBakeRequest } from "../render/groundPaint";
import type { Terrain } from "../sim/terrain";
import { reportError } from "./crash";
import { readGroundCache, writeGroundCache } from "./ground-cache";
import { groundSide } from "./render/terrain";
import { workerFailure } from "./worker-load";

export function startGroundBaker(): (terrain: Terrain, key: string) => Promise<void> {
  const worker = new Worker(new URL("./render/ground-worker.ts", import.meta.url), { type: "module" });
  return (terrain, key) =>
    new Promise((resolve) => {
      let finished = false;
      const finish = (bake: GroundBake | null): void => {
        if (finished) return;
        finished = true;
        worker.terminate();
        if (bake) adoptGroundBake(terrain, bake);
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
      worker.postMessage({ terrain: { ...terrain, routes: undefined }, side: groundSide(terrain.size) } satisfies GroundBakeRequest);
      if (import.meta.env.DEV) return;
      void readGroundCache(key).then((cached) => {
        if (cached) finish(cached);
      });
    });
}
