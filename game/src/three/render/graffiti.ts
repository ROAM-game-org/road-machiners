import * as THREE from 'three';
import { PHYSICS } from '../../data/physics';
import { hash2, hashStr, valueNoise } from '../../render/noise';
import { PAL } from '../../render/palette';
import { SIGN_STAGES, signPaths, type SignStage } from '../../render/sign';
import { isBreakable, propReach } from '../../sim/mapgen';
import { ObstacleBuckets } from '../../sim/nav/buckets';
import { groundAt, groundSlope, type Terrain } from '../../sim/terrain';
import type { Obstacle, World } from '../../sim/types';
import { dist, type Vec } from '../../sim/vec';
import { buildProp } from './obstacles';
import type { Rect, RenderScope } from './scope';
import { chunkGeometry } from './terrain';

const S = PHYSICS.metersPerTile;

export const GRAFFITI = {
  tilesPerSign: 7200,
  minGapTiles: 30,
  regionTiles: 96,
  propShare: 0.5,
  steepSlope: 0.9,
  edgeTiles: 8,
  camera: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  facesCamera: 0.35,
  fade: { min: 0.7, max: 0.95 },
  variants: 2,
} as const;

export const GRAFFITI_PROP_LOOKS: ReadonlySet<string> = new Set(['crag', 'house', 'silo', 'shack', 'farmhouse', 'barn', 'bunker', 'scrapWall']);

const CELL = 256;
const CELL_PAD = 24;
const SPRAY_BLUR = 3;
const SPRAY_DRIFT = 0.7;
const SPRAY_SECOND_PASS = 0.5;
const PATCH_SCALE = 9;
const FLAKE_SCALE = 2.5;
const STREAK_WIDTH = 1.5;
const STREAK_LENGTH = 40;
const WEAR_FROM = 0.22;
const WEAR_TO = 0.46;
const ANISOTROPY = 8;
const OFFSET_UNITS = -4;
const IN_FRONT_MARGIN = 1;
const SHADE_LIFT = 0x4a4a4a;
const NIGHT_SHARE = 0.4;
const NIGHT_SUN = 0.7;
const DAY_SUN = 2.2;

export const SIGN_SIZES = [8, 6, 4.5, 3.5];
export const PAINTED_STAGES: SignStage[] = SIGN_STAGES.filter((stage) => stage !== 'exodus');
export const GRID = 8;
const LIFT = 0.04;
const PROBE = 1.5;
const DEPTH_TOLERANCE = 0.1;
const SAME_FACE = 0.8;
const VIEW = new THREE.Vector3(1, 0.816, 1).normalize();
const FACES_VIEWER = 0.45;
const SEEN_BY_VIEWER = 0.2;
const WALL_UP = { min: -0.25, max: 0.76 };
const CLIFF_REACH_TILES = 3;
const CLIFF_WINDOW = 5;
const PROP_DIRECTIONS = 16;
const PROP_LEVELS = [0.5, 0.35, 0.65];
const PROP_STANDOFF = 2;
const PROBE_POINTS = [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1]];

export type GraffitiPaint = { stage: SignStage; color: number; fade: number; variant: number };

export type GraffitiSite = {
  id: string;
  pos: Vec;
  priority: number;
  paint: GraffitiPaint;
  face: Vec | null;
  obstacle: Obstacle | null;
};

export type GraffitiSites = { props: GraffitiSite[]; cliffs: GraffitiSite[] };
export type GraffitiPlaced<F> = { site: GraffitiSite; fit: F };

export type SignFit = {
  size: number;
  center: THREE.Vector3;
  normal: THREE.Vector3;
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
};

export function facesCamera(direction: Vec): boolean {
  return direction.x * GRAFFITI.camera.x + direction.y * GRAFFITI.camera.y >= GRAFFITI.facesCamera;
}

export function graffitiTarget(size: number): number {
  return Math.max(1, Math.floor((size * size) / GRAFFITI.tilesPerSign));
}

function paintOf(id: string): GraffitiPaint {
  const colors = PAL.graffiti;
  return {
    stage: PAINTED_STAGES[Math.floor(hashStr(`${id}:stage`) * PAINTED_STAGES.length)],
    color: colors[Math.floor(hashStr(`${id}:color`) * colors.length)],
    fade: GRAFFITI.fade.min + hashStr(`${id}:fade`) * (GRAFFITI.fade.max - GRAFFITI.fade.min),
    variant: Math.floor(hashStr(`${id}:variant`) * GRAFFITI.variants),
  };
}

