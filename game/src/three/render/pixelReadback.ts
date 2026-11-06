import * as THREE from 'three';
import type { GpuContext } from '../gpu-context';

export const READBACK_MATCH = 0.9;

const PROBE_SIZE = 16;
const REFUSED_NOTE = 'Pixel readback is refused by this browser; truck drawings use the plain plan';

type Block = { x: number; y: number; size: number; rgb: readonly [number, number, number] };

const COLORS: readonly (readonly [number, number, number])[] = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [90, 120, 150],
];

function probeBlocks(size: number): Block[] {
  const half = size / 2;
  return COLORS.map((rgb, i) => ({ x: (i % 2) * half, y: Math.floor(i / 2) * half, size: half, rgb }));
}

export function probePattern(size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (const block of probeBlocks(size)) {
    for (let y = block.y; y < block.y + block.size; y++) {
      for (let x = block.x; x < block.x + block.size; x++) {
        const at = (y * size + x) * 4;
        out.set(block.rgb, at);
        out[at + 3] = 255;
      }
    }
  }
  return out;
}

export function readbackMatches(drawn: Uint8Array, read: ArrayLike<number>): number {
  if (drawn.length !== read.length) throw new Error(`readback probe expected ${drawn.length} bytes and got ${read.length}`);
  let same = 0;
  for (let i = 0; i < drawn.length; i += 4) {
    if (drawn[i] === read[i] && drawn[i + 1] === read[i + 1] && drawn[i + 2] === read[i + 2] && drawn[i + 3] === read[i + 3]) same++;
  }
  return same / (drawn.length / 4);
}

let canvasVerdict: boolean | null = null;

export function canvasReadable(): boolean {
  if (canvasVerdict !== null) return canvasVerdict;
  const canvas = document.createElement('canvas');
  canvas.width = PROBE_SIZE;
  canvas.height = PROBE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The pixel readback probe could not get a 2D context');
  const drawn = probePattern(PROBE_SIZE);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(drawn), PROBE_SIZE, PROBE_SIZE), 0, 0);
  const read = ctx.getImageData(0, 0, PROBE_SIZE, PROBE_SIZE).data;
  canvasVerdict = readbackMatches(drawn, read) >= READBACK_MATCH;
  return canvasVerdict;
}

export function webglReadable(renderer: THREE.WebGLRenderer): boolean {
  const target = new THREE.WebGLRenderTarget(PROBE_SIZE, PROBE_SIZE, { depthBuffer: false });
  const previousTarget = renderer.getRenderTarget();
  const previousColor = renderer.getClearColor(new THREE.Color());
  const previousAlpha = renderer.getClearAlpha();
  try {
    target.scissorTest = true;
    for (const block of probeBlocks(PROBE_SIZE)) {
      target.scissor.set(block.x, block.y, block.size, block.size);
      renderer.setRenderTarget(target);
      renderer.setClearColor(new THREE.Color().setRGB(block.rgb[0] / 255, block.rgb[1] / 255, block.rgb[2] / 255, THREE.LinearSRGBColorSpace), 1);
      renderer.clear(true, false, false);
    }
    const read = new Uint8Array(PROBE_SIZE * PROBE_SIZE * 4);
    renderer.readRenderTargetPixels(target, 0, 0, PROBE_SIZE, PROBE_SIZE, read);
    return readbackMatches(probePattern(PROBE_SIZE), read) >= READBACK_MATCH;
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousColor, previousAlpha);
    target.dispose();
  }
}

export class PixelReadback {
  private verdict: boolean | null = null;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly gpu: GpuContext,
    private readonly webgl: (renderer: THREE.WebGLRenderer) => boolean = webglReadable,
    private readonly canvas: () => boolean = canvasReadable,
  ) {}

  honest(): boolean {
    if (this.verdict !== null) return this.verdict;
    if (this.gpu.lost()) return false;
    this.verdict = this.canvas() && this.webgl(this.renderer);
    if (!this.verdict) console.warn(REFUSED_NOTE);
    return this.verdict;
  }
}
