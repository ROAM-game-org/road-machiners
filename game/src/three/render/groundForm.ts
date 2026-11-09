const GAUSS_REACH = 3;

export function blurredHeights(heights: ArrayLike<number>, side: number, spreadTiles: number): Float32Array {
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
