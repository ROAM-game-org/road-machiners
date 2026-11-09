import * as THREE from "three";
import { PHYSICS } from "../../data/physics";
import { TERRAIN_TYPES } from "../../data/terrain";
import { EDGE_LOOKS, GROUND_MATERIAL_IDS, groundMaterial, MARK_KINDS, ROAD_PLAIN, ROAD_SAND, TERRAIN_MARGIN, type MarkKind, type PaintCanvas } from "../../render/groundPaint";
import { PATCH_UNIT } from "../../render/highwayWear";
import { mix, PAL } from "../../render/palette";
import type { Site } from "../../sim/sites";
import type { Terrain } from "../../sim/terrain";
import { TOWARD_CAMERA } from "./camera";
import { BLOCK_COUNT_SHIFT, BLOCK_SIDE, BLOCK_SLOTS, groundFields, TILE_LAYER } from "./groundFields";
import { groundFormUniforms, type GroundFormUniforms } from "./groundForm";
import { INK_CONTRACT } from "./inkPaint";
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
const DRAWN_FAR_TILES = 8;
const FORM_BEND_STEP = 2;
const BLOCK_FULL = (1 << (BLOCK_SIDE * BLOCK_SIDE)) - 1;
const DRAWN_PEPPER_SPREAD = 3;
const DRAWN_BROAD_MIX = 0.12;
const DRAWN_PATCH_MIX = 0.05;
const DRAWN_PATCH_TILES = 24;
const DRAWN_WIND = { x: 0.8, y: 0.6 };
const DRAWN_STREAK_LONG = 14;
const DRAWN_STREAK_WIDE = 2.5;
const DRAWN_STREAK_MIX = 0.2;
const DRAWN_FINE_WAVE_SIZE = 2.6;
const DRAWN_FINE_WAVE_SHARE = 0.35;
const DRAWN_HALO_EDGE = 0.25;
const DRAWN_HALO_RIM_MIX = 0.45;
const DRAWN_HALO_CORE_MIX = 0.85;
const DRAWN_HALO_HIDES_MARKS = 0.3;
const DRAWN_MARK_FLAT_FROM = 0.82;
const DRAWN_MARK_FLAT_TO = 0.93;
const DRAWN_MARK_FADE_FROM = 0.1;
const DRAWN_MARK_FADE_TO = 0.22;
const DRAWN_CLOD_CELL = 0.5;
const DRAWN_CLOD_SHARE = 0.45;
const DRAWN_CLOD_MIX = 0.5;
const DRAWN_STONE_BIG_CELL = 0.6;
const DRAWN_STONE_BIG_MIX = 0.14;
const DRAWN_PUDDLE_SIZE = 2.2;
const DRAWN_PUDDLE_MIX = 0.3;
const DRAWN_PUDDLE_FROM = 0.82;
const DRAWN_SAND_RIPPLE_SPACING = 1.1;
const DRAWN_SAND_RIPPLE_WIDTH = 0.04;
const DRAWN_SAND_RIPPLE_MIX = 0.45;
const DRAWN_GLINT_PATCH = 14;
const DRAWN_GLINT_CALM = 0.03;
const DRAWN_GLINT_BUSY = 0.35;
const DRAWN_GLINT_ROW = 1.4;
const DRAWN_GLINT_LONG = 6;
const DRAWN_GLINT_WIDTH = 0.07;
const DRAWN_GLINT_MIX = 0.35;
const DRAWN_EDGE_LINE_REACH = 1.5;
const DRAWN_ROAD_CRACK_CELL = 3;
const DRAWN_RISE_RING = 8;
const DRAWN_RISE_REACH_TILES = 8;
const DRAWN_EDGE_LINE = 0.8;
const CACHE_EDGE_PX = 2;
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

export type DrawnGround = { uniforms: Record<string, THREE.IUniform>; form: GroundFormUniforms; header: string; key: string };

export type GroundCacheUniforms = {
  groundCacheColor: THREE.IUniform<THREE.Texture | null>;
  groundCacheData: THREE.IUniform<THREE.Texture | null>;
  groundCacheEdge: THREE.IUniform<THREE.Texture | null>;
  groundCacheShift: THREE.IUniform<THREE.Vector2>;
  groundCacheSize: THREE.IUniform<THREE.Vector2>;
  groundCacheDensity: THREE.IUniform<THREE.Vector2>;
  groundCacheReach: THREE.IUniform<number>;
};

export function drawnGround(mask: PaintCanvas, t: Terrain, shelters: readonly Site[], landforms: THREE.Texture | null): DrawnGround {
  const fields = groundFields(mask, t, shelters, landforms);
  const worn = fields.highwayWear !== undefined;
  return {
    uniforms: { ...fields, ...lookUniforms(), ...materialUniforms(), ...(worn ? wearLook() : {}) },
    form: groundFormUniforms(t),
    header: `#define PAD_COUNT ${fields.padCenters.value.length}\n${worn ? "#define HIGHWAY_WEAR\n" : ""}${landforms ? "#define GROUND_LANDFORMS\n" : ""}${GROUND_DECLARATIONS}`,
    key: `|roads${worn ? "|wear" : ""}${landforms ? "|landforms" : ""}`,
  };
}

