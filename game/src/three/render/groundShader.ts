import * as THREE from "three";
import { PHYSICS } from "../../data/physics";
import { TERRAIN_TYPES } from "../../data/terrain";
import { ROAD_PLAIN, ROAD_SAND, type PaintCanvas } from "../../render/groundPaint";
import { PATCH_UNIT } from "../../render/highwayWear";
import { mix, PAL } from "../../render/palette";
import type { Site } from "../../sim/sites";
import type { Terrain } from "../../sim/terrain";
import { groundFields } from "./groundFields";
import { injectAfter } from "./shaderPatch";
import { TUNING } from "./inkTuning";

const S = PHYSICS.metersPerTile;
const OWNER = "The drawn ground";
const DIRT_UNDER = TERRAIN_TYPES.track.color;
const DIRT_EDGE = 0.44;
const DIRT_BLEND = 0.12;
const BAND_FROM = "0.1";
const BAND_FULL = "0.25";
const GLASS_PLATE = 2;
const GLASS_TINT = 0.16;
const GLASS_SEAM = 0.25;
const GLASS_SEAM_MIX = 0.45;
const GLASS_WARP = 2.2;
const GLASS_WARP_SCALE = 2.5;
const GLASS_EDGE_WOBBLE = 0.35;
const GLASS_EDGE_SCALE = 1.6;
const GLASS_EDGE_FINE = 0.12;
const GLASS_EDGE_FINE_SCALE = 0.5;
const GLASS_DUST_MIX = 0.35;
const GLASS_BASE = mix(TERRAIN_TYPES.glass.color, PAL.sand[3], 0.07);
const GLASS_DUST = mix(PAL.glass.top, 0xb9a47c, 0.6);
const GLASS_SEAM_COLOR = mix(PAL.glass.top, 0xffffff, 0.45);
const WEAR_YELLOW = mix(0xd9a93a, PAL.sand[3], 0.2);
const WEAR_TEAR_FROM = 0.92;
const WEAR_GRAIN = 2;
const WEAR_DUST = 0.05;
const DRAWN_BLUR = 1;
const DRAWN_SIDE_EDGE = 0.08;
const DRAWN_SCRUB_SPREAD = 3;
const DRAWN_SCRUB_REACH = 2;
const DRAWN_BORDER_PROBE = 0.2;
const DRAWN_ROAD_CRACK_CELL = 3;
const DRAWN_RISE_RING = 8;
const DRAWN_RISE_REACH_TILES = 8;
const DRAWN_EDGE_LINE = 0.8;
const DRAWN_SCRATCH_LONG = 0.6;
const DRAWN_SCRATCH_ACROSS = 0.07;
const DRAWN_SCRATCH_SHARE = 0.05;
const DRAWN_MARK_DARK = 0.45;
const ROAD_ALBEDO = "0.186, 0.222, 0.284";
const ROAD_HALF = 2.7;
const CENTER_LINE_WIDTH = 0.05;
const CENTER_LINE_FROM = 0.56;
const CENTER_LINE_STRETCH = 35;
const CENTER_LINE_WORN = 0.1;
const CENTER_LINE_GRAIN = 0.05;
const CENTER_LINE_PAINT = "0.62, 0.72, 0.85";
const CENTER_LINE_FADE = 0.5;
const DASH_EVERY = 6;
const DASH_KEPT = 0.5;

export function drawGround(material: THREE.MeshLambertMaterial, mask: PaintCanvas, t: Terrain, shelters: readonly Site[]): void {
  const fields = groundFields(mask, t, shelters);
  const worn = fields.highwayWear !== undefined;
  const uniforms = { ...fields, ...lookUniforms(), ...(worn ? wearLook() : {}) };
  const header = `#define PAD_COUNT ${fields.padCenters.value.length}\n${worn ? "#define HIGHWAY_WEAR\n" : ""}${GROUND_DECLARATIONS}`;
  const before = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = injectAfter(OWNER, shader.vertexShader, "#include <common>", "varying vec2 vRoadXZ;");
    shader.vertexShader = injectAfter(OWNER, shader.vertexShader, "#include <project_vertex>", "vRoadXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
    shader.fragmentShader = injectAfter(OWNER, shader.fragmentShader, "#include <common>", header);
    shader.fragmentShader = injectAfter(OWNER, shader.fragmentShader, "#include <map_fragment>", GROUND_BODY);
  };
  material.customProgramCacheKey = () => `${key()}|roads${worn ? "|wear" : ""}`;
  material.needsUpdate = true;
}

