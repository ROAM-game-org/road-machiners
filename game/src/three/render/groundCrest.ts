import * as THREE from "three";
import { TUNING } from "./inkTuning";

const CREST_REACH_TILES = 4;
const CREST_BROAD_REACH_TILES = 10;
const CREST_SCALE_GAP_TILES = 3;
const CREST_SNAP_TILES = 4;
const CREST_SNAP_STEP = 0.25;
const CREST_SNAP_REACH_TILES = 1.5;
const CREST_FALL_LEAST = 0.1;
const CREST_LEAST_AHEAD = 0;
const CREST_MIN_TILES = 10;
const CREST_LINK_TILES = 2;
const CREST_TAPER_TILES = 3;
const CREST_STAMP_TILES = 3;
const CREST_SMOOTH_PASSES = 5;
const CREST_REACH_ALONG = 0.6;
const CREST_GAP_SHARE = 0.3;
const CREST_GAP_METERS = 9;
const CREST_SWELL_METERS = 6;
const CREST_NONE_METERS = 100;
const CREST_NONE = -1;
const CORNERS = [[0, 0], [1, 0], [0, 1], [1, 1]] as const;
const LINK_STEPS = squareSteps(CREST_LINK_TILES).filter((step) => step.x !== 0 || step.y !== 0);
const CLAIM_STEPS = squareSteps(1);
const SCALE_GAP_STEPS = squareSteps(CREST_SCALE_GAP_TILES);

function squareSteps(reach: number): CrestPoint[] {
  const steps: CrestPoint[] = [];
  for (let y = -reach; y <= reach; y++) for (let x = -reach; x <= reach; x++) steps.push({ x, y });
  return steps;
}

export type CrestPoint = { x: number; y: number };

export type CrestShape = { leastFoldMeters: number; leastTiles: number };

export const CREST_SHAPE: CrestShape = { leastFoldMeters: 3, leastTiles: CREST_MIN_TILES };

export function crestLines(form: Float32Array, corners: ArrayLike<number>, side: number, metersPerTile: number, shape: CrestShape): CrestPoint[][] {
  if (!(shape.leastFoldMeters > 0)) throw new Error(`A crest needs a positive least fold, got ${shape.leastFoldMeters}`);
  const fine = crestCorners(form, side, CREST_REACH_TILES, shape.leastFoldMeters / metersPerTile);
  const broad = crestCorners(form, side, CREST_BROAD_REACH_TILES, (shape.leastFoldMeters / metersPerTile) * (CREST_BROAD_REACH_TILES / CREST_REACH_TILES));
  const crest = joined(fine, apart(broad, fine, side), side);
  return chained(crest, side)
    .filter((line) => lengthOf(line) >= shape.leastTiles)
    .map((line) => smoothed(line.map((p) => snapped(form, corners, side, p))));
}

function crestCorners(f: Float32Array, side: number, reach: number, leastFoldTiles: number): Uint8Array {
  const crest = new Uint8Array(side * side);
  const edge = reach + 2;
  for (let y = edge; y < side - edge; y++) for (let x = edge; x < side - edge; x++) crest[y * side + x] = isCrest(f, side, x, y, reach, leastFoldTiles) ? 1 : 0;
  return crest;
}

function apart(broad: Uint8Array, fine: Uint8Array, side: number): Uint8Array {
  const near = new Uint8Array(side * side);
  for (let k = 0; k < fine.length; k++) if (fine[k]) for (const step of SCALE_GAP_STEPS) near[Math.min(side * side - 1, Math.max(0, k + step.y * side + step.x))] = 1;
  return broad.map((on, k) => (on && !near[k] ? 1 : 0));
}

function joined(a: Uint8Array, b: Uint8Array, side: number): Uint8Array {
  const both = new Uint8Array(side * side);
  for (let k = 0; k < both.length; k++) both[k] = a[k] | b[k];
  return both;
}

function snapped(form: Float32Array, corners: ArrayLike<number>, side: number, p: CrestPoint): CrestPoint {
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const inner = x > 0 && y > 0 && x < side - 1 && y < side - 1;
  const across = inner ? fallOrBend(form, side, x, y) : null;
  return across ? foldPeak(corners, side, p, across) : p;
}

function foldPeak(corners: ArrayLike<number>, side: number, p: CrestPoint, across: CrestPoint): CrestPoint {
  let best = p;
  let bestFold = -Infinity;
  for (let t = -CREST_SNAP_TILES; t <= CREST_SNAP_TILES; t += CREST_SNAP_STEP) {
    const at = { x: p.x + across.x * t, y: p.y + across.y * t };
    const fold = foldAt(corners, side, at.x, at.y, across, CREST_SNAP_REACH_TILES);
    if (fold > bestFold) {
      bestFold = fold;
      best = at;
    }
  }
  return best;
}

