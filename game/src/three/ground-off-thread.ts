import { adoptGroundBake, type GroundBake, type GroundBakeRequest } from "../render/groundPaint";
import type { Terrain } from "../sim/terrain";
import { reportError } from "./crash";
import { readGroundCache, writeGroundCache } from "./ground-cache";
import { groundSide } from "./render/terrain";
import { workerFailure } from "./worker-load";

function bakeOn(worker: Worker, terrain: Terrain, key: string): Promise<void> {
  return new Promise((resolve) => {
    worker.onmessage = ({ data }: MessageEvent<GroundBake>) => {
      void writeGroundCache(key, data);
      adoptGroundBake(terrain, data);
      resolve();
    };
    worker.onerror = (event) => {
      event.preventDefault();
      reportError(new Error(workerFailure("Ground worker", event)));
      resolve();
    };
    worker.onmessageerror = () => {
      reportError(new Error("Could not read the ground worker response"));
      resolve();
    };
    worker.postMessage({ terrain: { ...terrain, routes: undefined }, side: groundSide(terrain.size) } satisfies GroundBakeRequest);
  });
}

export function startGroundBaker(): (terrain: Terrain, key: string) => Promise<void> {
  const worker = new Worker(new URL("./render/ground-worker.ts", import.meta.url), { type: "module" });
  return async (terrain, key) => {
    const cached = import.meta.env.DEV ? null : await readGroundCache(key);
    if (cached) adoptGroundBake(terrain, cached);
    else await bakeOn(worker, terrain, key);
    worker.terminate();
  };
}