function lookUniforms() {
  return {
    drawnEdgeWobble: TUNING.edgeWobble,
    drawnEdgeReach: TUNING.edgeReach,
    drawnWaveSize: TUNING.waveSize,
    drawnGrainAmount: TUNING.grain,
    asphaltColor: { value: new THREE.Color(PAL.highwayAsphalt) },
    roadPlainLuma: { value: luma(new THREE.Color(ROAD_PLAIN)) },
    roadSandLuma: { value: luma(new THREE.Color(ROAD_SAND)) },
    dirtGroundLuma: { value: luma(new THREE.Color(DIRT_UNDER)) },
    dirtTint: { value: dirtTint() },
    glassBase: { value: new THREE.Color(GLASS_BASE) },
    glassPlate: { value: GLASS_PLATE * S },
    glassTint: { value: GLASS_TINT },
    glassSeam: { value: GLASS_SEAM },
    glassSeamColor: { value: new THREE.Color(GLASS_SEAM_COLOR) },
    glassDust: { value: new THREE.Color(GLASS_DUST) },
    padDust: { value: new THREE.Color(PAL.sand[3]) },
    padMark: { value: new THREE.Color(PAL.padMark) },
  };
}

function wearLook() {
  return {
    wearBaseLuma: { value: luma(new THREE.Color(PAL.road)) },
    wearYellow: { value: new THREE.Color(WEAR_YELLOW) },
    wearSand: { value: new THREE.Color(PAL.desertSand) },
  };
}

function dirtTint(): THREE.Vector3 {
  const road = new THREE.Color(PAL.road);
  const dirt = new THREE.Color(PAL.dirtRoad);
  return new THREE.Vector3(dirt.r / road.r, dirt.g / road.g, dirt.b / road.b);
}

function luma(c: THREE.Color): number {
  return c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
}

const UNIFORMS = `varying vec2 vRoadXZ;
uniform sampler2D roadMask;
uniform sampler2D roadDetail;
uniform sampler2D roadTone;
uniform float facetSide;
uniform float mapUvPerMeter;
uniform vec3 asphaltColor;
uniform float roadOrigin;
uniform float roadMaskMeters;
uniform float roadDetailMeters;
uniform float roadToneMeters;
uniform float roadPlainLuma;
uniform float roadSandLuma;
uniform float dirtGroundLuma;
uniform vec3 dirtTint;
uniform vec3 glassBase;
uniform float glassPlate;
uniform float glassTint;
uniform float glassSeam;
uniform vec3 glassSeamColor;
uniform vec3 glassDust;
#if PAD_COUNT > 0
uniform vec2 padCenters[PAD_COUNT];
uniform vec2 padAxes[PAD_COUNT];
#endif
uniform vec2 padHalf;
uniform float padBorder;
uniform vec3 padDust;
uniform vec3 padMark;
uniform sampler2D roadField;
uniform float heightSide;
uniform sampler2DArray groundKinds;
uniform float groundKindSide;
uniform float groundKindMeters;
uniform float drawnEdgeWobble;
uniform float drawnEdgeReach;
uniform float drawnWaveSize;
uniform float drawnGrainAmount;
`;

const WEAR_FUNCTIONS = `#ifdef HIGHWAY_WEAR
uniform sampler2D highwayWear;
uniform float wearBaseLuma;
uniform vec3 wearYellow;
uniform vec3 wearSand;
float wearHash(float a, float k) {
  return fract(a * 255.0 * k + 0.31);
}
vec3 wearPaint(vec3 color, vec4 wear, vec4 roadLook, float wander) {
  float yellow = floor(wear.r * 255.0 + 0.5) / 15.0;
  float paintHash = wearHash(roadLook.a, 0.618034);
  vec3 paintShade = vec3(0.82 + 0.18 * wander);
  if (yellow > 0.0 && paintHash <= yellow) color = wearYellow * paintShade;
  return color;
}
vec3 wearPatch(vec3 color, vec4 wear, vec4 roadLook) {
  float kind = floor(wear.a * 255.0 / ${PATCH_UNIT}.0 + 0.5);
  float show = (kind == 2.0 || kind == 4.0) ? step(0.5, wearHash(roadLook.a, 0.754878)) : 1.0;
  if (kind == 1.0) return color * 0.8;
  if (kind == 2.0 || kind == 3.0) return color * mix(1.0, 0.82, show);
  if (kind >= 4.0) return color * mix(1.0, 1.34, show);
  return color;
}
vec3 wearSandOver(vec3 color, vec4 wear, vec4 roadLook, float wander) {
  float sandHash = wearHash(roadLook.a, 0.569840);
  vec3 sand = wearSand * (0.92 + 0.12 * wander);
  if (sandHash < wear.g) return sand;
  if (wear.g > 0.0 && sandHash < wear.g + 0.2) return mix(color, sand, 0.35);
  return color;
}
#endif
`;