function fallOrBend(form: Float32Array, side: number, x: number, y: number): CrestPoint | null {
  const k = y * side + x;
  const fall = { x: (form[k + 1] - form[k - 1]) / 2, y: (form[k + side] - form[k - side]) / 2 };
  const steep = Math.hypot(fall.x, fall.y);
  return steep >= CREST_FALL_LEAST ? { x: fall.x / steep, y: fall.y / steep } : bendAcross(form, side, x, y);
}

function isCrest(f: Float32Array, side: number, x: number, y: number, reach: number, leastFoldTiles: number): boolean {
  const across = bendAcross(f, side, x, y);
  if (!across) return false;
  const here = foldAt(f, side, x, y, across, reach);
  return here >= leastFoldTiles && here >= foldAt(f, side, x + across.x, y + across.y, across, reach) && here > foldAt(f, side, x - across.x, y - across.y, across, reach);
}

function foldAt(f: ArrayLike<number>, side: number, x: number, y: number, across: CrestPoint, reach: number): number {
  const reachX = across.x * reach;
  const reachY = across.y * reach;
  return 2 * sample(f, side, x, y) - sample(f, side, x + reachX, y + reachY) - sample(f, side, x - reachX, y - reachY);
}

function bendAcross(f: Float32Array, side: number, x: number, y: number): CrestPoint | null {
  const k = y * side + x;
  const xx = f[k + 1] - 2 * f[k] + f[k - 1];
  const yy = f[k + side] - 2 * f[k] + f[k - side];
  const xy = (f[k + side + 1] - f[k - side + 1] - f[k + side - 1] + f[k - side - 1]) / 4;
  const mid = (xx + yy) / 2;
  const bent = mid - Math.hypot((xx - yy) / 2, xy);
  if (bent >= 0) return null;
  if (Math.abs(xy) < 1e-9) return xx <= yy ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const length = Math.hypot(xy, bent - xx);
  return { x: xy / length, y: (bent - xx) / length };
}

function sample(f: ArrayLike<number>, side: number, x: number, y: number): number {
  const i = Math.min(side - 2, Math.max(0, Math.floor(x)));
  const j = Math.min(side - 2, Math.max(0, Math.floor(y)));
  const fx = x - i;
  const fy = y - j;
  const k = j * side + i;
  return f[k] * (1 - fx) * (1 - fy) + f[k + 1] * fx * (1 - fy) + f[k + side] * (1 - fx) * fy + f[k + side + 1] * fx * fy;
}

function chained(crest: Uint8Array, side: number): CrestPoint[][] {
  const left = Uint8Array.from(crest);
  const lines: CrestPoint[][] = [];
  for (let k = 0; k < left.length; k++) {
    if (!left[k]) continue;
    const seed = { x: k % side, y: Math.floor(k / side) };
    claim(left, side, seed);
    const ahead = walk(left, side, seed, null);
    const behind = walk(left, side, seed, ahead.length > 1 ? { x: seed.x - ahead[1].x, y: seed.y - ahead[1].y } : null);
    lines.push([...behind.reverse(), ...ahead.slice(1)]);
  }
  return lines;
}

function walk(left: Uint8Array, side: number, from: CrestPoint, heading: CrestPoint | null): CrestPoint[] {
  const path = [from];
  let at = from;
  let way = heading;
  for (;;) {
    const next = nextCrest(left, side, at, way);
    if (!next) return path;
    claim(left, side, next);
    way = { x: next.x - at.x, y: next.y - at.y };
    at = next;
    path.push(next);
  }
}

function nextCrest(left: Uint8Array, side: number, at: CrestPoint, way: CrestPoint | null): CrestPoint | null {
  let best: CrestPoint | null = null;
  let bestScore = Infinity;
  for (const step of LINK_STEPS) {
    const next = { x: at.x + step.x, y: at.y + step.y };
    const score = inside(side, next) && left[next.y * side + next.x] ? linkScore(step, way) : Infinity;
    if (score < bestScore) {
      bestScore = score;
      best = next;
    }
  }
  return best;
}

function linkScore(step: CrestPoint, way: CrestPoint | null): number {
  const length = Math.hypot(step.x, step.y);
  const ahead = way ? (step.x * way.x + step.y * way.y) / (length * Math.hypot(way.x, way.y)) : 1;
  return ahead < CREST_LEAST_AHEAD ? Infinity : length + 2 * (1 - ahead);
}

function inside(side: number, at: CrestPoint): boolean {
  return at.x >= 0 && at.y >= 0 && at.x < side && at.y < side;
}

