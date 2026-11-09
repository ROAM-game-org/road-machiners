import * as THREE from "three";
import { PHYSICS } from "../../data/physics";
import type { Terrain } from "../../sim/terrain";
import { TUNING } from "./inkTuning";

const S = PHYSICS.metersPerTile;
const BOX_PASSES = 3;

export type GroundFormUniforms = { groundForm: GroundForm; groundFormUv: { value: THREE.Vector2 } };

export function groundFormUniforms(t: Terrain): GroundFormUniforms {
  const side = t.size + 1;
  return { groundForm: new GroundForm(t.heights, side), groundFormUv: { value: new THREE.Vector2(1 / (S * side), 0.5 / side) } };
}

export class GroundForm implements THREE.IUniform<THREE.DataTexture> {
  private scale = -1;
  private texture: THREE.DataTexture | null = null;

  constructor(
    private readonly heights: ArrayLike<number>,
    private readonly side: number,
  ) {}

  get value(): THREE.DataTexture {
    const scale = TUNING.formScale.value;
    if (scale !== this.scale || !this.texture) this.rebuild(scale);
    return this.texture as THREE.DataTexture;
  }

  private rebuild(scale: number): void {
    this.texture?.dispose();
    const texture = new THREE.DataTexture(formSlopes(this.heights, this.side, scale), this.side, this.side, THREE.RGFormat, THREE.FloatType);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    this.texture = texture;
    this.scale = scale;
  }
}

export function formSlopes(heights: ArrayLike<number>, side: number, spreadTiles: number): Float32Array {
  const form = blurred(heights, side, spreadTiles);
  const slopes = new Float32Array(side * side * 2);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const k = y * side + x;
      const left = form[y * side + Math.max(0, x - 1)];
      const right = form[y * side + Math.min(side - 1, x + 1)];
      const up = form[Math.max(0, y - 1) * side + x];
      const down = form[Math.min(side - 1, y + 1) * side + x];
      slopes[k * 2] = (right - left) / (Math.min(side - 1, x + 1) - Math.max(0, x - 1));
      slopes[k * 2 + 1] = (down - up) / (Math.min(side - 1, y + 1) - Math.max(0, y - 1));
    }
  return slopes;
}

function blurred(heights: ArrayLike<number>, side: number, spreadTiles: number): Float32Array {
  const radius = Math.round((Math.sqrt((12 * spreadTiles * spreadTiles) / BOX_PASSES + 1) - 1) / 2);
  let from = Float32Array.from(heights);
  let to = new Float32Array(side * side);
  for (let pass = 0; pass < BOX_PASSES; pass++) {
    boxRows(from, to, side, radius);
    boxColumns(to, from, side, radius);
  }
  return from;
}

function boxRows(from: Float32Array, to: Float32Array, side: number, radius: number): void {
  for (let y = 0; y < side; y++) {
    const row = y * side;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += from[row + Math.min(side - 1, Math.max(0, k))];
    for (let x = 0; x < side; x++) {
      to[row + x] = sum / (2 * radius + 1);
      sum += from[row + Math.min(side - 1, x + radius + 1)] - from[row + Math.max(0, x - radius)];
    }
  }
}

function boxColumns(from: Float32Array, to: Float32Array, side: number, radius: number): void {
  for (let x = 0; x < side; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += from[Math.min(side - 1, Math.max(0, k)) * side + x];
    for (let y = 0; y < side; y++) {
      to[y * side + x] = sum / (2 * radius + 1);
      sum += from[Math.min(side - 1, y + radius + 1) * side + x] - from[Math.max(0, y - radius) * side + x];
    }
  }
}