const NOISE = `float noiseHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(noiseHash(i), noiseHash(i + vec2(1.0, 0.0)), f.x), mix(noiseHash(i + vec2(0.0, 1.0)), noiseHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float markHash(vec2 p) {
  return fract(sin(dot(mod(p, 289.0), vec2(127.1, 311.7))) * 43758.5453);
}
`;

const KIND_BORDERS = `vec4 drawnKindsSmooth(float layer, vec2 tile) {
  vec2 first = floor(tile - 0.5) + 0.5;
  vec2 f = tile - first;
  vec2 g = 1.0 - f;
  vec2 w0 = g * g * g / 6.0;
  vec2 w1 = (4.0 + f * f * (3.0 * f - 6.0)) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f * f - 3.0 * f * f * f) / 6.0;
  vec2 w3 = f * f * f / 6.0;
  vec2 w12 = w1 + w2;
  vec2 at0 = (first - 1.0) / groundKindSide;
  vec2 at12 = (first + w2 / w12) / groundKindSide;
  vec2 at3 = (first + 2.0) / groundKindSide;
  vec4 row0 = textureLod(groundKinds, vec3(at0.x, at0.y, layer), 0.0) * w0.x + textureLod(groundKinds, vec3(at12.x, at0.y, layer), 0.0) * w12.x + textureLod(groundKinds, vec3(at3.x, at0.y, layer), 0.0) * w3.x;
  vec4 row12 = textureLod(groundKinds, vec3(at0.x, at12.y, layer), 0.0) * w0.x + textureLod(groundKinds, vec3(at12.x, at12.y, layer), 0.0) * w12.x + textureLod(groundKinds, vec3(at3.x, at12.y, layer), 0.0) * w3.x;
  vec4 row3 = textureLod(groundKinds, vec3(at0.x, at3.y, layer), 0.0) * w0.x + textureLod(groundKinds, vec3(at12.x, at3.y, layer), 0.0) * w12.x + textureLod(groundKinds, vec3(at3.x, at3.y, layer), 0.0) * w3.x;
  return row0 * w0.y + row12 * w12.y + row3 * w3.y;
}
vec3 drawnNearestBorder(vec2 tile, out vec4 hereA, out vec4 hereB, out vec4 hereC, out vec3 scrub) {
  hereA = drawnKindsSmooth(0.0, tile);
  hereB = drawnKindsSmooth(1.0, tile);
  hereC = drawnKindsSmooth(2.0, tile);
  vec2 across = vec2(${DRAWN_BORDER_PROBE.toFixed(2)}, 0.0);
  vec4 riseAx = (drawnKindsSmooth(0.0, tile + across) - hereA) / across.x;
  vec4 riseAy = (drawnKindsSmooth(0.0, tile + across.yx) - hereA) / across.x;
  vec4 riseBx = (drawnKindsSmooth(1.0, tile + across) - hereB) / across.x;
  vec4 riseBy = (drawnKindsSmooth(1.0, tile + across.yx) - hereB) / across.x;
  float riseCx = (drawnKindsSmooth(2.0, tile + across).r - hereC.r) / across.x;
  float riseCy = (drawnKindsSmooth(2.0, tile + across.yx).r - hereC.r) / across.x;
  float steepC = max(sqrt(riseCx * riseCx + riseCy * riseCy), 0.0001);
  float depthC = (hereC.r - 0.5) / steepC;
  vec4 steepA = max(sqrt(riseAx * riseAx + riseAy * riseAy), vec4(0.0001));
  vec4 steepB = max(sqrt(riseBx * riseBx + riseBy * riseBy), vec4(0.0001));
  vec4 depthA = (hereA - 0.5) / steepA;
  vec4 depthB = (hereB - 0.5) / steepB;
  scrub = vec3(vec2(riseBx.g, riseBy.g) / steepB.g, depthB.g);
  vec3 nearest = vec3(0.0, 0.0, 10000.0);
  for (int i = 0; i < 4; i++) {
    if (abs(depthA[i]) < abs(nearest.z)) nearest = vec3(vec2(riseAx[i], riseAy[i]) / steepA[i], depthA[i]);
    if (abs(depthB[i]) < abs(nearest.z)) nearest = vec3(vec2(riseBx[i], riseBy[i]) / steepB[i], depthB[i]);
  }
  if (abs(depthC) < abs(nearest.z)) nearest = vec3(vec2(riseCx, riseCy) / steepC, depthC);
  return nearest;
}
`;