function isGraffitiProp(o: Obstacle): boolean {
  return o.kind === 'landmark' && GRAFFITI_PROP_LOOKS.has(o.look) && !isBreakable(o) && /^[a-zA-Z]+-\d+$/.test(o.id);
}

export type GraffitiRegion = { index: number; rect: Rect; target: number };

export function graffitiRegions(size: number): GraffitiRegion[] {
  const side = GRAFFITI.regionTiles;
  if (side < 2 * GRAFFITI.minGapTiles) throw new Error(`Graffiti regions of ${side} tiles cannot keep signs ${GRAFFITI.minGapTiles} tiles apart`);
  const regions: GraffitiRegion[] = [];
  let area = 0;
  for (let y0 = 0; y0 < size; y0 += side)
    for (let x0 = 0; x0 < size; x0 += side) {
      const rect = { x0, y0, x1: Math.min(size, x0 + side), y1: Math.min(size, y0 + side) };
      const before = Math.floor(area / GRAFFITI.tilesPerSign);
      area += (rect.x1 - rect.x0) * (rect.y1 - rect.y0);
      regions.push({ index: regions.length, rect, target: Math.floor(area / GRAFFITI.tilesPerSign) - before });
    }
  return regions;
}

function within(rect: Rect, p: Vec): boolean {
  const keep = GRAFFITI.minGapTiles / 2;
  return p.x - rect.x0 >= keep && rect.x1 - p.x >= keep && p.y - rect.y0 >= keep && rect.y1 - p.y >= keep;
}

function bySitePriority(a: GraffitiSite, b: GraffitiSite): number {
  return b.priority - a.priority || (a.id < b.id ? -1 : 1);
}

export class GraffitiCandidates {
  private readonly props: GraffitiSite[];

  constructor(private readonly terrain: Terrain, obstacles: readonly Obstacle[]) {
    this.props = obstacles.filter(isGraffitiProp).map((o) => ({ id: o.id, pos: o.pos, priority: hashStr(`${o.id}:pick`), paint: paintOf(o.id), face: null, obstacle: o }));
  }

  sitesIn(region: GraffitiRegion): GraffitiSites {
    return { props: this.props.filter((s) => within(region.rect, s.pos)).sort(bySitePriority), cliffs: this.cliffsIn(region.rect).sort(bySitePriority) };
  }

  private cliffsIn(rect: Rect): GraffitiSite[] {
    const t = this.terrain;
    const sites: GraffitiSite[] = [];
    const edge = GRAFFITI.edgeTiles;
    for (let y = Math.max(edge, rect.y0); y < Math.min(t.size - edge, rect.y1); y++)
      for (let x = Math.max(edge, rect.x0); x < Math.min(t.size - edge, rect.x1); x++) {
        const pos = { x: x + 0.5, y: y + 0.5 };
        if (!within(rect, pos)) continue;
        const slope = groundSlope(t, y * t.size + x);
        const steep = Math.hypot(slope.x, slope.y);
        const face = { x: -slope.x / steep, y: -slope.y / steep };
        if (steep < GRAFFITI.steepSlope || !facesCamera(face)) continue;
        const id = `cliff-${x}-${y}`;
        sites.push({ id, pos, priority: hash2(x, y), paint: paintOf(id), face, obstacle: null });
      }
    return sites;
  }
}

export function chooseRegionGraffiti<F>(region: GraffitiRegion, sites: GraffitiSites, fit: (site: GraffitiSite) => F | null): GraffitiPlaced<F>[] {
  const placed: GraffitiPlaced<F>[] = [];
  const fill = (list: readonly GraffitiSite[], count: number) => {
    for (const site of list) {
      if (placed.length >= count) return;
      if (placed.some((p) => dist(p.site.pos, site.pos) < GRAFFITI.minGapTiles)) continue;
      const found = fit(site);
      if (found !== null) placed.push({ site, fit: found });
    }
  };
  fill(sites.props, Math.round(region.target * GRAFFITI.propShare));
  fill(sites.cliffs, region.target);
  return placed;
}

type Hit = { point: THREE.Vector3; normal: THREE.Vector3 };
type Frame = { first: Hit; up: THREE.Vector3; right: THREE.Vector3 };

const raycaster = new THREE.Raycaster();
const normalMatrix = new THREE.Matrix3();

