import { inkGround } from "./inkPaint";
import * as THREE from "three";
import { HIGHWAY } from "../../data/modes";
import { PHYSICS } from "../../data/physics";
import {
  paintGroundCanvas,
  paintLandformCanvas,
  TERRAIN_MARGIN,
  type PaintCanvas,
} from "../../render/groundPaint";
import { atlasOf } from "../../sim/atlas";
import { hollowSitesFor } from "../../sim/hollow-layout";
import { deckAt, railOffset, type Deck } from "../../sim/bridge";
import { deckHeight, deckSegments, isCliff, type DeckSegment, type Terrain } from "../../sim/terrain";
import type { World } from "../../sim/types";
import { drawGround, drawnGround, readGroundCache, writeGroundCache, type DrawnGround, type GroundCacheUniforms } from "./groundShader";
import { blurredHeights } from "./groundForm";
import { FOLD, MESH_STEPS, REACH_TILES, SurfacePatch, surfaceTriangles, type Fold } from "./groundSurface";
import { NIGHT_POOLS } from "./lightPools";
import type { RenderScope } from "./scope";

const S = PHYSICS.metersPerTile;
const TEXTURE_SIDE = 2048;
const DENSITY_REFERENCE_TILES = 600;
const GROUND_PIXELS_PER_TILE = TEXTURE_SIDE / (DENSITY_REFERENCE_TILES + 2 * TERRAIN_MARGIN);
export const TERRAIN_CHUNK = 32;

export function groundSide(size: number): number {
  if (size > HIGHWAY.size) return TEXTURE_SIDE;
  return Math.round(GROUND_PIXELS_PER_TILE * (size + 2 * TERRAIN_MARGIN));
}

function mapCanvas(w: World, side: number): PaintCanvas {
  const from = -TERRAIN_MARGIN;
  const res = side / (w.size + 2 * TERRAIN_MARGIN);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = side;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not get terrain canvas context");
  return {
    ctx,
    size: side,
    res,
    from,
    toPx: (tile) => (tile - from) * res,
  };
}

const groundTextures = new WeakMap<Terrain, THREE.CanvasTexture>();

export function groundTexture(w: World): THREE.CanvasTexture {
  let texture = groundTextures.get(w.terrain);
  if (!texture) {
    texture = paintTexture(w);
    groundTextures.set(w.terrain, texture);
  }
  return texture;
}

function paintTexture(w: World): THREE.CanvasTexture {
  const c = mapCanvas(w, groundSide(w.size));
  paintGroundCanvas(c, w.terrain, { hillshade: 0.35 });
  const texture = new THREE.CanvasTexture(c.ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

function landformTexture(w: World): THREE.CanvasTexture | null {
  if (!atlasOf(w.terrain).landforms) return null;
  const c = mapCanvas(w, groundSide(w.size));
  paintLandformCanvas(c, w.terrain);
  const texture = new THREE.CanvasTexture(c.ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  return texture;
}

export function groundUvPerMeter(size: number): number {
  return 1 / ((size + 2 * TERRAIN_MARGIN) * S);
}

export type TerrainChunk = {
  x: number;
  y: number;
  width: number;
  depth: number;
  mesh: THREE.Mesh;
};

const DECK_FLOOR_GAP = 0.5;
const LAND_BLUR_TILES = 1.25;

export function deckFloorCap(t: Terrain, x: number, y: number): number | null {
  const on = deckAt(atlasOf(t).decks, x, y);
  return on === null ? null : deckHeight(t, on.deck, on.along) - DECK_FLOOR_GAP / S;
}

function drawnHeight(t: Terrain, x: number, y: number, heights: ArrayLike<number> = t.heights): number {
  const h = heights[y * (t.size + 1) + x];
  const cap = deckFloorCap(t, x, y);
  return cap === null ? h : Math.min(h, cap);
}

const landShapes = new WeakMap<Terrain, Float32Array>();

function landShape(t: Terrain): Float32Array {
  let shape = landShapes.get(t);
  if (!shape) {
    shape = blurredHeights(t.heights, t.size + 1, LAND_BLUR_TILES);
    landShapes.set(t, shape);
  }
  return shape;
}

function onMap(t: Terrain, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < t.size && y < t.size;
}

function foldOf(t: Terrain, x: number, y: number): Fold {
  if (!onMap(t, x, y) || !isCliff(t, y * t.size + x)) return FOLD.smooth;
  const rising = Math.abs(drawnHeight(t, x, y) - drawnHeight(t, x + 1, y + 1));
  const falling = Math.abs(drawnHeight(t, x + 1, y) - drawnHeight(t, x, y + 1));
  return rising < falling ? FOLD.cliffAlongRise : FOLD.cliff;
}

type Window = { fromX: number; fromY: number; cols: number; rows: number };

function foldRing(t: Terrain, w: Window): Uint8Array {
  const ring = new Uint8Array((w.cols + 2) * (w.rows + 2));
  for (let j = 0; j < w.rows + 2; j++) for (let i = 0; i < w.cols + 2; i++) ring[j * (w.cols + 2) + i] = foldOf(t, w.fromX - 1 + i, w.fromY - 1 + j);
  return ring;
}

function innerFolds(ring: Uint8Array, w: Window): Uint8Array {
  const folds = new Uint8Array(w.cols * w.rows);
  for (let j = 0; j < w.rows; j++) for (let i = 0; i < w.cols; i++) folds[j * w.cols + i] = ring[(j + 1) * (w.cols + 2) + i + 1];
  return folds;
}

function cornerHeights(t: Terrain, ring: Uint8Array, w: Window): Float64Array {
  const clamp = (v: number) => Math.min(t.size, Math.max(0, v));
  const touchesCliff = (i: number, j: number) => [0, 1].some((dy) => [0, 1].some((dx) => ring[(j + dy) * (w.cols + 2) + i + dx] !== FOLD.smooth));
  const shape = landShape(t);
  const corners = new Float64Array((w.cols + 1) * (w.rows + 1));
  for (let j = 0; j <= w.rows; j++)
    for (let i = 0; i <= w.cols; i++) corners[j * (w.cols + 1) + i] = drawnHeight(t, clamp(w.fromX + i), clamp(w.fromY + j), touchesCliff(i, j) ? t.heights : shape);
  return corners;
}

export function surfacePatch(t: Terrain, x: number, y: number, width: number, depth: number): SurfacePatch {
  const w = { fromX: x - REACH_TILES, fromY: y - REACH_TILES, cols: width + 2 * REACH_TILES, rows: depth + 2 * REACH_TILES };
  const ring = foldRing(t, w);
  return new SurfacePatch(w.fromX, w.fromY, w.cols, cornerHeights(t, ring, w), innerFolds(ring, w));
}

export function chunkGeometry(t: Terrain, x: number, y: number, width: number, depth: number): THREE.PlaneGeometry {
  const patch = surfacePatch(t, x, y, width, depth);
  const cols = width * MESH_STEPS;
  const rows = depth * MESH_STEPS;
  const geo = new THREE.PlaneGeometry(width * S, depth * S, cols, rows).rotateX(-Math.PI / 2);
  const pos = geo.getAttribute("position");
  const normal = geo.getAttribute("normal");
  const uv = geo.getAttribute("uv");
  const span = t.size + TERRAIN_MARGIN * 2;
  const up = new THREE.Vector3();
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= cols; i++) {
      const k = j * (cols + 1) + i;
      const u = x + i / MESH_STEPS;
      const v = y + j / MESH_STEPS;
      const slope = patch.slopeAt(u, v);
      pos.setXYZ(k, u * S, patch.heightAt(u, v) * S, v * S);
      normal.setXYZ(k, ...up.set(-slope.x, 1, -slope.y).normalize().toArray());
      uv.setXY(k, (u + TERRAIN_MARGIN) / span, (v + TERRAIN_MARGIN) / span);
    }
  geo.setIndex(surfaceTriangles(patch, x, y, width, depth));
  geo.computeBoundingSphere();
  return geo;
}

export function groundMaterial(w: World): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ map: groundTexture(w) });
  drawGround(material, drawnGroundOf(w));
  return litGround(material);
}