const RELIEF = `float drawnSample(vec2 texel) {
  return textureLod(roadField, (texel + 0.5) / heightSide, 0.0).a;
}
float drawnCorner(ivec2 corner) {
  int last = int(heightSide) - 1;
  return texelFetch(roadField, clamp(corner, ivec2(0), ivec2(last)), 0).a;
}
vec4 drawnSplineWeights(float f) {
  float g = 1.0 - f;
  return vec4(g * g * g, 4.0 - 6.0 * f * f + 3.0 * f * f * f, 1.0 + 3.0 * f + 3.0 * f * f - 3.0 * f * f * f, f * f * f) / 6.0;
}
vec4 drawnSplineSlopes(float f) {
  float g = 1.0 - f;
  return vec4(-g * g, 3.0 * f * f - 4.0 * f, -3.0 * f * f + 2.0 * f + 1.0, f * f) / 2.0;
}
vec3 drawnSmoothGround(vec2 at) {
  vec2 x = at / facetSide;
  vec2 cell = floor(x);
  vec2 f = x - cell;
  ivec2 base = ivec2(cell) - 1;
  vec4 wx = drawnSplineWeights(f.x);
  vec4 wy = drawnSplineWeights(f.y);
  vec4 sx = drawnSplineSlopes(f.x);
  vec4 sy = drawnSplineSlopes(f.y);
  vec3 ground = vec3(0.0);
  for (int j = 0; j < 4; j++)
    for (int i = 0; i < 4; i++) {
      float h = drawnCorner(base + ivec2(i, j));
      ground += h * vec3(wx[i] * wy[j] * facetSide, sx[i] * wy[j], wx[i] * sy[j]);
    }
  return ground;
}
`;

const SURFACE_MARKS = `float drawnLine(float dist, float width, float px) {
  float shown = max(width, px * 0.5);
  return (1.0 - smoothstep(shown - px * 0.5, shown + px * 0.5, dist)) * min(1.0, width / (px * 0.5));
}
float drawnCrackEdge(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = p - cell;
  float first = 8.0;
  float second = 8.0;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 seed = o + 0.1 + 0.8 * vec2(markHash(cell + o), markHash(cell + o + 19.1));
      float d = length(seed - f);
      if (d < first) { second = first; first = d; } else if (d < second) second = d;
    }
  return (second - first) * 0.5;
}
float drawnCracks(vec2 p, float cell, float px) {
  return drawnLine(drawnCrackEdge(p / cell) * cell, 0.03, px) * step(0.42, valueNoise(p / (cell * 0.6)));
}
float drawnRipples(vec2 p, float px) {
  float q = dot(p, vec2(0.8, 0.6)) + sin(dot(p, vec2(-0.6, 0.8)) * 2.2) * 0.18;
  return drawnLine(abs(fract(q / 0.55) - 0.5) * 0.55, 0.02, px) * step(0.45, valueNoise(p / 1.3));
}
float drawnWaves(vec2 p, float px) {
  float row = floor(p.y / 0.7);
  float along = p.x / 0.9 + markHash(vec2(row, 4.0)) * 5.0;
  float inside = fract(along);
  float keep = step(markHash(vec2(floor(along), row) + 3.0), 0.35) * step(0.15, inside) * step(inside, 0.85);
  return drawnLine(abs(p.y - (row + 0.5) * 0.7 - sin(inside * 6.2831853) * 0.06), 0.02, px) * keep;
}
float drawnGrain(vec2 p, float px) {
  vec2 along = mat2(0.94, 0.34, -0.34, 0.94) * p;
  vec2 across = mat2(0.82, -0.57, 0.57, 0.82) * p + 5.0;
  float flecks = (valueNoise(along / vec2(0.14, 0.45)) - 0.5) * 0.7 + (valueNoise(across / vec2(0.3, 0.8) + 9.0) - 0.5) * 0.5;
  return flecks * mix(0.3, 1.0, valueNoise(p / 3.5 + 17.0)) * (1.0 - smoothstep(0.06, 0.14, px));
}
float drawnStones(vec2 p, float cell, float seed, float px) {
  vec2 c = floor(p / cell);
  vec2 f = p / cell - c;
  vec2 center = 0.28 + 0.44 * vec2(markHash(c + seed), markHash(c + seed + 3.1));
  float radius = mix(0.1, 0.24, markHash(c + seed + 5.3));
  float edge = px / cell;
  float stone = 1.0 - smoothstep(radius - edge, radius + edge, length(f - center));
  float tone = (markHash(c + seed + 7.7) < 0.5 ? -1.0 : 1.0) * mix(0.5, 1.0, markHash(c + seed + 9.1));
  return stone * tone * step(markHash(c + seed + 11.9), 0.7) * (1.0 - smoothstep(cell / 6.0, cell / 3.0, px));
}
float drawnSeams(vec2 p, float px) {
  vec2 toLine = (0.5 - abs(fract(p / 3.0) - 0.5)) * 3.0;
  return drawnLine(min(toLine.x, toLine.y), 0.02, px);
}
`;