export function drawGround(material: THREE.MeshLambertMaterial, ground: DrawnGround): void {
  patchGround(material, { ...ground.uniforms, ...ground.form }, `${ground.header}${FORM_UNIFORMS}`, GROUND_BODY, ground.key);
}

export function writeGroundCache(material: THREE.MeshLambertMaterial, ground: DrawnGround): void {
  patchGround(material, ground.uniforms, `${ground.header}${CACHE_OUTPUTS}${INK_CONTRACT}`, CACHE_WRITE, `${ground.key}|cacheWrite`);
}

export function readGroundCache(material: THREE.MeshLambertMaterial, cache: GroundCacheUniforms, form: GroundFormUniforms): void {
  patchGround(material, { ...cache, ...form }, `${CACHE_READ_UNIFORMS}${FORM_UNIFORMS}`, CACHE_READ, "|cacheRead");
}

function patchGround(material: THREE.MeshLambertMaterial, uniforms: Record<string, THREE.IUniform>, header: string, body: string, cacheKey: string): void {
  const before = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = injectAfter(OWNER, shader.vertexShader, "#include <common>", "varying vec2 vRoadXZ;");
    shader.vertexShader = injectAfter(OWNER, shader.vertexShader, "#include <project_vertex>", "vRoadXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
    shader.fragmentShader = injectAfter(OWNER, shader.fragmentShader, "#include <common>", header);
    shader.fragmentShader = injectAfter(OWNER, shader.fragmentShader, "#include <map_fragment>", body);
  };
  material.customProgramCacheKey = () => `${key()}${cacheKey}`;
  material.needsUpdate = true;
}

const CACHE_OUTPUTS = `
layout(location = 1) out highp vec4 groundCacheDataOut;
layout(location = 2) out highp vec4 groundCacheEdgeOut;
`;