function claim(left: Uint8Array, side: number, at: CrestPoint): void {
  for (const step of CLAIM_STEPS) {
    const near = { x: at.x + step.x, y: at.y + step.y };
    if (inside(side, near)) left[near.y * side + near.x] = 0;
  }
}

function lengthOf(line: CrestPoint[]): number {
  let total = 0;
  for (let n = 1; n < line.length; n++) total += Math.hypot(line[n].x - line[n - 1].x, line[n].y - line[n - 1].y);
  return total;
}

function smoothed(line: CrestPoint[]): CrestPoint[] {
  let points = line;
  for (let pass = 0; pass < CREST_SMOOTH_PASSES; pass++)
    points = points.map((p, n) => (n === 0 || n === points.length - 1 ? p : { x: (points[n - 1].x + 2 * p.x + points[n + 1].x) / 4, y: (points[n - 1].y + 2 * p.y + points[n + 1].y) / 4 }));
  return points;
}

export function crestField(lines: CrestPoint[][], side: number, metersPerTile: number): Float32Array {
  const field = new Float32Array(side * side * 4);
  const best = new Float32Array(side * side).fill(Infinity);
  for (let k = 0; k < side * side; k++) {
    field[k * 4] = CREST_NONE_METERS;
    field[k * 4 + 1] = CREST_NONE_METERS;
    field[k * 4 + 3] = CREST_NONE;
  }
  for (const line of lines) {
    const total = lengthOf(line);
    let along = 0;
    for (let n = 1; n < line.length; n++) {
      const a = line[n - 1];
      const b = line[n];
      const span = Math.hypot(b.x - a.x, b.y - a.y);
      stampSegment(field, best, side, metersPerTile, a, b, along, span, total);
      along += span;
    }
  }
  return field;
}

function stampSegment(field: Float32Array, best: Float32Array, side: number, metersPerTile: number, a: CrestPoint, b: CrestPoint, along: number, span: number, total: number): void {
  const fromX = Math.max(0, Math.floor(Math.min(a.x, b.x) - CREST_STAMP_TILES));
  const toX = Math.min(side - 1, Math.ceil(Math.max(a.x, b.x) + CREST_STAMP_TILES));
  const fromY = Math.max(0, Math.floor(Math.min(a.y, b.y) - CREST_STAMP_TILES));
  const toY = Math.min(side - 1, Math.ceil(Math.max(a.y, b.y) + CREST_STAMP_TILES));
  for (let y = fromY; y <= toY; y++)
    for (let x = fromX; x <= toX; x++) {
      const t = span > 0 ? Math.min(1, Math.max(0, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / (span * span))) : 0;
      const qx = a.x + (b.x - a.x) * t;
      const qy = a.y + (b.y - a.y) * t;
      const distance = Math.hypot(qx - x, qy - y);
      const k = y * side + x;
      if (distance > CREST_STAMP_TILES || distance >= best[k]) continue;
      best[k] = distance;
      const at = along + span * t;
      field[k * 4] = (qx - x) * metersPerTile;
      field[k * 4 + 1] = (qy - y) * metersPerTile;
      field[k * 4 + 2] = Math.atan2(b.y - a.y, b.x - a.x);
      field[k * 4 + 3] = Math.min(1, Math.min(at, total - at) / CREST_TAPER_TILES);
    }
}

export function crestGap(field: Float32Array, side: number, metersPerTile: number, at: CrestPoint): { across: number; taper: number } {
  const baseX = Math.floor(at.x / metersPerTile);
  const baseY = Math.floor(at.y / metersPerTile);
  let nearest = { across: Infinity, taper: 0 };
  let reach = Infinity;
  for (const [dx, dy] of CORNERS) {
    const cx = Math.min(side - 1, Math.max(0, baseX + dx));
    const cy = Math.min(side - 1, Math.max(0, baseY + dy));
    const k = (cy * side + cx) * 4;
    if (field[k + 3] < 0 || Math.hypot(at.x - (cx * metersPerTile + field[k]), at.y - (cy * metersPerTile + field[k + 1])) >= reach) continue;
    const toX = at.x - (cx * metersPerTile + field[k]);
    const toY = at.y - (cy * metersPerTile + field[k + 1]);
    reach = Math.hypot(toX, toY);
    const tx = Math.cos(field[k + 2]);
    const ty = Math.sin(field[k + 2]);
    const past = Math.max(Math.abs(toX * tx + toY * ty) - CREST_REACH_ALONG * metersPerTile, 0);
    nearest = { across: Math.hypot(past, toX * -ty + toY * tx), taper: field[k + 3] };
  }
  return nearest;
}