function cast(target: THREE.Object3D, origin: THREE.Vector3, direction: THREE.Vector3, far: number): Hit | null {
  raycaster.set(origin, direction);
  raycaster.far = far;
  const hit = raycaster.intersectObject(target, true)[0];
  if (!hit?.face) return null;
  const normal = hit.face.normal.clone().applyNormalMatrix(normalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize();
  return normal.dot(direction) < 0 ? { point: hit.point, normal } : null;
}

function isWall(n: THREE.Vector3): boolean {
  return n.dot(VIEW) >= FACES_VIEWER && n.y >= WALL_UP.min && n.y <= WALL_UP.max;
}

function frameOf(first: Hit): Frame {
  const n = first.normal;
  const up = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
  return { first, up, right: new THREE.Vector3().crossVectors(up, n) };
}

function sampleAt(target: THREE.Object3D, frame: Frame, size: number, u: number, v: number): Hit | null {
  const n = frame.first.normal;
  const at = frame.first.point.clone().addScaledVector(frame.right, (u - 0.5) * size).addScaledVector(frame.up, (0.5 - v) * size);
  const probe = at.clone().addScaledVector(n, PROBE);
  const found = cast(target, probe, n.clone().negate(), PROBE * 2);
  if (!found || Math.abs(probe.distanceTo(found.point) - PROBE) > DEPTH_TOLERANCE * size) return null;
  return found.normal.dot(n) >= SAME_FACE && found.normal.dot(VIEW) >= SEEN_BY_VIEWER ? found : null;
}

function sampleGrid(target: THREE.Object3D, frame: Frame, size: number): Hit[] | null {
  if (!PROBE_POINTS.every(([u, v]) => sampleAt(target, frame, size, u, v))) return null;
  const hits: Hit[] = [];
  for (let j = 0; j <= GRID; j++)
    for (let i = 0; i <= GRID; i++) {
      const found = sampleAt(target, frame, size, i / GRID, j / GRID);
      if (!found) return null;
      hits.push(found);
    }
  return hits;
}

function buildFit(frame: Frame, hits: Hit[], size: number): SignFit {
  const fit: SignFit = { size, center: frame.first.point.clone(), normal: frame.first.normal.clone(), positions: [], normals: [], uvs: [], indices: [] };
  hits.forEach((h, k) => {
    const p = h.point.clone().addScaledVector(h.normal, LIFT);
    fit.positions.push(p.x, p.y, p.z);
    fit.normals.push(h.normal.x, h.normal.y, h.normal.z);
    fit.uvs.push((k % (GRID + 1)) / GRID, Math.floor(k / (GRID + 1)) / GRID);
  });
  for (let j = 0; j < GRID; j++)
    for (let i = 0; i < GRID; i++) {
      const a = j * (GRID + 1) + i;
      fit.indices.push(a, a + GRID + 1, a + 1, a + 1, a + GRID + 1, a + GRID + 2);
    }
  return fit;
}

function fitAt(target: THREE.Object3D, origin: THREE.Vector3, direction: THREE.Vector3, far: number, size: number): SignFit | null {
  const first = cast(target, origin, direction, far);
  if (!first || !isWall(first.normal)) return null;
  const frame = frameOf(first);
  const hits = sampleGrid(target, frame, size);
  return hits && buildFit(frame, hits, size);
}

function cliffTarget(t: Terrain, pos: Vec): THREE.Mesh {
  const x0 = Math.max(0, Math.min(t.size - 2 * CLIFF_WINDOW, Math.floor(pos.x) - CLIFF_WINDOW));
  const y0 = Math.max(0, Math.min(t.size - 2 * CLIFF_WINDOW, Math.floor(pos.y) - CLIFF_WINDOW));
  const mesh = new THREE.Mesh(chunkGeometry(t, x0, y0, 2 * CLIFF_WINDOW, 2 * CLIFF_WINDOW), new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld(true);
  return mesh;
}

function fitCliff(t: Terrain, site: GraffitiSite): SignFit | null {
  const face = site.face;
  if (!face) throw new Error(`Cliff site ${site.id} has no face`);
  const low = groundAt(t, site.pos.x + face.x * CLIFF_REACH_TILES, site.pos.y + face.y * CLIFF_REACH_TILES);
  const high = groundAt(t, site.pos.x - face.x * CLIFF_REACH_TILES, site.pos.y - face.y * CLIFF_REACH_TILES);
  const origin = new THREE.Vector3((site.pos.x + face.x * CLIFF_REACH_TILES) * S, ((low + high) / 2) * S, (site.pos.y + face.y * CLIFF_REACH_TILES) * S);
  const direction = new THREE.Vector3(-face.x, 0, -face.y);
  const target = cliffTarget(t, site.pos);
  const fits = SIGN_SIZES.map((size) => () => fitAt(target, origin, direction, CLIFF_REACH_TILES * 2 * S, size));
  try {
    return firstFit(fits);
  } finally {
    target.geometry.dispose();
    (target.material as THREE.Material).dispose();
  }
}

function firstFit(tries: readonly (() => SignFit | null)[]): SignFit | null {
  for (const attempt of tries) {
    const fit = attempt();
    if (fit) return fit;
  }
  return null;
}

function propDirections(site: GraffitiSite): Vec[] {
  const turn = hashStr(`${site.id}:turn`) * ((Math.PI * 2) / PROP_DIRECTIONS);
  return Array.from({ length: PROP_DIRECTIONS }, (_, k) => ({ x: Math.cos(turn + (k * Math.PI * 2) / PROP_DIRECTIONS), y: Math.sin(turn + (k * Math.PI * 2) / PROP_DIRECTIONS) })).filter(facesCamera);
}

function fitFacing(target: THREE.Object3D, box: THREE.Box3, out: Vec, size: number): SignFit | null {
  const center = box.getCenter(new THREE.Vector3());
  const reach = Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z) / 2 + PROP_STANDOFF;
  const direction = new THREE.Vector3(-out.x, 0, -out.y);
  return firstFit(
    PROP_LEVELS.map((level) => () => fitAt(target, new THREE.Vector3(center.x + out.x * reach, box.min.y + (box.max.y - box.min.y) * level, center.z + out.y * reach), direction, reach * 2, size)),
  );
}

function fitProp(t: Terrain, site: GraffitiSite): SignFit | null {
  const o = site.obstacle;
  if (!o) throw new Error(`Prop site ${site.id} has no obstacle`);
  const target = buildProp(t, o);
  target.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(target);
  const outs = propDirections(site);
  return firstFit(SIGN_SIZES.flatMap((size) => outs.map((out) => () => fitFacing(target, box, out, size))));
}

export function fitSite(t: Terrain, site: GraffitiSite): SignFit | null {
  return site.obstacle === null ? fitCliff(t, site) : fitProp(t, site);
}

function smoothstep(from: number, to: number, v: number): number {
  const k = Math.min(1, Math.max(0, (v - from) / (to - from)));
  return k * k * (3 - 2 * k);
}

function weather(cell: ImageData, seed: number): void {
  const { data } = cell;
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++) {
      const patches = valueNoise(x / PATCH_SCALE + seed * 31, y / PATCH_SCALE + seed * 17);
      const flakes = valueNoise(x / FLAKE_SCALE + seed * 7, y / FLAKE_SCALE + seed * 13);
      const streaks = valueNoise(x / STREAK_WIDTH + seed * 5, y / STREAK_LENGTH + seed * 3);
      const keep = smoothstep(WEAR_FROM, WEAR_TO, 0.55 * patches + 0.3 * flakes + 0.15 * streaks);
      data[(y * CELL + x) * 4 + 3] = Math.round(data[(y * CELL + x) * 4 + 3] * keep);
    }
}

