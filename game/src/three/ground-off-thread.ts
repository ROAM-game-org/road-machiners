import { adoptGroundBake, type GroundBake, type GroundBakeRequest } from "../render/groundPaint";
import type { Terrain } from "../sim/terrain";
import { reportError } from "./crash";
import { groundSide } from "./render/terrain";
import { workerFailure } from "./worker-load";

export function bakeGroundOffThread(terrain: Terrain): Promise<void> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./render/ground-worker.ts", import.meta.url), { type: "module" });
    const finish = (): void => {
      worker.terminate();
      resolve();
    };
    worker.onmessage = ({ data }: MessageEvent<GroundBake>) => {
      adoptGroundBake(terrain, data);
      finish();
    };
    worker.onerror = (event) => {
      event.preventDefault();
      reportError(new Error(workerFailure("Ground worker", event)));
      finish();
    };
    worker.onmessageerror = () => {
      reportError(new Error("Could not read the ground worker response"));
      finish();
    };
    worker.postMessage({ terrain: { ...terrain, routes: undefined }, side: groundSide(terrain.size) } satisfies GroundBakeRequest);
  });
}
