
import * as THREE from 'three';
import { TERRAIN } from '../../data/terrain';
import { MESH_STEPS } from '../../sim/surface';
import type { World } from '../../sim/types';
import type { SightLimit } from './scope';
import { TERRAIN_CHUNK, type TerrainChunk } from './terrain';
import { uploadRows } from './uploads';

const VISIBLE = 0;
const EXPLORED = 1;
const DARK = 2;
const UNSET = 255;
const WAS = 1;
const NOW = 2;
const UNTOUCHED = 0x7fffffff;

function* chain(first: readonly number[], second: readonly number[]): Generator<number> {
  yield* first;
  yield* second;
}

type FogChunk = { x: number; y: number; width: number; depth: number; look: THREE.BufferAttribute };

export class FogView {
  private readonly chunks: FogChunk[] = [];
  private readonly perSide: number;
  private readonly state: Uint8Array;
  private readonly dirtyCells: Uint8Array;
  private dirtyList: number[] = [];
  private readonly flips: number[] = [];
  private readonly touched: number[] = [];
  private readonly rowFirst: Int32Array;
  private readonly rowLast: Int32Array;
  private readonly visible: Uint8Array;
  private readonly known: Uint8Array;
  private shown: readonly number[] = [];
  private readonly greyOf = Float64Array.of(0, TERRAIN.fog.seen.grey, TERRAIN.fog.unseen.grey);
  private readonly brightOf = Float64Array.of(1, TERRAIN.fog.seen.bright, TERRAIN.fog.unseen.bright);

  private explored: World['player']['explored'];
  private readonly size: number;

  constructor(world: World, ground: THREE.MeshLambertMaterial, private readonly limit: SightLimit, props: readonly number[]) {
    const n = world.size;
    this.size = n;
    this.perSide = Math.ceil(n / TERRAIN_CHUNK);
    this.state = new Uint8Array(n * n).fill(UNSET);
    this.visible = new Uint8Array(n * n);
    this.dirtyCells = new Uint8Array(n * n);
    this.rowFirst = new Int32Array(this.perSide * this.perSide).fill(UNTOUCHED);
    this.rowLast = new Int32Array(this.perSide * this.perSide).fill(-1);
    greyOut(ground);
    this.show(world.player.visible, props);
    this.explored = world.player.explored;
    this.known = world.player.explored.slice();
  }

  attach(g: TerrainChunk): void {
    const n = this.size;
    const k = (g.y / TERRAIN_CHUNK) * this.perSide + g.x / TERRAIN_CHUNK;
    if (this.chunks[k]) throw new Error(`Fog already holds the ground chunk at ${g.x},${g.y}`);
    const look = new THREE.BufferAttribute(new Float32Array((g.width * MESH_STEPS + 1) * (g.depth * MESH_STEPS + 1) * 2), 2);
    g.mesh.geometry.setAttribute('fogLook', look);
    const chunk = { x: g.x, y: g.y, width: g.width, depth: g.depth, look };
    this.chunks[k] = chunk;
    for (let y = Math.max(0, g.y - 1); y < Math.min(n, g.y + g.depth + 1); y++)
      for (let x = Math.max(0, g.x - 1); x < Math.min(n, g.x + g.width + 1); x++) this.restate(y * n + x, n, this.explored);
    for (let y = g.y; y < g.y + g.depth; y++) for (let x = g.x; x < g.x + g.width; x++) this.writeCell(chunk, x, y, n);
    look.clearUpdateRanges();
    uploadRows(look, 0, look.count);
    this.clearDirtyIn(chunk);
  }

  update(world: World, props: readonly number[]): void {
    const n = world.size;
    const explored = world.player.explored;
    this.explored = explored;
    this.show(world.player.visible, props);
    this.restateFlipped(n, explored);
    this.restateExplored(explored, n);
    this.writeDirty(n);
  }

  private restateExplored(explored: Uint8Array, n: number): void {
    const words = explored.length >> 2;
    const now = new Uint32Array(explored.buffer, explored.byteOffset, words);
    const was = new Uint32Array(this.known.buffer, 0, words);
    for (let w = 0; w < words; w++) if (now[w] !== was[w]) for (let t = w * 4; t < w * 4 + 4; t++) this.restate(t, n, explored);
    for (let t = words * 4; t < explored.length; t++) this.restate(t, n, explored);
    this.known.set(explored);
  }

  updateSight(world: World, props: readonly number[]): void {
    const n = world.size;
    this.explored = world.player.explored;
    this.show(world.player.visible, props);
    this.restateFlipped(n, world.player.explored);
    this.writeDirty(n);
  }

  private show(tiles: readonly number[], props: readonly number[]): void {
    this.collectFlips(tiles);
    for (const t of this.shown) this.visible[t] &= NOW;
    for (const t of tiles) this.visible[t] = WAS;
    this.shown = tiles;
    this.limit.showVisible(chain(tiles, props));
  }

  private collectFlips(tiles: readonly number[]): void {
    this.flips.length = 0;
    for (const t of tiles) this.visible[t] |= NOW;
    for (const t of this.shown) this.flipUnless(t, NOW);
    for (const t of tiles) this.flipUnless(t, WAS);
  }

  private flipUnless(t: number, bit: number): void {
    if (!(this.visible[t] & bit)) this.flips.push(t);
  }

  private restateFlipped(n: number, explored: World['player']['explored']): void {
    for (const t of this.flips) this.restate(t, n, explored);
  }