export type CrestUniforms = {
  groundCrest: { value: THREE.Texture };
  groundCrestReady: { value: number };
  groundCrestSide: { value: number };
  groundCrestTileMeters: { value: number };
  inkCrestLine: { value: number };
  inkCrestWidth: { value: number };
};

export class GroundCrest {
  readonly uniforms: CrestUniforms;
  private built = -1;
  private pending = false;
  constructor(
    private readonly form: Float32Array,
    private readonly corners: ArrayLike<number>,
    private readonly side: number,
    private readonly metersPerTile: number,
  ) {
    const empty = new THREE.DataTexture(new Uint16Array(4), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType);
    const line = Object.defineProperty({ value: 0 }, "value", {
      get: () => {
        this.follow();
        return TUNING.crestLine.value;
      },
    });
    this.uniforms = {
      groundCrest: { value: empty },
      groundCrestReady: { value: 0 },
      groundCrestSide: { value: side },
      groundCrestTileMeters: { value: metersPerTile },
      inkCrestLine: line,
      inkCrestWidth: TUNING.crestWidth,
    };
  }

  private follow(): void {
    if (this.pending || TUNING.crestFold.value === this.built) return;
    this.pending = true;
    setTimeout(() => this.rebuild(), 0);
  }

  private rebuild(): void {
    const fold = TUNING.crestFold.value;
    const lines = crestLines(this.form, this.corners, this.side, this.metersPerTile, { ...CREST_SHAPE, leastFoldMeters: fold });
    const field = crestField(lines, this.side, this.metersPerTile);
    const half = new Uint16Array(field.length);
    for (let k = 0; k < field.length; k++) half[k] = THREE.DataUtils.toHalfFloat(field[k]);
    const texture = new THREE.DataTexture(half, this.side, this.side, THREE.RGBAFormat, THREE.HalfFloatType);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    this.uniforms.groundCrest.value.dispose();
    this.uniforms.groundCrest.value = texture;
    this.uniforms.groundCrestReady.value = 1;
    this.built = fold;
    this.pending = false;
  }
}

export const CREST_GLSL = `
uniform sampler2D groundCrest;
uniform float groundCrestReady;
uniform float groundCrestSide;
uniform float groundCrestTileMeters;
uniform float inkCrestLine;
uniform float inkCrestWidth;
float groundCrestHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float groundCrestNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(groundCrestHash(cell), groundCrestHash(cell + vec2(1.0, 0.0)), f.x), mix(groundCrestHash(cell + vec2(0.0, 1.0)), groundCrestHash(cell + vec2(1.0, 1.0)), f.x), f.y);
}
float groundCrestLine(vec2 at) {
  if (groundCrestReady < 0.5 || inkCrestLine <= 0.0) return 0.0;
  float px = max(max(fwidth(at.x), fwidth(at.y)), 1e-4);
  ivec2 base = ivec2(floor(at / groundCrestTileMeters));
  int last = int(groundCrestSide) - 1;
  float nearest = 1e9;
  float reach = 1e9;
  float taper = 0.0;
  vec2 foot = at;
  for (int n = 0; n < 4; n++) {
    ivec2 corner = clamp(base + ivec2(n % 2, n / 2), ivec2(0), ivec2(last));
    vec4 crest = texelFetch(groundCrest, corner, 0);
    if (crest.a < 0.0) continue;
    vec2 point = vec2(corner) * groundCrestTileMeters + crest.rg;
    vec2 to = at - point;
    vec2 along = vec2(cos(crest.b), sin(crest.b));
    float ahead = dot(to, along);
    if (length(to) < reach) {
      reach = length(to);
      nearest = length(vec2(max(abs(ahead) - ${CREST_REACH_ALONG.toFixed(2)} * groundCrestTileMeters, 0.0), dot(to, vec2(-along.y, along.x))));
      taper = crest.a;
      foot = point + along * ahead;
    }
  }
  float kept = smoothstep(${CREST_GAP_SHARE.toFixed(2)}, ${(CREST_GAP_SHARE + 0.08).toFixed(2)}, groundCrestNoise(foot / ${CREST_GAP_METERS.toFixed(1)}));
  float halfWidth = 0.5 * inkCrestWidth * taper * kept * mix(0.6, 1.3, groundCrestNoise(foot / ${CREST_SWELL_METERS.toFixed(1)} + 17.0));
  float seen = sqrt(clamp(2.0 * halfWidth / px, 0.0, 1.0));
  float drawn = max(halfWidth, 0.5 * px);
  return (1.0 - smoothstep(drawn - 0.5 * px, drawn + 0.5 * px, nearest)) * seen;
}
`;