function lookUniforms() {
  return {
    drawnEdgeWobble: TUNING.edgeWobble,
    drawnWaveSize: TUNING.waveSize,
    drawnGrainAmount: TUNING.grain,
    drawnHaloAmount: TUNING.halo,
    drawnEdgeSoft: TUNING.edgeSoft,
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

function materialUniforms() {
  const rows = GROUND_MATERIAL_IDS.map(groundMaterial);
  return {
    drawnMaterialColor: { value: rows.map((row) => new THREE.Color(row.color)) },
    drawnMaterialMark: { value: rows.map((row) => MARK_KINDS.indexOf(row.mark)) },
    drawnMaterialWave: { value: rows.map((row) => EDGE_LOOKS[row.edge].wave) },
    drawnMaterialPepper: { value: rows.map((row) => EDGE_LOOKS[row.edge].pepper) },
    drawnMaterialSpill: { value: rows.map((row) => row.spill) },
    drawnBroadTint: { value: new THREE.Color(PAL.sand[3]) },
    drawnFarTint: { value: new THREE.Color(PAL.sandFar) },
  };
}

function markIndex(mark: MarkKind): number {
  return MARK_KINDS.indexOf(mark);
}

function pickMaterial(table: string): string {
  return `vec3(${table}[block.ids.x], ${table}[block.ids.y], ${table}[block.ids.z])`;
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
uniform highp sampler2DArray groundTiles;
uniform bool groundBlocksReady;
uniform float groundTileSide;
uniform float groundTileMeters;
#ifdef GROUND_LANDFORMS
uniform sampler2D groundLandforms;
#endif
uniform vec3 drawnMaterialColor[${GROUND_MATERIAL_IDS.length}];
uniform float drawnMaterialMark[${GROUND_MATERIAL_IDS.length}];
uniform float drawnMaterialWave[${GROUND_MATERIAL_IDS.length}];
uniform float drawnMaterialPepper[${GROUND_MATERIAL_IDS.length}];
uniform float drawnMaterialSpill[${GROUND_MATERIAL_IDS.length}];
uniform vec3 drawnBroadTint;
uniform vec3 drawnFarTint;
uniform float drawnEdgeWobble;
uniform float drawnWaveSize;
uniform float drawnGrainAmount;
uniform float drawnHaloAmount;
uniform float drawnEdgeSoft;
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

const MATERIAL_BORDERS = `struct DrawnBorder { int lo; int hi; float toward; float wave; float pepper; float spill; vec3 spillColor; };
struct DrawnBlock { ivec3 ids; ivec3 masks; };
int drawnMaterialAt(vec2 tile) {
  ivec2 at = clamp(ivec2(floor(tile)), ivec2(0), ivec2(int(groundTileSide) - 1));
  return int(texelFetch(groundTiles, ivec3(at, ${TILE_LAYER.tiles}), 0).r * 255.0 + 0.5);
}
ivec4 drawnBlockTexel(ivec2 cell, int layer) {
  return ivec4(texelFetch(groundTiles, ivec3(cell, layer), 0) * 255.0 + 0.5);
}
bool drawnBlockAt(vec2 tile, out DrawnBlock block) {
  ivec2 cell = ivec2(floor(tile - 0.5));
  if (!groundBlocksReady || any(lessThan(cell, ivec2(0))) || any(greaterThan(cell, ivec2(int(groundTileSide) - 1)))) return false;
  ivec4 lead = drawnBlockTexel(cell, ${TILE_LAYER.blockLead});
  int count = lead.r >> ${BLOCK_COUNT_SHIFT};
  if (count > ${BLOCK_SLOTS}) return false;
  int own = lead.r & ${(1 << BLOCK_COUNT_SHIFT) - 1};
  int ownMask = lead.b | (lead.a << 8);
  block = DrawnBlock(ivec3(own, lead.g, own), ivec3(ownMask, ~ownMask & ${BLOCK_FULL}, 0));
  if (count < ${BLOCK_SLOTS}) return true;
  ivec4 rest = drawnBlockTexel(cell, ${TILE_LAYER.blockRest});
  int nextMask = rest.b | (rest.a << 8);
  block = DrawnBlock(ivec3(own, lead.g, rest.r), ivec3(ownMask, nextMask, ~(ownMask | nextMask) & ${BLOCK_FULL}));
  return true;
}
vec4 drawnRowBits(int mask, int row) {
  return vec4((ivec4(mask >> (row * 4)) >> ivec4(0, 1, 2, 3)) & 1);
}
float drawnMaskShare(int mask, vec4 wx, vec4 wy) {
  return dot(vec4(dot(drawnRowBits(mask, 0), wx), dot(drawnRowBits(mask, 1), wx), dot(drawnRowBits(mask, 2), wx), dot(drawnRowBits(mask, 3), wx)), wy);
}
vec3 drawnMaskSpread(int mask, vec4 wx, vec4 wy, vec4 sx, vec4 sy) {
  vec4 along = vec4(0.0);
  vec4 rise = vec4(0.0);
  for (int row = 0; row < 4; row++) {
    vec4 bits = drawnRowBits(mask, row);
    along[row] = dot(bits, wx);
    rise[row] = dot(bits, sx);
  }
  return vec3(dot(along, wy), dot(rise, wy), dot(along, sy));
}
vec4 drawnSplineWeights(float f) {
  float g = 1.0 - f;
  return vec4(g * g * g, 4.0 + f * f * (3.0 * f - 6.0), 1.0 + 3.0 * f + 3.0 * f * f - 3.0 * f * f * f, f * f * f) / 6.0;
}
vec4 drawnSplineSlopes(float f) {
  float g = 1.0 - f;
  return vec4(-0.5 * g * g, 1.5 * f * f - 2.0 * f, -1.5 * f * f + f + 0.5, 0.5 * f * f);
}
vec2 drawnEdgeTraitsOfTiles(vec2 tile) {
  vec2 first = floor(tile - 0.5) - 1.0;
  vec2 f = tile - 0.5 - floor(tile - 0.5);
  vec4 wx = drawnSplineWeights(f.x);
  vec4 wy = drawnSplineWeights(f.y);
  float wave = 0.0;
  float pepper = 0.0;
  for (int j = 0; j < 4; j++)
    for (int i = 0; i < 4; i++) {
      int id = drawnMaterialAt(first + vec2(float(i), float(j)) + 0.5);
      float weight = wx[i] * wy[j];
      wave += weight * drawnMaterialWave[id];
      pepper += weight * drawnMaterialPepper[id];
    }
  return vec2(wave, pepper);
}
vec2 drawnEdgeTraits(vec2 tile) {
  DrawnBlock block;
  if (!drawnBlockAt(tile, block)) return drawnEdgeTraitsOfTiles(tile);
  vec2 f = tile - 0.5 - floor(tile - 0.5);
  vec4 wx = drawnSplineWeights(f.x);
  vec4 wy = drawnSplineWeights(f.y);
  vec3 shares = vec3(drawnMaskShare(block.masks.x, wx, wy), drawnMaskShare(block.masks.y, wx, wy), drawnMaskShare(block.masks.z, wx, wy));
  return vec2(dot(shares, ${pickMaterial("drawnMaterialWave")}), dot(shares, ${pickMaterial("drawnMaterialPepper")}));
}
DrawnBorder drawnBorderOfTiles(vec2 tile) {
  vec2 first = floor(tile - 0.5) - 1.0;
  vec2 f = tile - 0.5 - floor(tile - 0.5);
  vec4 wx = drawnSplineWeights(f.x);
  vec4 wy = drawnSplineWeights(f.y);
  vec4 sx = drawnSplineSlopes(f.x);
  vec4 sy = drawnSplineSlopes(f.y);
  int ids[16];
  float weights[16];
  float totals[${GROUND_MATERIAL_IDS.length}];
  for (int m = 0; m < ${GROUND_MATERIAL_IDS.length}; m++) totals[m] = 0.0;
  float wave = 0.0;
  float pepper = 0.0;
  float spill = 0.0;
  float spillLead = 0.0;
  vec3 spillColor = vec3(0.0);
  for (int j = 0; j < 4; j++)
    for (int i = 0; i < 4; i++) {
      int k = j * 4 + i;
      ids[k] = drawnMaterialAt(first + vec2(float(i), float(j)) + 0.5);
      weights[k] = wx[i] * wy[j];
      totals[ids[k]] += weights[k];
      wave += weights[k] * drawnMaterialWave[ids[k]];
      pepper += weights[k] * drawnMaterialPepper[ids[k]];
      float spills = drawnMaterialSpill[ids[k]];
      spill += weights[k] * spills;
      float leads = weights[k] * spills * spills * spills * spills;
      spillLead += leads;
      spillColor += leads * drawnMaterialColor[ids[k]];
    }
  spillColor /= max(spillLead, 0.0001);
  int here = -1;
  int there = -1;
  float hereWeight = 0.0;
  float thereWeight = 0.0;
  for (int k = 0; k < 16; k++) {
    int id = ids[k];
    float total = totals[id];
    bool fresh = id != here && id != there;
    bool top = fresh && total > hereWeight;
    bool next = fresh && !top && total > thereWeight;
    there = top ? here : (next ? id : there);
    thereWeight = top ? hereWeight : (next ? total : thereWeight);
    here = top ? id : here;
    hereWeight = top ? total : hereWeight;
  }
  if (there < 0) return DrawnBorder(here, here, ${DRAWN_FAR_TILES.toFixed(1)}, wave, pepper, spill, spillColor);
  float field = 0.0;
  vec2 slope = vec2(0.0);
  for (int j = 0; j < 4; j++)
    for (int i = 0; i < 4; i++) {
      int id = ids[j * 4 + i];
      float side = id == here ? 1.0 : (id == there ? -1.0 : 0.0);
      field += side * wx[i] * wy[j];
      slope += side * vec2(sx[i] * wy[j], wx[i] * sy[j]);
    }
  float dist = field / max(length(slope), 0.0001);
  return DrawnBorder(min(here, there), max(here, there), here < there ? dist : -dist, wave, pepper, spill, spillColor);
}
DrawnBorder drawnBorderAt(vec2 tile) {
  DrawnBlock block;
  if (!drawnBlockAt(tile, block)) return drawnBorderOfTiles(tile);
  vec2 f = tile - 0.5 - floor(tile - 0.5);
  vec4 wx = drawnSplineWeights(f.x);
  vec4 wy = drawnSplineWeights(f.y);
  vec4 sx = drawnSplineSlopes(f.x);
  vec4 sy = drawnSplineSlopes(f.y);
  vec3 spreads[3] = vec3[3](drawnMaskSpread(block.masks.x, wx, wy, sx, sy), drawnMaskSpread(block.masks.y, wx, wy, sx, sy), drawnMaskSpread(block.masks.z, wx, wy, sx, sy));
  vec3 shares = vec3(spreads[0].x, spreads[1].x, spreads[2].x);
  vec3 spills = ${pickMaterial("drawnMaterialSpill")};
  vec3 leads = shares * spills * spills * spills * spills;
  vec3 spillColor = (leads.x * drawnMaterialColor[block.ids.x] + leads.y * drawnMaterialColor[block.ids.y] + leads.z * drawnMaterialColor[block.ids.z]) / max(leads.x + leads.y + leads.z, 0.0001);
  float wave = dot(shares, ${pickMaterial("drawnMaterialWave")});
  float pepper = dot(shares, ${pickMaterial("drawnMaterialPepper")});
  float spill = dot(shares, spills);
  int here = -1;
  int there = -1;
  vec3 hereSpread = vec3(0.0);
  vec3 thereSpread = vec3(0.0);
  for (int slot = 0; slot < ${BLOCK_SLOTS}; slot++) {
    vec3 spread = spreads[slot];
    bool top = spread.x > hereSpread.x;
    bool next = !top && spread.x > thereSpread.x;
    there = top ? here : (next ? block.ids[slot] : there);
    thereSpread = top ? hereSpread : (next ? spread : thereSpread);
    here = top ? block.ids[slot] : here;
    hereSpread = top ? spread : hereSpread;
  }
  if (there < 0) return DrawnBorder(here, here, ${DRAWN_FAR_TILES.toFixed(1)}, wave, pepper, spill, spillColor);
  float dist = (hereSpread.x - thereSpread.x) / max(length(hereSpread.yz - thereSpread.yz), 0.0001);
  return DrawnBorder(min(here, there), max(here, there), here < there ? dist : -dist, wave, pepper, spill, spillColor);
}
float drawnStreakAt(vec2 at) {
  vec2 wind = vec2(dot(at, vec2(${DRAWN_WIND.x.toFixed(3)}, ${DRAWN_WIND.y.toFixed(3)})), dot(at, vec2(${(-DRAWN_WIND.y).toFixed(3)}, ${DRAWN_WIND.x.toFixed(3)})));
  return (valueNoise(wind / vec2(${DRAWN_STREAK_LONG.toFixed(1)}, ${DRAWN_STREAK_WIDE.toFixed(1)})) - 0.5) * ${DRAWN_STREAK_MIX.toFixed(2)};
}
float drawnHalo(DrawnBorder edge, int own, float streak, float aa) {
  float excess = max(edge.spill - drawnMaterialSpill[own], 0.0) * drawnHaloAmount;
  float past = excess + streak * smoothstep(0.0, ${DRAWN_HALO_EDGE.toFixed(2)}, excess) - ${DRAWN_HALO_EDGE.toFixed(2)};
  float depth = clamp(past / ${(0.5 - DRAWN_HALO_EDGE).toFixed(2)}, 0.0, 1.0);
  float depthAa = fwidth(depth) + 0.001;
  return smoothstep(-aa, aa, past) * mix(${DRAWN_HALO_RIM_MIX.toFixed(2)}, ${DRAWN_HALO_CORE_MIX.toFixed(2)}, smoothstep(0.5 - depthAa, 0.5 + depthAa, depth));
}
vec2 drawnWarpAt(float wave, vec2 at) {
  vec2 broad = vec2(valueNoise(at / drawnWaveSize), valueNoise(at / drawnWaveSize + 7.0)) - 0.5;
  vec2 fine = vec2(valueNoise(at / ${DRAWN_FINE_WAVE_SIZE.toFixed(1)} + 23.0), valueNoise(at / ${DRAWN_FINE_WAVE_SIZE.toFixed(1)} + 31.0)) - 0.5;
  return (broad + fine * ${DRAWN_FINE_WAVE_SHARE.toFixed(2)}) * 1.4 * drawnEdgeWobble * wave * facetSide;
}
float drawnPepperNoise(vec2 at, float px) {
  float mid = (valueNoise(at / 0.6 + 43.0) - 0.5) * 0.3 * (1.0 - smoothstep(0.12, 0.22, px));
  float fine = (valueNoise(at / 0.25 + 47.0) - 0.5) * 0.35 * (1.0 - smoothstep(0.045, 0.08, px));
  return (valueNoise(at / 1.6 + 41.0) - 0.5) * 0.35 + mid + fine;
}
`;

const RELIEF = `float drawnSample(vec2 texel) {
  return textureLod(roadField, (texel + 0.5) / heightSide, 0.0).a;
}
float drawnCorner(ivec2 corner) {
  int last = int(heightSide) - 1;
  return texelFetch(roadField, clamp(corner, ivec2(0), ivec2(last)), 0).a;
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
float drawnPuddles(vec2 p) {
  float wet = valueNoise(p / ${DRAWN_PUDDLE_SIZE.toFixed(1)} + 91.0) * 0.75 + valueNoise(p / ${(DRAWN_PUDDLE_SIZE * 0.35).toFixed(2)} + 97.0) * 0.25;
  float aa = max(fwidth(wet), 0.002);
  return smoothstep(${DRAWN_PUDDLE_FROM.toFixed(2)} - aa, ${DRAWN_PUDDLE_FROM.toFixed(2)} + aa, wet);
}
float drawnClods(vec2 p, float px) {
  vec2 c = floor(p / ${DRAWN_CLOD_CELL.toFixed(2)});
  vec2 f = p / ${DRAWN_CLOD_CELL.toFixed(2)} - c;
  float turn = markHash(c + 13.0) * 6.2831853;
  vec2 d = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * (f - 0.3 - 0.4 * vec2(markHash(c + 17.0), markHash(c + 19.0)));
  float radius = mix(0.08, 0.17, markHash(c + 23.0));
  float lumpy = length(d * vec2(1.0, 1.7)) + (valueNoise(p / 0.12 + c) - 0.5) * 0.06;
  float edge = px / ${DRAWN_CLOD_CELL.toFixed(2)};
  float clod = 1.0 - smoothstep(radius - edge, radius + edge, lumpy);
  return clod * step(markHash(c + 29.0), ${DRAWN_CLOD_SHARE.toFixed(2)}) * (1.0 - smoothstep(${(DRAWN_CLOD_CELL / 6).toFixed(3)}, ${(DRAWN_CLOD_CELL / 3).toFixed(3)}, px));
}
float drawnWindRipples(vec2 p, float px) {
  vec2 q = vec2(dot(p, vec2(${(-TOWARD_CAMERA.y).toFixed(3)}, ${TOWARD_CAMERA.x.toFixed(3)})), dot(p, vec2(${TOWARD_CAMERA.x.toFixed(3)}, ${TOWARD_CAMERA.y.toFixed(3)})));
  float crest = q.y / ${DRAWN_SAND_RIPPLE_SPACING.toFixed(2)} + sin(q.x / 3.1) * 0.35 + (valueNoise(p / 5.0 + 71.0) - 0.5) * 1.2;
  float patchy = smoothstep(0.4, 0.6, valueNoise(p / 6.0 + 77.0));
  return drawnLine(abs(fract(crest) - 0.5) * ${DRAWN_SAND_RIPPLE_SPACING.toFixed(2)}, ${DRAWN_SAND_RIPPLE_WIDTH.toFixed(2)}, px) * patchy;
}
float drawnWaves(vec2 p, float px) {
  vec2 q = vec2(dot(p, vec2(${(-TOWARD_CAMERA.y).toFixed(3)}, ${TOWARD_CAMERA.x.toFixed(3)})), dot(p, vec2(${TOWARD_CAMERA.x.toFixed(3)}, ${TOWARD_CAMERA.y.toFixed(3)})));
  float row = floor(q.y / ${DRAWN_GLINT_ROW.toFixed(2)});
  float along = q.x / ${DRAWN_GLINT_LONG.toFixed(2)} + markHash(vec2(row, 4.0)) * 5.0;
  float inside = fract(along);
  float busy = smoothstep(0.3, 0.75, valueNoise(p / ${DRAWN_GLINT_PATCH.toFixed(1)} + 51.0));
  float keep = step(markHash(vec2(floor(along), row) + 3.0), mix(${DRAWN_GLINT_CALM.toFixed(2)}, ${DRAWN_GLINT_BUSY.toFixed(2)}, busy));
  float taper = smoothstep(0.1, 0.35, inside) * (1.0 - smoothstep(0.65, 0.9, inside));
  float across = q.y - (row + 0.5) * ${DRAWN_GLINT_ROW.toFixed(2)} - sin(inside * 6.2831853) * 0.08;
  return drawnLine(abs(across), ${DRAWN_GLINT_WIDTH.toFixed(2)} * taper, px) * keep * (1.0 - smoothstep(0.15, 0.3, px));
}
float drawnGrain(vec2 p, float px) {
  vec2 along = mat2(0.94, 0.34, -0.34, 0.94) * p;
  vec2 across = mat2(0.82, -0.57, 0.57, 0.82) * p + 5.0;
  float dark = valueNoise(along / vec2(0.14, 0.45));
  float light = valueNoise(across / vec2(0.3, 0.8) + 9.0);
  float darkAa = max(fwidth(dark), 0.002);
  float lightAa = max(fwidth(light), 0.002);
  float flecks = smoothstep(0.7 - darkAa, 0.7 + darkAa, dark) * 0.7 - smoothstep(0.72 - lightAa, 0.72 + lightAa, light) * 0.4;
  return -flecks * mix(0.4, 1.0, valueNoise(p / 3.5 + 17.0)) * (1.0 - smoothstep(0.06, 0.14, px));
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

const EDGE_LINE = `float drawnEdgeLine(float px) {
  return 1.0 - smoothstep(${DRAWN_EDGE_LINE.toFixed(2)} - 0.5, ${DRAWN_EDGE_LINE.toFixed(2)} + 0.5, px);
}
`;

const GROUND_DECLARATIONS = `${UNIFORMS}${WEAR_FUNCTIONS}${NOISE}${MATERIAL_BORDERS}${RELIEF}${SURFACE_MARKS}${EDGE_LINE}`;

const BORDER_BODY = `
  vec3 blurredGround = textureLod(map, vMapUv, 2.5).rgb;
  vec2 drawnTileAt = vRoadXZ / facetSide;
  float drawnTilePx = max(length(fwidth(vRoadXZ)), 0.0005) / facetSide;
  vec2 drawnRough = drawnEdgeTraits(drawnTileAt);
  vec2 drawnWarp = vec2(0.0);
  if (drawnRough.x > 0.0) drawnWarp = drawnWarpAt(drawnRough.x, vRoadXZ);
  DrawnBorder drawnEdge = drawnBorderAt((vRoadXZ + drawnWarp) / facetSide);
  float drawnPeppered = min(drawnRough.y * 2.0, 1.0);
  float drawnPepperShift = 0.0;
  if (drawnPeppered > 0.0) drawnPepperShift = drawnPeppered * drawnPepperNoise(vRoadXZ, drawnTilePx * facetSide) * ${DRAWN_PEPPER_SPREAD.toFixed(1)};
  float drawnToward = drawnEdge.toward + drawnPepperShift;
  float drawnAa = drawnTilePx + fwidth(drawnPepperShift);
  float drawnLoSide = smoothstep(-drawnEdgeSoft - drawnAa, drawnEdgeSoft + drawnAa, drawnToward);
  float drawnStreak = 0.0;
  if (drawnEdge.spill > min(drawnMaterialSpill[drawnEdge.lo], drawnMaterialSpill[drawnEdge.hi])) drawnStreak = drawnStreakAt(vRoadXZ);
  float drawnHaloAa = max(fwidth(drawnEdge.spill * drawnHaloAmount + drawnStreak), 0.0005);
  float drawnLoHalo = drawnHalo(drawnEdge, drawnEdge.lo, drawnStreak, drawnHaloAa);
  float drawnHiHalo = drawnHalo(drawnEdge, drawnEdge.hi, drawnStreak, drawnHaloAa);
  vec3 drawnLoColor = mix(drawnMaterialColor[drawnEdge.lo], drawnEdge.spillColor, drawnLoHalo);
  vec3 drawnHiColor = mix(drawnMaterialColor[drawnEdge.hi], drawnEdge.spillColor, drawnHiHalo);
  diffuseColor.rgb = mix(drawnHiColor, drawnLoColor, drawnLoSide);
  int drawnMaterial = drawnLoSide > 0.5 ? drawnEdge.lo : drawnEdge.hi;
  float drawnHaloCover = mix(drawnHiHalo, drawnLoHalo, drawnLoSide);
  float drawnBroad = valueNoise(drawnTileAt / 7.0) * 0.7 + valueNoise(drawnTileAt / 2.5) * 0.15;
  diffuseColor.rgb = mix(diffuseColor.rgb, drawnBroadTint, drawnBroad * ${DRAWN_BROAD_MIX.toFixed(2)});
  diffuseColor.rgb *= 1.0 + (valueNoise(drawnTileAt / ${DRAWN_PATCH_TILES.toFixed(1)} + 41.5) - 0.5) * 2.0 * ${DRAWN_PATCH_MIX.toFixed(2)};
#ifdef GROUND_LANDFORMS
  vec4 drawnLandform = texture2D(groundLandforms, vMapUv);
  diffuseColor.rgb = mix(diffuseColor.rgb, drawnLandform.rgb, drawnLandform.a);
#endif
  float drawnOut = max(max(-drawnTileAt.x, -drawnTileAt.y), max(drawnTileAt.x, drawnTileAt.y) - groundTileSide);
  diffuseColor.rgb = mix(diffuseColor.rgb, drawnFarTint, drawnOut > 0.0 ? min(1.0, 0.35 + drawnOut / ${TERRAIN_MARGIN.toFixed(1)}) : 0.0);
  float drawnInside = smoothstep(0.0, 0.25, abs(drawnToward)) * (1.0 - smoothstep(0.0, ${DRAWN_HALO_HIDES_MARKS.toFixed(2)}, drawnHaloCover));
  vec3 paintedGround = diffuseColor.rgb;
`;

const GLASS_BODY = `
  float glassEdge = texture(groundTiles, vec3(vRoadXZ / groundTileMeters, ${TILE_LAYER.tiles}.0)).b
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
  float roadSand = texture(groundTiles, vec3(vRoadXZ / groundTileMeters, ${TILE_LAYER.tiles}.0)).g;
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
  float drawnEdgePx = abs(roadFrame.x - roadEdge) / max(roadEdgeAa / 1.2, 0.0001);
  float drawnEdgeNear = step(roadFrame.x, roadEdge + ${DRAWN_EDGE_LINE_REACH.toFixed(1)});
  inkSurface.edge = drawnEdgeLine(drawnEdgePx) * drawnEdgeNear;
`;

const MARKS_BODY = `
  float drawnPx = max(length(fwidth(vRoadXZ)), 0.0005);
  float drawnOffRoad = 1.0 - roadIn;
  float drawnZoomed = 1.0 - smoothstep(${DRAWN_MARK_FADE_FROM.toFixed(2)}, ${DRAWN_MARK_FADE_TO.toFixed(2)}, drawnPx);
  float drawnRoadCrack = 0.0;
  if (roadIn > 0.0) drawnRoadCrack = drawnCracks(vRoadXZ + 13.0, ${DRAWN_ROAD_CRACK_CELL.toFixed(1)}, drawnPx) * step(0.62, valueNoise(vRoadXZ / 14.0)) * roadIn;
  diffuseColor.rgb *= 1.0 - ${DRAWN_MARK_DARK.toFixed(2)} * drawnRoadCrack;
  int drawnMark = int(drawnMaterialMark[drawnMaterial] + 0.5);
  vec3 drawnFaceNormal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
  float drawnFlat = smoothstep(${DRAWN_MARK_FLAT_FROM.toFixed(2)}, ${DRAWN_MARK_FLAT_TO.toFixed(2)}, abs(dot(drawnFaceNormal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz))));
  float drawnMarkShow = drawnInside * drawnOffRoad * drawnFlat;
  float drawnDark = 0.0;
  float drawnLight = 0.0;
  float drawnShade = 0.0;
  bool drawnMarked = drawnMarkShow > 0.0;
  bool drawnFine = drawnMarked && drawnZoomed > 0.0;
  if (drawnFine && drawnMark == ${markIndex("cracks")}) drawnDark = drawnCracks(vRoadXZ, 1.8, drawnPx) * drawnZoomed * 0.6;
  if (drawnFine && drawnMark == ${markIndex("saltCracks")}) drawnLight = drawnCracks(vRoadXZ + 31.0, 1.8, drawnPx) * drawnZoomed * 0.7;
  if (drawnMarked && drawnMark == ${markIndex("clods")}) drawnDark = drawnClods(vRoadXZ, drawnPx) * ${DRAWN_CLOD_MIX.toFixed(2)};
  if (drawnMark == ${markIndex("puddles")}) drawnDark = drawnPuddles(vRoadXZ) * ${DRAWN_PUDDLE_MIX.toFixed(2)};
  if (drawnFine && drawnMark == ${markIndex("windRipples")}) drawnDark = drawnWindRipples(vRoadXZ, drawnPx) * drawnZoomed * ${DRAWN_SAND_RIPPLE_MIX.toFixed(2)};
  if (drawnMarked && drawnMark == ${markIndex("waves")}) drawnLight = drawnWaves(vRoadXZ, drawnPx) * ${DRAWN_GLINT_MIX.toFixed(2)};
  if (drawnFine && drawnMark == ${markIndex("seams")}) drawnDark = drawnSeams(vRoadXZ, drawnPx) * drawnZoomed;
  if (drawnMarked && drawnMark == ${markIndex("ashSmudge")}) drawnDark = smoothstep(0.55, 0.8, valueNoise(vRoadXZ / 2.5)) * 0.5;
  if (drawnMarked && drawnMark == ${markIndex("stones")}) drawnShade = drawnStones(vRoadXZ, 0.3, 91.0, drawnPx) * 0.16 + drawnStones(mat2(0.8, 0.6, -0.6, 0.8) * vRoadXZ, 0.17, 95.0, drawnPx) * 0.12 + drawnStones(mat2(0.6, -0.8, 0.8, 0.6) * vRoadXZ, ${DRAWN_STONE_BIG_CELL.toFixed(2)}, 99.0, drawnPx) * ${DRAWN_STONE_BIG_MIX.toFixed(2)};
  if (drawnMark == ${markIndex("grain")}) drawnShade = drawnGrainAmount * drawnGrain(vRoadXZ, drawnPx);
  diffuseColor.rgb *= 1.0 + drawnShade * drawnMarkShow;
  diffuseColor.rgb *= 1.0 - ${DRAWN_MARK_DARK.toFixed(2)} * drawnDark * drawnMarkShow;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.93, 0.88), drawnLight * drawnMarkShow);
