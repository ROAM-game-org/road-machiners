import * as THREE from "three";
import { HIGHWAY } from "../../data/modes";
import { PHYSICS } from "../../data/physics";
import { REGION } from "../../data/region";
import { desertWeight, glassField, groundMaterialIndex, lookTypes, shownLooks, type PaintCanvas } from "../../render/groundPaint";
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
const TILE_CALM = 3;
const CALM_MOST = 255;
const BEHIND = [[-1, -1], [0, -1], [1, -1], [-1, 0]] as const;
const AHEAD = [[1, 1], [0, 1], [-1, 1], [1, 0]] as const;

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

function tileTexture(t: Terrain): THREE.DataTexture {
  const data = new Uint8Array(t.size * t.size * 4);
  const shown = shownLooks(t);
  const look = lookTypes(t);
  const glass = glassField(t);
  const materials = Uint8Array.from(shown, groundMaterialIndex);
  const calm = calmTiles(materials, t.size);
  for (let tile = 0; tile < shown.length; tile++) {
    data[tile * 4 + TILE_MATERIAL] = materials[tile];
    data[tile * 4 + TILE_DESERT] = Math.round(desertWeight(look[tile]) * 255);
    data[tile * 4 + TILE_GLASS] = glass[tile];
    data[tile * 4 + TILE_CALM] = calm[tile];
  }
  return linear(new THREE.DataTexture(data, t.size, t.size, THREE.RGBAFormat));
}

export function calmTiles(materials: Uint8Array, side: number): Uint8Array {
  const calm = new Uint8Array(materials.length).fill(CALM_MOST);
  eachTile(side, false, (x, y) => {
    if (bordersOther(materials, side, x, y)) calm[y * side + x] = 1;
  });
  eachTile(side, false, (x, y) => calmFrom(calm, side, x, y, BEHIND));
  eachTile(side, true, (x, y) => calmFrom(calm, side, x, y, AHEAD));
  return calm;
}

function eachTile(side: number, backward: boolean, visit: (x: number, y: number) => void): void {
  for (let row = 0; row < side; row++)
    for (let column = 0; column < side; column++) visit(backward ? side - 1 - column : column, backward ? side - 1 - row : row);
}

function bordersOther(materials: Uint8Array, side: number, x: number, y: number): boolean {
  const own = materials[y * side + x];
  for (let j = Math.max(0, y - 1); j <= Math.min(side - 1, y + 1); j++)
    for (let i = Math.max(0, x - 1); i <= Math.min(side - 1, x + 1); i++) if (materials[j * side + i] !== own) return true;
  return false;
}

function calmFrom(calm: Uint8Array, side: number, x: number, y: number, steps: readonly (readonly [number, number])[]): void {
  for (const [i, j] of steps) {
    const xx = x + i;
    const yy = y + j;
    if (xx < 0 || yy < 0 || xx >= side || yy >= side) continue;
    calm[y * side + x] = Math.min(calm[y * side + x], calm[yy * side + xx] + 1);
  }
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

function linear(texture: THREE.DataTexture): THREE.DataTexture {
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