  private restate(t: number, n: number, explored: World['player']['explored']): void {
    const s = this.visible[t] ? VISIBLE : explored[t] ? EXPLORED : DARK;
    if (s === this.state[t]) return;
    this.state[t] = s;
    const x = t % n;
    this.markAround(x, (t - x) / n, n);
  }

  private markAround(x: number, y: number, n: number): void {
    for (let cy = Math.max(0, y - 1); cy <= Math.min(n - 1, y + 1); cy++)
      for (let cx = Math.max(0, x - 1); cx <= Math.min(n - 1, x + 1); cx++) this.markDirty(cy * n + cx);
  }

  private markDirty(cell: number): void {
    if (this.dirtyCells[cell]) return;
    this.dirtyCells[cell] = 1;
    this.dirtyList.push(cell);
  }

  private writeDirty(n: number): void {
    this.touched.length = 0;
    for (const cell of this.dirtyList) this.writeDirtyCell(cell, n);
    this.dirtyList.length = 0;
    for (const k of this.touched) this.uploadTouched(k);
  }

  private writeDirtyCell(cell: number, n: number): void {
    this.dirtyCells[cell] = 0;
    const x = cell % n;
    const y = (cell - x) / n;
    const k = Math.floor(y / TERRAIN_CHUNK) * this.perSide + Math.floor(x / TERRAIN_CHUNK);
    const chunk = this.chunks[k];
    if (!chunk) return;
    this.writeCell(chunk, x, y, n);
    const first = (y - chunk.y) * MESH_STEPS;
    const last = first + (y === chunk.y + chunk.depth - 1 ? MESH_STEPS : MESH_STEPS - 1);
    if (this.rowLast[k] < 0) this.touched.push(k);
    this.rowFirst[k] = Math.min(this.rowFirst[k], first);
    this.rowLast[k] = Math.max(this.rowLast[k], last);
  }

  private uploadTouched(k: number): void {
    const chunk = this.chunks[k];
    const row = chunk.width * MESH_STEPS + 1;
    uploadRows(chunk.look, this.rowFirst[k] * row, (this.rowLast[k] - this.rowFirst[k] + 1) * row);
    this.rowFirst[k] = UNTOUCHED;
    this.rowLast[k] = -1;
  }

  private clearDirtyIn(chunk: FogChunk): void {
    const n = this.size;
    for (let y = chunk.y; y < chunk.y + chunk.depth; y++) for (let x = chunk.x; x < chunk.x + chunk.width; x++) this.dirtyCells[y * n + x] = 0;
    this.dirtyList = this.dirtyList.filter((cell) => this.dirtyCells[cell] === 1);
  }

  private writeCell(chunk: FogChunk, tx: number, ty: number, n: number): void {
    const ci = tx - chunk.x;
    const cj = ty - chunk.y;
    if (!within(ci, chunk.width) || !within(cj, chunk.depth)) throw new Error(`Fog cell ${tx},${ty} lies outside the ground chunk at ${chunk.x},${chunk.y}`);
    const iEnd = ci === chunk.width - 1 ? MESH_STEPS : MESH_STEPS - 1;
    const jEnd = cj === chunk.depth - 1 ? MESH_STEPS : MESH_STEPS - 1;
    for (let c = 0; c < 2; c++) this.fillCell(chunk, tx, ty, n, c, iEnd, jEnd);
  }

  private fillCell(chunk: FogChunk, tx: number, ty: number, n: number, c: number, iEnd: number, jEnd: number): void {
    const array = chunk.look.array as Float32Array;
    const row = chunk.width * MESH_STEPS + 1;
    const origin = ((ty - chunk.y) * MESH_STEPS * row + (tx - chunk.x) * MESH_STEPS) * 2 + c;
    const a = this.cornerLook(tx, ty, n, c);
    const b = this.cornerLook(tx + 1, ty, n, c);
    const d = this.cornerLook(tx, ty + 1, n, c);
    const e = this.cornerLook(tx + 1, ty + 1, n, c);
    for (let dj = 0; dj <= jEnd; dj++)
      for (let di = 0; di <= iEnd; di++) {
        const fx = di / MESH_STEPS;
        const top = a + (b - a) * fx;
        const bottom = d + (e - d) * fx;
        array[origin + (dj * row + di) * 2] = top + (bottom - top) * (dj / MESH_STEPS);
      }
  }

  private cornerLook(x: number, y: number, n: number, channel: number): number {
    const table = channel === 0 ? this.greyOf : this.brightOf;
    let sum = 0;
    let count = 0;
    for (let tx = Math.max(0, x - 1); tx <= Math.min(n - 1, x); tx++)
      for (let ty = Math.max(0, y - 1); ty <= Math.min(n - 1, y); ty++) {
        sum += table[this.state[ty * n + tx]];
        count++;
      }
    return sum / count;
  }
}

function within(at: number, size: number): boolean {
  return at >= 0 && at < size;
}

function greyOut(mat: THREE.MeshLambertMaterial): void {
  const before = mat.onBeforeCompile.bind(mat);
  const key = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 fogLook;\nvarying vec2 vFogLook;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFogLook = fogLook;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFogLook;')
      .replace(
        '#include <opaque_fragment>',
        `float fogLuma = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
        outgoingLight = mix(outgoingLight, vec3(fogLuma), vFogLook.x) * vFogLook.y;
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => `${key()}|fog`;
  mat.needsUpdate = true;
}
