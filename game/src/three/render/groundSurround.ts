import * as THREE from "three";
import { GROUND_MATERIAL_IDS, groundMaterial, groundMaterialIndex, shownLooks } from "../../render/groundPaint";
import type { Terrain } from "../../sim/terrain";

export const SURROUND_CELL_TILES = 2;
const SURROUND_REACH_CELLS = 6;
const SURROUND_PASSES = 2;

export function surroundColors(materials: Uint8Array, side: number, palette: readonly THREE.Color[]): { cells: number; data: Float32Array } {
  const cells = Math.ceil(side / SURROUND_CELL_TILES);
  let data = new Float32Array(cells * cells * 4);
  const counts = new Float32Array(cells * cells);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const color = palette[materials[y * side + x]];
      const cell = Math.floor(y / SURROUND_CELL_TILES) * cells + Math.floor(x / SURROUND_CELL_TILES);
      data[cell * 4] += color.r;
      data[cell * 4 + 1] += color.g;
      data[cell * 4 + 2] += color.b;
      counts[cell]++;
    }
  for (let cell = 0; cell < counts.length; cell++) {
    for (let c = 0; c < 3; c++) data[cell * 4 + c] /= counts[cell];
    data[cell * 4 + 3] = 1;
  }
  for (let pass = 0; pass < SURROUND_PASSES; pass++) data = boxBlur(boxBlur(data, cells, 1, cells), cells, cells, 1);
  return { cells, data };
}

function boxBlur(from: Float32Array, cells: number, step: number, lineStep: number): Float32Array<ArrayBuffer> {
  const to = new Float32Array(from.length);
  for (let line = 0; line < cells; line++) for (let c = 0; c < 4; c++) blurLine(from, to, line * lineStep * 4 + c, step * 4, cells);
  return to;
}

function blurLine(from: Float32Array, to: Float32Array, start: number, stride: number, count: number): void {
  let sum = 0;
  for (let k = 0; k < Math.min(count, SURROUND_REACH_CELLS); k++) sum += from[start + k * stride];
  for (let k = 0; k < count; k++) {
    const enter = k + SURROUND_REACH_CELLS;
    const leave = k - SURROUND_REACH_CELLS - 1;
    if (enter < count) sum += from[start + enter * stride];
    if (leave >= 0) sum -= from[start + leave * stride];
    to[start + k * stride] = sum / (Math.min(count - 1, enter) - Math.max(0, k - SURROUND_REACH_CELLS) + 1);
  }
}

export function surroundTexture(t: Terrain): THREE.DataTexture {
  const materials = Uint8Array.from(shownLooks(t), groundMaterialIndex);
  const palette = GROUND_MATERIAL_IDS.map((id) => new THREE.Color(groundMaterial(id).color));
  const { cells, data } = surroundColors(materials, t.size, palette);
  const half = Uint16Array.from(data, (v) => THREE.DataUtils.toHalfFloat(v));
  const texture = new THREE.DataTexture(half, cells, cells, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