const GROUND_DECLARATIONS = `${UNIFORMS}${WEAR_FUNCTIONS}${NOISE}${KIND_BORDERS}${RELIEF}${SURFACE_MARKS}`;

const BORDER_BODY = `
  vec3 blurredGround = textureLod(map, vMapUv, 2.5).rgb;
  vec2 drawnWarp = (vec2(valueNoise(vRoadXZ / drawnWaveSize), valueNoise(vRoadXZ / drawnWaveSize + 7.0)) - 0.5) * 1.4 * facetSide * drawnEdgeWobble;
  vec4 drawnRawA;
  vec4 drawnRawB;
  vec4 drawnRawC;
  vec3 drawnScrub;
  vec3 drawnBorder = drawnNearestBorder((vRoadXZ + drawnWarp) / facetSide, drawnRawA, drawnRawB, drawnRawC, drawnScrub);
  vec2 drawnInside = drawnBorder.xy * (max(drawnBorder.z, drawnEdgeReach) - drawnBorder.z);
  vec2 drawnOutside = drawnBorder.xy * (min(drawnBorder.z, -drawnEdgeReach) - drawnBorder.z);
  vec2 drawnMapAt = vMapUv + drawnWarp * mapUvPerMeter;
  float drawnTilePx = max(length(fwidth(vRoadXZ)), 0.0005) / facetSide;
  float drawnSide = smoothstep(-${DRAWN_SIDE_EDGE.toFixed(2)} - drawnTilePx, ${DRAWN_SIDE_EDGE.toFixed(2)} + drawnTilePx, drawnBorder.z);
  vec3 drawnOutColor = textureLod(map, drawnMapAt + drawnOutside * facetSide * mapUvPerMeter, ${DRAWN_BLUR.toFixed(1)}).rgb;
  vec3 drawnInColor = textureLod(map, drawnMapAt + drawnInside * facetSide * mapUvPerMeter, ${DRAWN_BLUR.toFixed(1)}).rgb;
  diffuseColor.rgb = mix(drawnOutColor, drawnInColor, drawnSide);
  float drawnClumps = valueNoise(vRoadXZ / 1.6 + 41.0) * 0.35 + valueNoise(vRoadXZ / 0.6 + 43.0) * 0.3 + (valueNoise(vRoadXZ / 0.25 + 47.0) - 0.5) * 0.35 * (1.0 - smoothstep(0.05, 0.1, drawnTilePx * facetSide)) - 0.325;
  float drawnScrubAt = drawnScrub.z + drawnClumps * ${DRAWN_SCRUB_SPREAD.toFixed(2)};
  float drawnScrubAa = max(fwidth(drawnScrubAt), drawnTilePx);
  float drawnScrubCover = smoothstep(-drawnScrubAa, drawnScrubAa, drawnScrubAt);
  vec3 drawnScrubIn = textureLod(map, drawnMapAt + drawnScrub.xy * (max(drawnScrub.z, ${DRAWN_SCRUB_REACH.toFixed(1)}) - drawnScrub.z) * facetSide * mapUvPerMeter, ${DRAWN_BLUR.toFixed(1)}).rgb;
  vec3 drawnScrubOut = textureLod(map, drawnMapAt + drawnScrub.xy * (min(drawnScrub.z, -${DRAWN_SCRUB_REACH.toFixed(1)}) - drawnScrub.z) * facetSide * mapUvPerMeter, ${DRAWN_BLUR.toFixed(1)}).rgb;
  float drawnScrubNear = 1.0 - smoothstep(${DRAWN_SCRUB_SPREAD.toFixed(2)} * 0.4, ${DRAWN_SCRUB_SPREAD.toFixed(2)} * 0.55, abs(drawnScrub.z));
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(drawnScrubOut, drawnScrubIn, drawnScrubCover), drawnScrubNear);
  vec4 drawnFwA = max(fwidth(drawnRawA), vec4(0.0001));
  vec4 drawnFwB = max(fwidth(drawnRawB), vec4(0.0001));
  vec4 drawnKindA = smoothstep(0.5 - drawnFwA, 0.5 + drawnFwA, drawnRawA);
  vec4 drawnKindB = smoothstep(0.5 - drawnFwB, 0.5 + drawnFwB, drawnRawB);
  vec3 paintedGround = diffuseColor.rgb;
`;

