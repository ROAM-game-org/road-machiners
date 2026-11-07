import { bakeGround, type GroundBakeRequest } from "../../render/groundPaint";

const worker = self as unknown as Worker;

worker.onmessage = ({ data }: MessageEvent<GroundBakeRequest>) => {
  const ctx = new OffscreenCanvas(data.side, data.side).getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not get the ground bake canvas context");
  const bake = bakeGround(data.terrain, ctx as unknown as CanvasRenderingContext2D, data.side);
  worker.postMessage(bake, [bake.pixels.buffer, bake.glass.buffer]);
};
