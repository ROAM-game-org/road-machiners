import * as THREE from "three";
import { PHYSICS } from "../../data/physics";
import type { Terrain } from "../../sim/terrain";
import { TUNING } from "./inkTuning";

const S = PHYSICS.metersPerTile;
const GAUSS_REACH = 3;

export const FORM_STRIDE = 4;

export type GroundFormUniforms = {
  groundForm: GroundForm;
  groundFormUv: { value: THREE.Vector2 };
  groundFormTileMeters: { value: number };
  groundFormRelief: { value: number };
  groundHillShadows: { value: number };
};

export function groundFormUniforms(t: Terrain): GroundFormUniforms {
  const side = t.size + 1;
  return {
    groundForm: new GroundForm(t.heights, side),
    groundFormUv: { value: new THREE.Vector2(1 / (S * side), 0.5 / side) },
    groundFormTileMeters: { value: S },
    groundFormRelief: { value: reliefMeters(t.heights) },
    groundHillShadows: TUNING.hillShadows,
  };
}

function reliefMeters(heights: ArrayLike<number>): number {
  let low = Infinity;
  let high = -Infinity;
  for (let k = 0; k < heights.length; k++) {
    low = Math.min(low, heights[k]);
    high = Math.max(high, heights[k]);
  }
  return (high - low) * S;
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
    const texture = new THREE.DataTexture(formField(this.heights, this.side, scale), this.side, this.side, THREE.RGBAFormat, THREE.FloatType);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    this.texture = texture;
    this.scale = scale;
  }
}

export function formField(heights: ArrayLike<number>, side: number, spreadTiles: number): Float32Array {
  const form = blurred(heights, side, spreadTiles);
  const field = new Float32Array(side * side * FORM_STRIDE);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const k = y * side + x;
      const left = form[y * side + Math.max(0, x - 1)];
      const right = form[y * side + Math.min(side - 1, x + 1)];
      const up = form[Math.max(0, y - 1) * side + x];
      const down = form[Math.min(side - 1, y + 1) * side + x];
      field[k * FORM_STRIDE] = (right - left) / (Math.min(side - 1, x + 1) - Math.max(0, x - 1));
      field[k * FORM_STRIDE + 1] = (down - up) / (Math.min(side - 1, y + 1) - Math.max(0, y - 1));
      field[k * FORM_STRIDE + 2] = form[k];
    }
  return field;
}

function blurred(heights: ArrayLike<number>, side: number, spreadTiles: number): Float32Array {
  const from = Float32Array.from(heights);
  if (spreadTiles <= 0) return from;
  const weights = gaussWeights(spreadTiles);
  const across = new Float32Array(side * side);
  blurLine(from, across, side, weights, 1, side);
  blurLine(across, from, side, weights, side, 1);
  return from;
}

function gaussWeights(spreadTiles: number): Float32Array {
  const radius = Math.ceil(GAUSS_REACH * spreadTiles);
  const weights = Float32Array.from({ length: 2 * radius + 1 }, (_, k) => Math.exp(-((k - radius) ** 2) / (2 * spreadTiles * spreadTiles)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((w) => w / total);
}

function blurLine(from: Float32Array, to: Float32Array, side: number, weights: Float32Array, along: number, across: number): void {
  const radius = (weights.length - 1) / 2;
  for (let line = 0; line < side; line++)
    for (let i = 0; i < side; i++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += weights[k + radius] * from[line * across + Math.min(side - 1, Math.max(0, i + k)) * along];
      to[line * across + i * along] = sum;
    }
}