function paintCell(ctx: CanvasRenderingContext2D, stage: SignStage, column: number, variant: number): void {
  const scale = (CELL - 2 * CELL_PAD) / 110;
  const paths = signPaths(stage).map((d) => new Path2D(d));
  ctx.save();
  ctx.beginPath();
  ctx.rect(column * CELL, variant * CELL, CELL, CELL);
  ctx.clip();
  ctx.translate(column * CELL + CELL_PAD, variant * CELL + CELL_PAD);
  ctx.scale(scale, scale);
  ctx.translate(5, 5);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = SPRAY_BLUR;
  for (const path of paths) ctx.fill(path, 'evenodd');
  ctx.globalAlpha = SPRAY_SECOND_PASS;
  ctx.translate(SPRAY_DRIFT * (variant ? -1 : 1), SPRAY_DRIFT);
  for (const path of paths) ctx.fill(path, 'evenodd');
  ctx.restore();
  const cell = ctx.getImageData(column * CELL, variant * CELL, CELL, CELL);
  weather(cell, column * GRAFFITI.variants + variant + 1);
  ctx.putImageData(cell, column * CELL, variant * CELL);
}

export function graffitiAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = CELL * SIGN_STAGES.length;
  canvas.height = CELL * GRAFFITI.variants;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get graffiti canvas context');
  SIGN_STAGES.forEach((stage, column) => {
    for (let variant = 0; variant < GRAFFITI.variants; variant++) paintCell(ctx, stage, column, variant);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = ANISOTROPY;
  return texture;
}

type Batch = { positions: number[]; normals: number[]; uvs: number[]; colors: number[]; indices: number[]; center: Vec };

function addToBatch(batch: Batch, paint: GraffitiPaint, fit: SignFit): void {
  const first = batch.positions.length / 3;
  const column = SIGN_STAGES.indexOf(paint.stage);
  const inner = CELL_PAD / CELL;
  const color = new THREE.Color(paint.color);
  batch.positions.push(...fit.positions);
  batch.normals.push(...fit.normals);
  for (let k = 0; k < fit.uvs.length; k += 2) {
    batch.uvs.push((column + inner + fit.uvs[k] * (1 - 2 * inner)) / SIGN_STAGES.length, (paint.variant + inner + fit.uvs[k + 1] * (1 - 2 * inner)) / GRAFFITI.variants);
    batch.colors.push(color.r, color.g, color.b, paint.fade);
  }
  for (const i of fit.indices) batch.indices.push(first + i);
}

function geometryOf(batch: Batch): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(batch.normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(batch.uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(batch.colors, 4));
  geo.setIndex(batch.indices);
  geo.computeBoundingSphere();
  return geo;
}

function inFront(o: Obstacle, at: Vec, fit: SignFit, radius: number): boolean {
  const ahead = (o.pos.x - at.x) * fit.normal.x + (o.pos.y - at.y) * fit.normal.z;
  return ahead > 0 && dist(o.pos, at) < propReach(o) + radius;
}

function blockedInFront(buckets: ObstacleBuckets<Obstacle>, own: Obstacle | null, fit: SignFit): boolean {
  const at = { x: fit.center.x / S, y: fit.center.z / S };
  const radius = fit.size / 2 / S + IN_FRONT_MARGIN;
  return buckets.alongSegment(at, at, radius).some((o) => o !== own && o.kind !== 'site' && o.kind !== 'water' && inFront(o, at, fit, radius));
}

function regionCenter(r: GraffitiRegion): Vec {
  return { x: (r.rect.x0 + r.rect.x1) / 2, y: (r.rect.y0 + r.rect.y1) / 2 };
}

function regionReach(r: GraffitiRegion): number {
  return Math.hypot(r.rect.x1 - r.rect.x0, r.rect.y1 - r.rect.y0) / 2;
}

export function graffitiLift(sunIntensity: number): number {
  return NIGHT_SHARE + (1 - NIGHT_SHARE) * smoothstep(NIGHT_SUN, DAY_SUN, sunIntensity);
}

export class GraffitiViews {
  private material: THREE.MeshLambertMaterial | null = null;
  private lift = 1;

  constructor(world: World, scope: RenderScope) {
    const buckets = new ObstacleBuckets<Obstacle>(world.obstacles, world.size);
    const candidates = new GraffitiCandidates(world.terrain, world.obstacles);
    const fit = (site: GraffitiSite): SignFit | null => {
      const found = fitSite(world.terrain, site);
      return found && !blockedInFront(buckets, site.obstacle, found) ? found : null;
    };
    for (const region of graffitiRegions(world.size))
      if (region.target > 0) scope.place(regionCenter(region), regionReach(region), () => this.draw(region, chooseRegionGraffiti(region, candidates.sitesIn(region), fit)));
  }

  private paint(): THREE.MeshLambertMaterial {
    this.material ??= new THREE.MeshLambertMaterial({
      map: graffitiAtlas(),
      vertexColors: true,
      emissive: new THREE.Color(SHADE_LIFT).multiplyScalar(this.lift),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: OFFSET_UNITS,
      polygonOffsetUnits: OFFSET_UNITS,
    });
    return this.material;
  }

  private draw(region: GraffitiRegion, placed: GraffitiPlaced<SignFit>[]): THREE.Mesh {
    const center = regionCenter(region);
    const batch: Batch = { positions: [], normals: [], uvs: [], colors: [], indices: [], center };
    for (const { site, fit } of placed) addToBatch(batch, site.paint, fit);
    const mesh = new THREE.Mesh(geometryOf(batch), this.paint());
    mesh.name = `graffiti-${center.x}-${center.y}`;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }

  light(sunIntensity: number): void {
    const lift = graffitiLift(sunIntensity);
    if (lift === this.lift) return;
    this.lift = lift;
    if (!this.material) return;
    this.material.emissive.setHex(SHADE_LIFT).multiplyScalar(lift);
  }
}