const GLASS_BODY = `
  float glassEdge = texture(groundKinds, vec3(vRoadXZ / groundKindMeters, 2.0)).b
    + (valueNoise(vRoadXZ / ${(GLASS_EDGE_SCALE * S).toFixed(2)}) - 0.5) * ${GLASS_EDGE_WOBBLE.toFixed(2)}
    + (valueNoise(vRoadXZ / ${(GLASS_EDGE_FINE_SCALE * S).toFixed(2)} + 53.1) - 0.5) * ${GLASS_EDGE_FINE.toFixed(2)};
  float glassSoft = fwidth(glassEdge) * 0.75;
  float glassCover = smoothstep(0.5 - glassSoft, 0.5 + glassSoft, glassEdge);
  if (glassCover > 0.0) {
    vec3 groundColor = diffuseColor.rgb;
    diffuseColor.rgb = glassBase;
    vec2 glassAt = vRoadXZ + (vec2(valueNoise(vRoadXZ / ${GLASS_WARP_SCALE.toFixed(2)}), valueNoise(vRoadXZ / ${GLASS_WARP_SCALE.toFixed(2)} + 31.7)) - 0.5) * ${GLASS_WARP.toFixed(2)};
    vec2 plateAt = glassAt / glassPlate;
    vec2 plateCell = floor(plateAt);
    vec2 plateIn = plateAt - plateCell;
    float plateFlip = step(0.5, fract(sin(dot(plateCell, vec2(27.17, 91.43))) * 43758.5453));
    float plateU = mix(plateIn.x, 1.0 - plateIn.x, plateFlip);
    float plateHalf = plateU + plateIn.y > 1.0 ? 1.0 : 0.0;
    float plateHash = fract(sin(dot(plateCell + plateHalf * vec2(0.53, 0.29), vec2(12.9898, 78.233))) * 43758.5453);
    float glassBroad = valueNoise(vRoadXZ / 7.0);
    float glassFine = valueNoise(vRoadXZ / 0.8);
    diffuseColor.rgb *= 1.0 + (plateHash - 0.5) * 2.0 * glassTint + (glassBroad - 0.5) * 0.16 + (glassFine - 0.5) * 0.06;
    diffuseColor.rgb = mix(diffuseColor.rgb, glassDust, smoothstep(0.35, 0.8, valueNoise(vRoadXZ / 4.0 + 7.3)) * ${GLASS_DUST_MIX.toFixed(2)});
    float plateEdge = min(min(plateIn.x, 1.0 - plateIn.x), min(plateIn.y, 1.0 - plateIn.y));
    float seamDist = min(plateEdge, abs(plateU + plateIn.y - 1.0) * 0.70710678) * glassPlate;
    float seamSoft = fwidth(seamDist) * 1.5;
    float seam = 1.0 - smoothstep(glassSeam * 0.5 - seamSoft, glassSeam * 0.5 + seamSoft, seamDist);
    seam *= smoothstep(0.4, 0.8, valueNoise(vRoadXZ / 3.0 + 19.1)) * (0.4 + 0.6 * glassFine);
    diffuseColor.rgb = mix(diffuseColor.rgb, glassSeamColor, seam * ${GLASS_SEAM_MIX});
    diffuseColor.rgb = mix(groundColor, diffuseColor.rgb, glassCover);
  }
`;

