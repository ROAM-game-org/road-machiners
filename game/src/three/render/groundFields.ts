import * as THREE from "three";
import { HIGHWAY } from "../../data/modes";
import { PHYSICS } from "../../data/physics";
import { REGION } from "../../data/region";
import { desertWeight, glassField, GROUND_MATERIAL_IDS, groundMaterialIndex, lookTypes, shownLooks, type PaintCanvas } from "../../render/groundPaint";
import { paintHighwayWear } from "../../render/highwayWear";
import { paintRoadDetail, paintRoadMask, paintRoadTone, regionRoadRuns, ROAD_DETAIL_SIDE, ROAD_TONE_PIXELS, ROAD_TONE_SIDE, type RoadHole, type RoadImage } from "../../render/roadPaint";
import { atlasOf, atlasSites } from "../../sim/atlas";
import { fromRoad } from "../../sim/highway";
import { windowCraters } from "../../sim/road-hazards";
import { sitePads, type Site } from "../../sim/sites";
import type { Terrain } from "../../sim/terrain";

const S = PHYSICS.metersPerTile;
const PIXEL_SPLIT = 3;
const PAD_BORDER = 2;
const ROAD_FIELD_REACH = 10;
const TILE_MATERIAL = 0;
const TILE_DESERT = 1;
const TILE_GLASS = 2;
export const TILE_LAYER = { tiles: 0, blockLead: 1, blockRest: 2 } as const;
const TILE_LAYERS = Object.keys(TILE_LAYER).length;
export const BLOCK_SIDE = 4;
export const BLOCK_SLOTS = 3;
export const BLOCK_COUNT_SHIFT = 5;

export type GroundFields = ReturnType<typeof groundFields>;

export function groundFields(mask: PaintCanvas, t: Terrain, shelters: readonly Site[], landforms: THREE.Texture | null) {
  paintRoadMask(mask, atlasOf(t), roadHoles(t));
  const pixel = S / mask.res / PIXEL_SPLIT;
  return {
    roadMask: { value: maskTexture(mask) },
    roadDetail: { value: imageTexture(paintRoadDetail(), THREE.NearestFilter, THREE.SRGBColorSpace) },
    roadTone: { value: imageTexture(paintRoadTone(), THREE.LinearFilter, THREE.NoColorSpace) },
    facetSide: { value: S },
    roadField: { value: roadFieldTexture(t) },
    heightSide: { value: t.size + 1 },
    groundTiles: { value: tileTexture(t) },
    groundTileSide: { value: t.size },
    groundTileMeters: { value: t.size * S },
    ...(landforms ? { groundLandforms: { value: landforms } } : {}),
    mapUvPerMeter: { value: mask.res / mask.size / S },
    roadOrigin: { value: mask.from * S },
    roadMaskMeters: { value: (mask.size / mask.res) * S },
    roadDetailMeters: { value: ROAD_DETAIL_SIDE * pixel },
    roadToneMeters: { value: ROAD_TONE_SIDE * ROAD_TONE_PIXELS * pixel },
    ...padUniforms([...atlasSites(atlasOf(t)), ...shelters], pixel),
    ...wearUniforms(mask, t),
  };
}

function roadHoles(t: Terrain): RoadHole[] {
  const key = t.atlas;
  if (key.kind !== "highway") return [];
  const inset = HIGHWAY.road.paint.holeInset;
  return windowCraters(key.seed, key.window).map((c) => ({ pos: fromRoad(key.seed, key.window, c.at.n, c.at.u), radius: Math.max(inset, c.radius - inset) }));
}

function tileTexture(t: Terrain): THREE.DataArrayTexture {
  const layer = t.size * t.size * 4;
  const data = new Uint8Array(layer * TILE_LAYERS);
  const shown = shownLooks(t);
  const look = lookTypes(t);
  const glass = glassField(t);
  const materials = Uint8Array.from(shown, groundMaterialIndex);
  for (let tile = 0; tile < shown.length; tile++) {
    data[tile * 4 + TILE_MATERIAL] = materials[tile];
    data[tile * 4 + TILE_DESERT] = Math.round(desertWeight(look[tile]) * 255);
    data[tile * 4 + TILE_GLASS] = glass[tile];
  }
  writeBlocks(materials, t.size, data.subarray(layer * TILE_LAYER.blockLead, layer * (TILE_LAYER.blockLead + 1)), data.subarray(layer * TILE_LAYER.blockRest));
  return linear(new THREE.DataArrayTexture(data, t.size, t.size, TILE_LAYERS));
}

export function writeBlocks(materials: Uint8Array, side: number, lead: Uint8Array, rest: Uint8Array): void {
  if (GROUND_MATERIAL_IDS.length > 1 << BLOCK_COUNT_SHIFT) throw new Error(`${GROUND_MATERIAL_IDS.length} ground materials do not fit the ${BLOCK_COUNT_SHIFT} id bits of a tile block`);
  const block = new Uint8Array(BLOCK_SIDE * BLOCK_SIDE);
  const slots = new Uint8Array(BLOCK_SLOTS + 1);
  const masks = new Uint16Array(BLOCK_SLOTS);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      gatherBlock(materials, side, x, y, block);
      const count = sortBlock(block, slots, masks);
      writeBlock(lead, rest, (y * side + x) * 4, count, slots, masks);
    }
}