`;

const RELIEF_BODY = `
  vec3 drawnGround = drawnSmoothGround(vRoadXZ);
  inkSurface.height = drawnGround.x;
  inkSurface.slope = drawnGround.yz;
  inkSurface.still = drawnMark == ${markIndex("waves")} ? drawnOffRoad : 0.0;
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

const GROUND_PARTS = `${BORDER_BODY}${GLASS_BODY}${ROAD_BODY}${MARKS_BODY}${RELIEF_BODY}${BAND_BODY}${PADS_BODY}`;

const FORM_UNIFORMS = `
uniform sampler2D groundForm;
uniform vec2 groundFormUv;
vec2 groundFormAt(vec2 at) {
  return texture(groundForm, at * groundFormUv.x + groundFormUv.y).rg;
}
`;

const FORM_BODY = `
  inkSurface.form = groundFormAt(vRoadXZ);
  inkSurface.formBend = mat2(
    groundFormAt(vRoadXZ + vec2(${FORM_BEND_STEP.toFixed(1)}, 0.0)) - groundFormAt(vRoadXZ - vec2(${FORM_BEND_STEP.toFixed(1)}, 0.0)),
    groundFormAt(vRoadXZ + vec2(0.0, ${FORM_BEND_STEP.toFixed(1)})) - groundFormAt(vRoadXZ - vec2(0.0, ${FORM_BEND_STEP.toFixed(1)}))
  ) / ${(2 * FORM_BEND_STEP).toFixed(1)};
`;