const ROAD_BODY = `
  vec3 roadMaskAt = textureLod(roadMask, (vRoadXZ - roadOrigin) / roadMaskMeters, 0.0).rgb;
  float dirtCover = roadMaskAt.g;
  float bandMask = roadMaskAt.b;
  vec4 roadLook = vec4(textureLod(roadDetail, (vRoadXZ - roadOrigin) / roadDetailMeters, 8.0).rgb, 0.5);
  float roadWander = textureLod(roadTone, (vRoadXZ - roadOrigin) / roadToneMeters, 0.0).r;
  float roadSand = texture(groundKinds, vec3(vRoadXZ / groundKindMeters, 2.0)).g;
  float groundLuma = dot(blurredGround, vec3(0.299, 0.587, 0.114));
  float groundShade = clamp(groundLuma / mix(roadPlainLuma, roadSandLuma, roadSand), 0.7, 1.2);
  float paintedLuma = dot(paintedGround, vec3(0.299, 0.587, 0.114));
  vec3 roadColor = vec3(${ROAD_ALBEDO}) * (0.94 + 0.12 * roadWander) * groundShade;
  vec3 roadFrame = textureLod(roadField, (vRoadXZ / facetSide + 0.5) / heightSide, 0.0).rgb;
  float centerLineAa = fwidth(roadFrame.z);
  float centerLine = 1.0 - smoothstep(${CENTER_LINE_WIDTH.toFixed(3)} - centerLineAa, ${CENTER_LINE_WIDTH.toFixed(3)} + centerLineAa, abs(roadFrame.z));
  float dashId = floor(roadFrame.y / ${DASH_EVERY.toFixed(1)});
  float dashAt = fract(roadFrame.y / ${DASH_EVERY.toFixed(1)});
  float dashStart = markHash(vec2(dashId, 13.1)) * 0.45;
  centerLine *= step(dashStart, dashAt) * step(dashAt, dashStart + 0.12 + 0.4 * markHash(vec2(dashId, 29.3)));
  centerLine *= step(markHash(vec2(dashId, 5.7)), ${DASH_KEPT.toFixed(2)});
  centerLine *= 0.45 + 0.55 * markHash(vec2(dashId, 37.9));
  centerLine *= smoothstep(${CENTER_LINE_FROM.toFixed(2)}, ${CENTER_LINE_FROM.toFixed(2)} + 0.06, valueNoise(vec2(roadFrame.y / ${CENTER_LINE_STRETCH.toFixed(1)}, 21.0)));
  centerLine *= step(${CENTER_LINE_WORN.toFixed(2)} + 0.35 * valueNoise(vRoadXZ / facetSide / 0.9), markHash(floor(vRoadXZ / facetSide / ${CENTER_LINE_GRAIN.toFixed(3)})));
  roadColor = mix(roadColor, vec3(${CENTER_LINE_PAINT}) * groundShade, centerLine * ${CENTER_LINE_FADE.toFixed(2)});
  vec3 dirtColor = roadLook.rgb * (0.94 + 0.12 * roadWander) * clamp(paintedLuma / dirtGroundLuma, 0.7, 1.2) * dirtTint;
  float roadEdge = ${ROAD_HALF.toFixed(2)};
  float roadEdgeAa = fwidth(roadFrame.x) * 1.2;
  float roadIn = 1.0 - smoothstep(roadEdge - roadEdgeAa, roadEdge + roadEdgeAa, roadFrame.x);
  float dirtIn = smoothstep(${DIRT_EDGE} - ${DIRT_BLEND.toFixed(2)}, ${DIRT_EDGE} + ${DIRT_BLEND.toFixed(2)}, dirtCover);
  diffuseColor.rgb = mix(diffuseColor.rgb, dirtColor, dirtIn);
  diffuseColor.rgb = mix(diffuseColor.rgb, roadColor, roadIn);
  vec2 drawnScratchCell = floor(vec2(roadFrame.y / ${DRAWN_SCRATCH_LONG.toFixed(1)}, roadFrame.z / ${DRAWN_SCRATCH_ACROSS.toFixed(2)}));
  float drawnScratch = step(markHash(drawnScratchCell + 7.7), ${DRAWN_SCRATCH_SHARE.toFixed(2)}) * (1.0 - smoothstep(0.1, 0.25, abs(fract(roadFrame.z / ${DRAWN_SCRATCH_ACROSS.toFixed(2)}) - 0.5)));
  diffuseColor.rgb *= 1.0 - ${DRAWN_MARK_DARK.toFixed(2)} * drawnScratch * 0.6 * roadIn;
  inkSurface.road = roadIn;
  inkSurface.edge = 1.0 - smoothstep(${DRAWN_EDGE_LINE.toFixed(2)} - 0.5, ${DRAWN_EDGE_LINE.toFixed(2)} + 0.5, abs(roadFrame.x - roadEdge) / max(roadEdgeAa / 1.2, 0.0001));
`;

