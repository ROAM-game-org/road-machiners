import * as THREE from "three";
import { HIGHWAY } from "../../data/modes";
import { PHYSICS } from "../../data/physics";
import { REGION } from "../../data/region";
import { desertWeight, glassField, lookTypes, shownLooks, type LookType, type PaintCanvas } from "../../render/groundPaint";
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
const KIND_LAYERS = 3;
const DESERT_AT = 2;
const GLASS_AT = 2;

const KIND_CHANNEL: Record<LookType, number | null> = {
  hardpan: 0,
  saltCrust: 1,
  mud: 2,
  blackMud: 2,
  dirtyWater: 3,
  toxic: 3,
  canal: 3,
  gravel: 4,
  scree: 4,
  scrub: 5,
  field: 8,
  ash: 6,
  concrete: 7,
  asphalt: 0,
  sand: null,
  track: null,
  glass: null,
};

export type GroundFields = ReturnType<typeof groundFields>;

export function groundFields(mask: PaintCanvas, t: Terrain, shelters: readonly Site[]) {
  paintRoadMask(mask, atlasOf(t), roadHoles(t));
  const pixel = S / mask.res / PIXEL_SPLIT;
  return {
    roadMask: { value: maskTexture(mask) },
    roadDetail: { value: imageTexture(paintRoadDetail(), THREE.NearestFilter, THREE.SRGBColorSpace) },
    roadTone: { value: imageTexture(paintRoadTone(), THREE.LinearFilter, THREE.NoColorSpace) },
    facetSide: { value: S },
    roadField: { value: roadFieldTexture(t) },
    heightSide: { value: t.size + 1 },
    groundKinds: { value: kindTexture(t) },
    groundKindSide: { value: t.size },
    groundKindMeters: { value: t.size * S },
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

function kindTexture(t: Terrain): THREE.DataArrayTexture {
  const tiles = t.size * t.size;
  const data = new Uint8Array(tiles * 4 * KIND_LAYERS);
  shownLooks(t).forEach((look, tile) => {
    const channel = KIND_CHANNEL[look];
    if (channel !== null) data[(channel >> 2) * tiles * 4 + tile * 4 + (channel & 3)] = 255;
  });
  const look = lookTypes(t);
  const glass = glassField(t);
  for (let tile = 0; tile < tiles; tile++) {
    data[DESERT_AT * tiles * 4 + tile * 4 + 1] = Math.round(desertWeight(look[tile]) * 255);
    data[GLASS_AT * tiles * 4 + tile * 4 + 2] = glass[tile];
  }
  const texture = new THREE.DataArrayTexture(data, t.size, t.size, KIND_LAYERS);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
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