function gatherBlock(materials: Uint8Array, side: number, x: number, y: number, block: Uint8Array): void {
  for (let j = 0; j < BLOCK_SIDE; j++) {
    const row = Math.min(side - 1, Math.max(0, y - 1 + j)) * side;
    for (let i = 0; i < BLOCK_SIDE; i++) block[j * BLOCK_SIDE + i] = materials[row + Math.min(side - 1, Math.max(0, x - 1 + i))];
  }
}

function sortBlock(block: Uint8Array, slots: Uint8Array, masks: Uint16Array): number {
  let count = 0;
  masks.fill(0);
  for (let k = 0; k < block.length && count <= BLOCK_SLOTS; k++) {
    let slot = slotOf(slots, count, block[k]);
    if (slot === count) slots[count++] = block[k];
    if (slot < BLOCK_SLOTS) masks[slot] |= 1 << k;
  }
  return count;
}

function slotOf(slots: Uint8Array, count: number, material: number): number {
  let slot = 0;
  while (slot < count && slots[slot] !== material) slot++;
  return slot;
}

function writeBlock(lead: Uint8Array, rest: Uint8Array, at: number, count: number, slots: Uint8Array, masks: Uint16Array): void {
  lead[at] = slots[0] | (count << BLOCK_COUNT_SHIFT);
  lead[at + 1] = count > 1 ? slots[1] : slots[0];
  lead[at + 2] = masks[0] & 0xff;
  lead[at + 3] = masks[0] >> 8;
  rest[at] = count > 2 ? slots[2] : slots[0];
  rest[at + 2] = masks[1] & 0xff;
  rest[at + 3] = masks[1] >> 8;
}

function roadFieldTexture(t: Terrain): THREE.DataTexture {
  const side = t.size + 1;
  const data = new Float32Array(side * side * 4);
  const nearest = new Float32Array(side * side).fill(Infinity);
  for (let i = 0; i < side * side; i++) {
    data[i * 4] = ROAD_FIELD_REACH * 2;
    data[i * 4 + 2] = ROAD_FIELD_REACH * 2;
    data[i * 4 + 3] = t.heights[i];
  }
  for (const run of regionRoadRuns(atlasOf(t))) markRun(run, side, data, nearest);
  return linear(new THREE.DataTexture(data, side, side, THREE.RGBAFormat, THREE.FloatType));
}

function markRun(run: readonly { x: number; y: number }[], side: number, data: Float32Array, nearest: Float32Array): void {
  let along = 0;
  run.forEach((p, n) => {
    const next = run[Math.min(n + 1, run.length - 1)];
    const last = run[Math.max(n - 1, 0)];
    const length = Math.hypot(next.x - last.x, next.y - last.y);
    const dir = { x: (next.x - last.x) / length, y: (next.y - last.y) / length };
    for (let y = Math.max(0, Math.floor(p.y - ROAD_FIELD_REACH)); y <= Math.min(side - 1, Math.ceil(p.y + ROAD_FIELD_REACH)); y++)
      for (let x = Math.max(0, Math.floor(p.x - ROAD_FIELD_REACH)); x <= Math.min(side - 1, Math.ceil(p.x + ROAD_FIELD_REACH)); x++) {
        const dx = x - p.x;
        const dy = y - p.y;
        const far = dx * dx + dy * dy;
        const k = y * side + x;
        if (far >= nearest[k]) continue;
        nearest[k] = far;
        data[k * 4] = Math.sqrt(far);
        data[k * 4 + 1] = along + dx * dir.x + dy * dir.y;
        data[k * 4 + 2] = dx * -dir.y + dy * dir.x;
      }
    if (n < run.length - 1) along += Math.hypot(next.x - p.x, next.y - p.y);
  });
}

function linear<T extends THREE.DataTexture | THREE.DataArrayTexture>(texture: T): T {
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function padUniforms(sites: readonly Site[], pixel: number) {
  const centers: THREE.Vector2[] = [];
  const axes: THREE.Vector2[] = [];
  for (const site of sites)
    for (const pad of sitePads(site)) {
      centers.push(new THREE.Vector2(pad.x * S, pad.y * S));
      axes.push(new THREE.Vector2(pad.x - site.pos.x, pad.y - site.pos.y).normalize());
    }
  const { length, width } = REGION.sites.pad;
  return {
    padCenters: { value: centers },
    padAxes: { value: axes },
    padHalf: { value: new THREE.Vector2((length / 2) * S, (width / 2) * S) },
    padBorder: { value: PAD_BORDER * pixel },
  };
}

function wearUniforms(mask: PaintCanvas, t: Terrain): { highwayWear?: { value: THREE.DataTexture } } {
  const key = t.atlas;
  if (key.kind !== "highway") return {};
  const pixels = paintHighwayWear(mask, atlasOf(t).roads[0].points, key.seed);
  const texture = new THREE.DataTexture(pixels, mask.size, mask.size, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return { highwayWear: { value: texture } };
}

function maskTexture(c: PaintCanvas): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(c.ctx.canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function imageTexture(image: RoadImage, filter: THREE.MagnificationTextureFilter, colorSpace: THREE.ColorSpace): THREE.DataTexture {
  const texture = new THREE.DataTexture(image.pixels, image.side, image.side, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = filter;
  texture.minFilter = filter === THREE.NearestFilter ? THREE.NearestMipmapNearestFilter : THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}