const GROUND_BODY = `{${GROUND_PARTS}${FORM_BODY}}`;

const CACHE_WRITE = `{${GROUND_PARTS}
  gl_FragColor = vec4(diffuseColor.rgb, inkSurface.road);
  groundCacheDataOut = vec4(inkSurface.height, inkSurface.slope, inkSurface.rise);
  groundCacheEdgeOut = vec4(min(drawnEdgePx, ${CACHE_EDGE_PX.toFixed(1)}) / ${CACHE_EDGE_PX.toFixed(1)}, drawnEdgeNear, inkSurface.still, 1.0);
  return;
}`;

const CACHE_READ_UNIFORMS = `varying vec2 vRoadXZ;
uniform highp sampler2D groundCacheColor;
uniform highp sampler2D groundCacheData;
uniform highp sampler2D groundCacheEdge;
uniform vec2 groundCacheShift;
uniform vec2 groundCacheSize;
uniform vec2 groundCacheDensity;
uniform float groundCacheReach;
${EDGE_LINE}`;

const CACHE_READ = `{
  vec2 groundCachePoint = gl_FragCoord.xy * groundCacheDensity;
#ifdef HAZE_SHIFTED
  mat2 groundCacheMeters = mat2(dFdx(vHazeXZ), dFdy(vHazeXZ));
  groundCachePoint += clamp(inverse(groundCacheMeters) * hazeShift * groundCacheDensity, -groundCacheReach, groundCacheReach);
#endif
  vec2 groundCacheUv = (groundCachePoint + groundCacheShift) / groundCacheSize;
  ivec2 groundCacheSide = ivec2(groundCacheSize);
  ivec2 groundCacheAt = (ivec2(floor(groundCachePoint)) + ivec2(groundCacheShift) + groundCacheSide) % groundCacheSide;
  vec4 groundCacheLook = texture(groundCacheColor, groundCacheUv);
  vec4 groundCacheRelief = texelFetch(groundCacheData, groundCacheAt, 0);
  vec3 groundCacheEdgeAt = texture(groundCacheEdge, groundCacheUv).rgb;
  diffuseColor.rgb = groundCacheLook.rgb;
  inkSurface.road = groundCacheLook.a;
  inkSurface.height = groundCacheRelief.x;
  inkSurface.slope = groundCacheRelief.yz;
  inkSurface.rise = groundCacheRelief.w;
  inkSurface.edge = drawnEdgeLine(groundCacheEdgeAt.x * ${CACHE_EDGE_PX.toFixed(1)} / groundCacheDensity.x) * groundCacheEdgeAt.y;
  inkSurface.still = groundCacheEdgeAt.z;
${FORM_BODY}}`;
