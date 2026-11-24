import { bakeGround, type GroundBakeRequest } from "../../render/groundPaint";
import { unpackTypes, type GroundTiles } from "../../sim/terrain";

const worker = self as unknown as Worker;

worker.onmessage = ({ data }: MessageEvent<GroundBakeRequest>) => {
  const { size, atlas, types: codes, side } = data;
  const tiles: GroundTiles = Object.freeze({ size, atlas, types: unpackTypes(codes, size) });
  const ctx = new OffscreenCanvas(side, side).getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not get the ground bake canvas context");
  const bake = bakeGround(tiles, ctx as unknown as CanvasRenderingContext2D, side);
  worker.postMessage(bake, [bake.pixels.buffer, bake.glass.buffer, bake.look.buffer]);
};