const MARKS_BODY = `
  float drawnPx = max(length(fwidth(vRoadXZ)), 0.0005);
  float drawnOffRoad = 1.0 - roadIn;
  float drawnNear = (1.0 - smoothstep(0.04, 0.12, drawnPx)) * drawnOffRoad;
  float drawnCrackFine = drawnCracks(vRoadXZ, 1.8, drawnPx) * (1.0 - smoothstep(0.1, 0.2, drawnPx));
  float drawnCrack = drawnCrackFine * drawnOffRoad;
  float drawnRoadCrack = drawnCracks(vRoadXZ + 13.0, ${DRAWN_ROAD_CRACK_CELL.toFixed(1)}, drawnPx) * step(0.62, valueNoise(vRoadXZ / 14.0)) * roadIn;
  diffuseColor.rgb *= 1.0 - ${DRAWN_MARK_DARK.toFixed(2)} * drawnRoadCrack;
  float drawnLines = max(drawnRipples(vRoadXZ, drawnPx) * drawnKindA.b, drawnWaves(vRoadXZ, drawnPx) * drawnKindA.a);
  drawnLines = max(drawnLines, drawnSeams(vRoadXZ, drawnPx) * drawnKindB.a);
  float drawnSmudge = smoothstep(0.55, 0.8, valueNoise(vRoadXZ / 2.5)) * 0.5 * drawnKindB.b * drawnOffRoad;
  float drawnTone = 1.0 + drawnOffRoad * (dot(drawnKindA, vec4(0.0, 0.08, -0.18, -0.25)) + dot(drawnKindB, vec4(-0.05, -0.07, -0.15, 0.0)));
  diffuseColor.rgb *= drawnTone;
  float drawnStoneTone = drawnStones(vRoadXZ, 0.3, 91.0, drawnPx) * 0.16 + drawnStones(mat2(0.8, 0.6, -0.6, 0.8) * vRoadXZ, 0.17, 95.0, drawnPx) * 0.12;
  diffuseColor.rgb *= 1.0 + drawnStoneTone * drawnKindB.r * drawnOffRoad;
  diffuseColor.rgb *= 1.0 + drawnGrainAmount * drawnGrain(vRoadXZ, drawnPx) * smoothstep(0.25, 0.85, drawnRawB.g + (valueNoise(vRoadXZ / 1.7 + 3.0) - 0.5) * 0.5) * drawnOffRoad;
  diffuseColor.rgb *= 1.0 - ${DRAWN_MARK_DARK.toFixed(2)} * max(max(drawnLines * drawnNear, drawnSmudge), drawnCrack * drawnKindA.r * 0.6);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.93, 0.88), drawnCracks(vRoadXZ + 31.0, 1.8, drawnPx) * drawnKindA.g * drawnNear * 0.7);
`;

const RELIEF_BODY = `
  vec3 drawnGround = drawnSmoothGround(vRoadXZ);
  inkSurface.height = drawnGround.x;
  inkSurface.slope = drawnGround.yz;
  float drawnAround = 0.0;
  for (int i = 0; i < ${DRAWN_RISE_RING}; i++) {
    float drawnTurn = float(i) * ${(2 * Math.PI / DRAWN_RISE_RING).toFixed(5)};
    drawnAround += drawnSample(vRoadXZ / facetSide + vec2(cos(drawnTurn), sin(drawnTurn)) * ${DRAWN_RISE_REACH_TILES.toFixed(1)});
  }
  inkSurface.rise = inkSurface.height - drawnAround / ${DRAWN_RISE_RING.toFixed(1)} * facetSide;
`;

const BAND_BODY = `
  float bandCover = smoothstep(${BAND_FROM}, ${BAND_FULL}, bandMask);
#ifdef HIGHWAY_WEAR
  if (bandCover > 0.0) {
    vec4 wear = texture2D(highwayWear, (vRoadXZ - roadOrigin) / roadMaskMeters);
    float grain = dot(roadLook.rgb, vec3(0.299, 0.587, 0.114)) / wearBaseLuma;
    vec3 worn = asphaltColor * (0.94 + 0.12 * roadWander) * (1.0 + (grain - 1.0) * ${WEAR_GRAIN.toFixed(1)});
    worn = mix(worn, wearSand, ${WEAR_DUST} + 0.1 * roadWander);
    worn = wearPatch(worn, wear, roadLook);
    worn = wearPaint(worn, wear, roadLook, roadWander);
    worn = wearSandOver(worn, wear, roadLook, roadWander);
    float tear = smoothstep(${WEAR_TEAR_FROM}, 1.0, wear.b * 255.0 / 254.0) * 0.6;
    if (wearHash(roadLook.a, 0.381966) < tear) worn = wearSand * (0.92 + 0.12 * roadWander);
    diffuseColor.rgb = mix(diffuseColor.rgb, worn, bandCover);
  }
#else
  if (bandCover > 0.0) diffuseColor.rgb = mix(diffuseColor.rgb, asphaltColor * (0.94 + 0.12 * roadWander) * (0.96 + 0.08 * roadLook.a), bandCover);
#endif
`;

const PADS_BODY = `
#if PAD_COUNT > 0
  for (int i = 0; i < PAD_COUNT; i++) {
    vec2 padOff = vRoadXZ - padCenters[i];
    vec2 padIn = padHalf - abs(vec2(dot(padOff, padAxes[i]), dot(padOff, vec2(-padAxes[i].y, padAxes[i].x))));
    float padDepth = min(padIn.x, padIn.y);
    if (padDepth <= 0.0) continue;
    diffuseColor.rgb = mix(roadColor, padDust * groundShade, 0.35);
    if (padDepth < padBorder && roadLook.a > 0.12) diffuseColor.rgb = padMark * groundShade;
  }
#endif
`;

const GROUND_BODY = `{${BORDER_BODY}${GLASS_BODY}${ROAD_BODY}${MARKS_BODY}${RELIEF_BODY}${BAND_BODY}${PADS_BODY}}`;