export type CachedGround = { reader: THREE.MeshLambertMaterial; writer: THREE.MeshLambertMaterial; writes: DrawnGround };

export function cachedGround(w: World, cache: GroundCacheUniforms): CachedGround {
  const map = groundTexture(w);
  const writes = drawnGroundOf(w);
  const writer = new THREE.MeshLambertMaterial({ map });
  writeGroundCache(writer, writes);
  const reader = new THREE.MeshLambertMaterial({ map });
  readGroundCache(reader, cache, writes.crest.uniforms);
  return { reader: litGround(reader), writer, writes };
}

function drawnGroundOf(w: World): DrawnGround {
  return drawnGround(mapCanvas(w, TEXTURE_SIDE), w.terrain, hollowSitesFor(w), landformTexture(w));
}

function litGround(material: THREE.MeshLambertMaterial): THREE.MeshLambertMaterial {
  inkGround(material);
  NIGHT_POOLS.light(material);
  return material;
}

export function terrainMesh(w: World, material: THREE.MeshLambertMaterial, scope: RenderScope, onChunk: (chunk: TerrainChunk) => void): void {
  for (let y = 0; y < w.size; y += TERRAIN_CHUNK)
    for (let x = 0; x < w.size; x += TERRAIN_CHUNK) {
      const width = Math.min(TERRAIN_CHUNK, w.size - x);
      const depth = Math.min(TERRAIN_CHUNK, w.size - y);
      scope.place({ x: x + width / 2, y: y + depth / 2 }, Math.hypot(width, depth) / 2, () => {
        const chunk = groundChunk(w.terrain, material, x, y, width, depth);
        onChunk(chunk);
        return chunk.mesh;
      });
    }
  for (const deck of atlasOf(w.terrain).decks.decks) deckPick(w.terrain, deck, scope);
}

function groundChunk(t: Terrain, material: THREE.MeshLambertMaterial, x: number, y: number, width: number, depth: number): TerrainChunk {
  const mesh = new THREE.Mesh(chunkGeometry(t, x, y, width, depth), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return { x, y, width, depth, mesh };
}

function deckPick(t: Terrain, deck: Deck, scope: RenderScope): void {
  for (const seg of deckSegments(t, deck)) piecePick(deck, seg, scope);
}

function piecePick(deck: Deck, seg: DeckSegment, scope: RenderScope): void {
  const { h0, h1 } = seg;
  const [a0, a1, b0, b1] = [-1, 1].flatMap((side) => {
    const off = railOffset(deck.axis, deck.width, side);
    return [{ x: seg.from.x + off.x, y: seg.from.y + off.y }, { x: seg.to.x + off.x, y: seg.to.y + off.y }];
  });
  const corners = [[a0, h0], [a1, h1], [b1, h1], [b0, h0]] as const;
  const geo = new THREE.BufferGeometry()
    .setAttribute("position", new THREE.Float32BufferAttribute(corners.flatMap(([p, h]) => [p.x * S, h * S, p.y * S]), 3))
    .setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeBoundingSphere();
  const mid = { x: (a0.x + b1.x) / 2, y: (a0.y + b1.y) / 2 };
  scope.place(mid, seg.length / 2, () => {
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.visible = false;
    return mesh;
  });
}
