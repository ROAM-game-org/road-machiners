import * as THREE from "three";
import { PHYSICS } from "../../data/physics";
import { TERRAIN_TYPES } from "../../data/terrain";
import { EDGE_LOOKS, GROUND_MATERIAL_IDS, groundMaterial, MARK_KINDS, ROAD_PLAIN, ROAD_SAND, TERRAIN_MARGIN, type LookType, type MarkKind, type PaintCanvas } from "../../render/groundPaint";
import { CENTER_GAP, HALF as WEAR_HALF, LINE_HALF, WEAR_NEUTRAL } from "../../render/highwayWear";
import { mix, PAL } from "../../render/palette";
import type { Site } from "../../sim/sites";
import type { Terrain } from "../../sim/terrain";
import { TOWARD_CAMERA } from "./camera";
import { BLOCK_COUNT_SHIFT, BLOCK_SIDE, BLOCK_SLOTS, groundFields, TILE_LAYER } from "./groundFields";
import { CREST_GLSL, GroundCrest, type CrestUniforms } from "./groundCrest";
import { holdGroundDetail } from "./groundDetail";
import { GroundLandform, LANDFORM_GLSL, type LandformUniforms } from "./groundLandform";
import { INK_CONTRACT } from "./inkPaint";
import { injectAfter } from "./shaderPatch";
import { TUNING } from "./inkTuning";

const S = PHYSICS.metersPerTile;
const OWNER = "drawn-ground";
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
const WEAR_RIM_FROM = 0.925;
const WEAR_RIM_WANDER = 0.25;
const WEAR_PAINT_FROM = 0.109;
const WEAR_SAND_MIX_FROM = 0.765;
const WEAR_SAND_FULL_FROM = 0.965;
const WEAR_SAND_MIX = 0.35;
const WEAR_DARK = 0.82;
const WEAR_LIGHT = 1.34;
const WEAR_PATCH_EDGE = 0.5 * (WEAR_NEUTRAL - 1) / 255;
const WEAR_EDGE_AA = 0.75;
const PAD_WEAR = { gapCells: 1.8, gapFrom: 0.7, chipCells: 5.5, chipFrom: 0.7, fillCells: 6, fillFrom: 0.8, soft: 0.05 };
const WEAR_GRAIN = 2;
const WEAR_DUST = 0.05;
const DRAWN_FAR_TILES = 8;
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
const EDGE_SHADOW_FADE_PX = 0.7;
const DRAWN_HALO_HIDES_MARKS = 0.3;
const DRAWN_MARK_FLAT_FROM = 0.82;
const DRAWN_MARK_FLAT_TO = 0.93;
const DRAWN_MARK_FADE_FROM = 0.1;
const DRAWN_MARK_FADE_TO = 0.22;
const DRAWN_FURROW_SPACING = 1.6;
const DRAWN_FURROW_DASH = 5.5;
const DRAWN_FURROW_KEEP = 0.8;
const DRAWN_FURROW_WIDTH = 0.035;
const DRAWN_FURROW_WANDER = 0.7;
const DRAWN_FURROW_MIX = 0.45;
const KEEPS_OWN_TONE: ReadonlySet<LookType> = new Set(["concrete"]);
const DRAWN_EDGE_REACH = 3;
const DRAWN_ECHO_BREAK = 1.7;
const DRAWN_SHORE_WIDTH = 0.04;
const DRAWN_CLUMP_SIZE = 3.5;
const DRAWN_INK_WIDTH = 0.04;
const DRAWN_TICK_WIDTH = 0.02;
const DRAWN_TUFT_CELL = 0.5;
const DRAWN_TUFT_CLUMP = 1.3;
const DRAWN_TUFT_SHARE = 0.6;
const DRAWN_TUFT_EDGE_SHARE = 1;
const DRAWN_TUFT_EDGE_REACH = 3.5;
const DRAWN_STAND_OVERHANG = 1;
const DRAWN_ROAD_VERGE = 0.9;
const DRAWN_FRINGE_AMOUNT = 0.12;
const DRAWN_BLADE_WIDE = 0.12;
const DRAWN_BLADE_TALL = 0.45;
const DRAWN_GRIT_SIZE = 0.35;
const DRAWN_GRIT_METERS = 0.7;
const DRAWN_PEBBLE_CELL = 0.8;
const DRAWN_PEBBLE_SHARE = 0.35;
const DRAWN_PEBBLE_EDGE_SHARE = 0.8;
const DRAWN_PEBBLE_TOP = 0.25;
const DRAWN_PEBBLE_INK = 0.6;
const DRAWN_STONE_CELL = 1.8;
const DRAWN_STONE_SHARE = 0.12;
const DRAWN_STONE_EDGE_SHARE = 0.3;
const DRAWN_CRACK_CELL = 1.8;
const DRAWN_CRACK_FINE_CELL = 0.9;
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

export type Land = { landform: GroundLandform; crest: GroundCrest };

export type LandUniforms = LandformUniforms & CrestUniforms;

export type DrawnGround = { uniforms: Record<string, THREE.IUniform>; land: Land; header: string; key: string };

const LAND_GLSL = `${LANDFORM_GLSL}${CREST_GLSL}`;

function landOf(t: Terrain): Land {
  const landform = new GroundLandform(t.heights, t.size + 1, S);
  return { landform, crest: new GroundCrest(landform.form, t.heights, t.size + 1, S) };
}

export function landUniforms(land: Land): LandUniforms {
  return { ...land.landform.uniforms, ...land.crest.uniforms };
}

const GROUND_SHAPE_VERTEX = `vec4 groundWorld = modelMatrix * vec4(transformed, 1.0);
vRoadXZ = groundWorld.xz;
vec3 groundUp = normalize(mat3(modelMatrix) * objectNormal);
vGroundShape = vec3(groundWorld.y, -groundUp.xz / max(groundUp.y, 0.05));`;

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
    uniforms: { ...fields, ...lookUniforms(), ...materialUniforms(), ...(worn ? wearLook() : {}), drawnDetailPx: { value: Number.NaN } },
    land: landOf(t),
    header: `#define PAD_COUNT ${fields.padCenters.value.length}\n${worn ? "#define HIGHWAY_WEAR\n" : ""}${landforms ? "#define GROUND_LANDFORMS\n" : ""}${GROUND_DECLARATIONS}`,
    key: `|roads${worn ? "|wear" : ""}${landforms ? "|landforms" : ""}`,
  };
}

export function drawGround(material: THREE.MeshLambertMaterial, ground: DrawnGround): void {
  patchGround(material, { ...ground.uniforms, ...landUniforms(ground.land) }, `${ground.header}${LAND_GLSL}`, GROUND_BODY, ground.key);
  material.onBeforeRender = (renderer, _scene, camera) => {
    const size = renderer.getDrawingBufferSize(detailDrawSize);
    holdGroundDetail(ground.uniforms, camera, size.x, size.y);
  };
}

const detailDrawSize = new THREE.Vector2();

export function writeGroundCache(material: THREE.MeshLambertMaterial, ground: DrawnGround): void {
  patchGround(material, ground.uniforms, `${ground.header}${CACHE_OUTPUTS}${INK_CONTRACT}`, CACHE_WRITE, `${ground.key}|cacheWrite`);
}

export function readGroundCache(material: THREE.MeshLambertMaterial, cache: GroundCacheUniforms, land: LandUniforms): void {
  patchGround(material, { ...cache, ...land }, `${CACHE_READ_UNIFORMS}${LAND_GLSL}`, CACHE_READ, "|cacheRead");
}

function patchGround(material: THREE.MeshLambertMaterial, uniforms: Record<string, THREE.IUniform>, header: string, body: string, cacheKey: string): void {
  const before = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = injectAfter(OWNER, shader.vertexShader, "#include <common>", "varying vec2 vRoadXZ;\nvarying vec3 vGroundShape;");
    shader.vertexShader = injectAfter(OWNER, shader.vertexShader, "#include <project_vertex>", GROUND_SHAPE_VERTEX);
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
    drawnTuftInk: TUNING.tufts,
    drawnHaloAmount: TUNING.halo,
    drawnMaterialContrast: TUNING.materialContrast,
    drawnSurroundBlend: TUNING.surround,
    drawnFarMarks: TUNING.farMarks,
    drawnEdgeSoft: TUNING.edgeSoft,
    drawnEdgeShadowAmount: TUNING.edgeShadow,
    drawnEdgeShadowWidth: TUNING.edgeShadowWidth,
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
  return {
    drawnBroadTint: { value: new THREE.Color(PAL.sand[3]) },
    drawnFarTint: { value: new THREE.Color(PAL.sandFar) },
  };
}

function glslFloat(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

function constantTable(name: string, type: "float" | "vec3", values: readonly string[]): string {
  return `const ${type} ${name}[${values.length}] = ${type}[${values.length}](${values.join(", ")});`;
}

function materialConstants(): string {
  const rows = GROUND_MATERIAL_IDS.map(groundMaterial);
  const own = rows.map((row) => lightness(new THREE.Color(row.color)));
  const sand = lightness(new THREE.Color(groundMaterial("sand").color));
  const floats = (name: string, values: readonly number[]) => constantTable(name, "float", values.map(glslFloat));
  const colors = rows.map((row) => {
    const c = new THREE.Color(row.color);
    return `vec3(${glslFloat(c.r)}, ${glslFloat(c.g)}, ${glslFloat(c.b)})`;
  });
  return [
    constantTable("drawnMaterialColor", "vec3", colors),
    floats("drawnMaterialLightness", own),
    floats("drawnMaterialLiftTo", GROUND_MATERIAL_IDS.map((id, k) => (KEEPS_OWN_TONE.has(id) ? own[k] : Math.max(own[k], sand)))),
    floats("drawnMaterialSettles", GROUND_MATERIAL_IDS.map((id) => (KEEPS_OWN_TONE.has(id) ? 0 : 1))),
    floats("drawnMaterialMark", rows.map((row) => MARK_KINDS.indexOf(row.mark))),
    floats("drawnMaterialWave", rows.map((row) => EDGE_LOOKS[row.edge].wave)),
    floats("drawnMaterialPepper", rows.map((row) => EDGE_LOOKS[row.edge].pepper)),
    floats("drawnMaterialFine", rows.map((row) => EDGE_LOOKS[row.edge].fine)),
    floats("drawnMaterialGrit", rows.map((row) => EDGE_LOOKS[row.edge].grit)),
    floats("drawnMaterialSpill", rows.map((row) => row.spill)),
    floats("drawnMaterialStand", rows.map((row) => row.stand)),
  ].join("\n");
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

function lightness(c: THREE.Color): number {
  const y = luma(c);
  if (y <= 0.008856) throw new Error(`Ground material luminance ${y} is below the cube part of the lightness curve`);
  return 116 * Math.cbrt(y) - 16;
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
uniform float drawnMaterialContrast;
${materialConstants()}
uniform sampler2D groundSurround;
uniform float groundSurroundMeters;
uniform float drawnSurroundBlend;
uniform float drawnFarMarks;
uniform float drawnEdgeShadowAmount;
uniform float drawnEdgeShadowWidth;
uniform float drawnDetailPx;
uniform vec3 drawnBroadTint;
uniform vec3 drawnFarTint;
uniform float drawnEdgeWobble;
uniform float drawnWaveSize;
uniform float drawnTuftInk;
uniform float drawnHaloAmount;
uniform float drawnEdgeSoft;
`;

const WEAR_FUNCTIONS = `#ifdef HIGHWAY_WEAR
uniform sampler2D highwayWear;
uniform float wearBaseLuma;
uniform vec3 wearYellow;
uniform vec3 wearSand;
float wearStep(float value, float edge) {
  float soft = max(fwidth(value), 0.0001) * ${WEAR_EDGE_AA};
  return smoothstep(edge - soft, edge + soft, value);
}
float wearAcross(vec4 wear) {
  return (wear.b - 0.5) * 2.0 * ${WEAR_HALF.toFixed(2)};
}
vec3 wearPaint(vec3 color, vec4 wear, float wander) {
  float across = wearAcross(wear);
  float soft = max(fwidth(across), 0.0001) * ${WEAR_EDGE_AA};
  float stripe = 1.0 - smoothstep(${LINE_HALF.toFixed(2)} - soft, ${LINE_HALF.toFixed(2)} + soft, abs(abs(across) - ${CENTER_GAP.toFixed(2)}));
  vec3 paintShade = vec3(0.82 + 0.18 * wander);
  return mix(color, wearYellow * paintShade, stripe * wearStep(wear.r, ${WEAR_PAINT_FROM}));
}
vec3 wearPatch(vec3 color, vec4 wear) {
  float field = wear.a - ${(WEAR_NEUTRAL / 255).toFixed(5)};
  float dark = wearStep(-field, ${WEAR_PATCH_EDGE.toFixed(5)});
  float light = wearStep(field, ${WEAR_PATCH_EDGE.toFixed(5)});
  return color * mix(1.0, ${WEAR_DARK}, dark) * mix(1.0, ${WEAR_LIGHT}, light);
}
vec3 wearSandOver(vec3 color, vec4 wear, float wander) {
  vec3 sand = wearSand * (0.92 + 0.12 * wander);
  color = mix(color, sand, ${WEAR_SAND_MIX} * wearStep(wear.g, ${WEAR_SAND_MIX_FROM}));
  return mix(color, sand, wearStep(wear.g, ${WEAR_SAND_FULL_FROM}));
}
vec3 wearRim(vec3 color, vec4 wear, float wander) {
  float edge = ${WEAR_RIM_FROM} + (wander - 0.5) * ${WEAR_RIM_WANDER} / ${WEAR_HALF.toFixed(2)};
  vec3 sand = wearSand * (0.92 + 0.12 * wander);
  return mix(color, sand, wearStep(abs(wear.b - 0.5) * 2.0, edge));
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
float padPaintLeft(vec2 p, float cells, float from) {
  return 1.0 - smoothstep(from, from + ${PAD_WEAR.soft.toFixed(2)}, valueNoise(p * cells));
}
`;

const MATERIAL_BORDERS = `struct DrawnBorder { int lo; int hi; float toward; float wave; float pepper; float spill; vec3 spillColor; };
struct DrawnBlock { ivec3 ids; ivec3 masks; };
float drawnLuminance(float lightness) {
  float f = (lightness + 16.0) / 116.0;
  return f * f * f;
}
vec3 drawnMaterialTone(int id) {
  float own = drawnMaterialLightness[id];
  float shown = mix(drawnMaterialLiftTo[id], own, drawnMaterialContrast);
  return drawnMaterialColor[id] * drawnLuminance(shown) / drawnLuminance(own);
}
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
vec4 drawnEdgeTraitsOfTiles(vec2 tile) {
  vec2 first = floor(tile - 0.5) - 1.0;
  vec2 f = tile - 0.5 - floor(tile - 0.5);
  vec4 wx = drawnSplineWeights(f.x);
  vec4 wy = drawnSplineWeights(f.y);
  vec4 traits = vec4(0.0);
  for (int j = 0; j < 4; j++)
    for (int i = 0; i < 4; i++) {
      int id = drawnMaterialAt(first + vec2(float(i), float(j)) + 0.5);
      traits += wx[i] * wy[j] * vec4(drawnMaterialWave[id], drawnMaterialPepper[id], drawnMaterialFine[id], drawnMaterialGrit[id]);
    }
  return traits;
}
vec4 drawnEdgeTraits(vec2 tile) {
  DrawnBlock block;
  if (!drawnBlockAt(tile, block)) return drawnEdgeTraitsOfTiles(tile);
  vec2 f = tile - 0.5 - floor(tile - 0.5);
  vec4 wx = drawnSplineWeights(f.x);
  vec4 wy = drawnSplineWeights(f.y);
  vec3 shares = vec3(drawnMaskShare(block.masks.x, wx, wy), drawnMaskShare(block.masks.y, wx, wy), drawnMaskShare(block.masks.z, wx, wy));
  return vec4(dot(shares, ${pickMaterial("drawnMaterialWave")}), dot(shares, ${pickMaterial("drawnMaterialPepper")}), dot(shares, ${pickMaterial("drawnMaterialFine")}), dot(shares, ${pickMaterial("drawnMaterialGrit")}));
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
      spillColor += leads * drawnMaterialTone(ids[k]);
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
  vec3 spread0 = drawnMaskSpread(block.masks.x, wx, wy, sx, sy);
  vec3 spread1 = drawnMaskSpread(block.masks.y, wx, wy, sx, sy);
  vec3 spread2 = drawnMaskSpread(block.masks.z, wx, wy, sx, sy);
  vec3 shares = vec3(spread0.x, spread1.x, spread2.x);
  vec3 spills = ${pickMaterial("drawnMaterialSpill")};
  vec3 leads = shares * spills * spills * spills * spills;
  vec3 spillColor = (leads.x * drawnMaterialTone(block.ids.x) + leads.y * drawnMaterialTone(block.ids.y) + leads.z * drawnMaterialTone(block.ids.z)) / max(leads.x + leads.y + leads.z, 0.0001);
  float wave = dot(shares, ${pickMaterial("drawnMaterialWave")});
  float pepper = dot(shares, ${pickMaterial("drawnMaterialPepper")});
  float spill = dot(shares, spills);
  int here = -1;
  int there = -1;
  vec3 hereSpread = vec3(0.0);
  vec3 thereSpread = vec3(0.0);
  for (int slot = 0; slot < ${BLOCK_SLOTS}; slot++) {
    vec3 spread = slot == 0 ? spread0 : (slot == 1 ? spread1 : spread2);
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
float drawnHalo(DrawnBorder edge, int own, float streak, float crumb, float aa, out float past) {
  float excess = (edge.spill - drawnMaterialSpill[own]) * drawnHaloAmount * (1.0 - drawnMaterialPepper[own]);
  past = excess + streak * smoothstep(0.0, ${DRAWN_HALO_EDGE.toFixed(2)}, excess) - ${DRAWN_HALO_EDGE.toFixed(2)} + crumb * drawnMaterialGrit[own];
  float depth = clamp(past / ${(0.5 - DRAWN_HALO_EDGE).toFixed(2)}, 0.0, 1.0);
  float depthAa = fwidth(depth) + 0.001;
  return smoothstep(-aa, aa, past) * mix(${DRAWN_HALO_RIM_MIX.toFixed(2)}, ${DRAWN_HALO_CORE_MIX.toFixed(2)}, smoothstep(0.5 - depthAa, 0.5 + depthAa, depth));
}
float drawnHaloMeters(float past, float pxMeters, bool samePair) {
  float slope = fwidth(past);
  return samePair ? past / max(slope, 0.0001) * pxMeters : -${DRAWN_FAR_TILES.toFixed(1)} * facetSide;
}
float drawnEdgeShadow(DrawnBorder edge, float towardMeters, float loHaloMeters, float hiHaloMeters, float aaMeters) {
  float rise = drawnMaterialStand[edge.hi] - drawnMaterialStand[edge.lo];
  if (rise == 0.0 || drawnEdgeShadowAmount <= 0.0) return 0.0;
  bool hiStands = rise > 0.0;
  float intoLow = hiStands ? towardMeters : -towardMeters;
  float tallHalo = hiStands ? hiHaloMeters : loHaloMeters;
  float lowHalo = hiStands ? loHaloMeters : hiHaloMeters;
  float depth = min(max(intoLow, tallHalo), -lowHalo);
  float seen = smoothstep(${EDGE_SHADOW_FADE_PX.toFixed(2)}, ${(2 * EDGE_SHADOW_FADE_PX).toFixed(2)}, drawnEdgeShadowWidth / drawnDetailPx);
  float band = smoothstep(-aaMeters, aaMeters, depth) * (1.0 - smoothstep(0.0, drawnEdgeShadowWidth + aaMeters, depth));
  return band * min(abs(rise), 1.0) * drawnEdgeShadowAmount * seen;
}
vec2 drawnWarpAt(float wave, float fineShare, vec2 at) {
  vec2 broad = vec2(valueNoise(at / drawnWaveSize), valueNoise(at / drawnWaveSize + 7.0)) - 0.5;
  vec2 fine = vec2(0.0);
  if (fineShare > 0.0) fine = vec2(valueNoise(at / ${DRAWN_FINE_WAVE_SIZE.toFixed(1)} + 23.0), valueNoise(at / ${DRAWN_FINE_WAVE_SIZE.toFixed(1)} + 31.0)) - 0.5;
  return (broad + fine * fineShare * ${DRAWN_FINE_WAVE_SHARE.toFixed(2)}) * 1.4 * drawnEdgeWobble * wave * facetSide;
}
vec2 drawnViewFrame(vec2 p) {
  return vec2(dot(p, vec2(${(-TOWARD_CAMERA.y).toFixed(3)}, ${TOWARD_CAMERA.x.toFixed(3)})), dot(p, vec2(${TOWARD_CAMERA.x.toFixed(3)}, ${TOWARD_CAMERA.y.toFixed(3)})));
}
float drawnPepperNoise(vec2 at, float px) {
  float mid = (valueNoise(at / 0.6 + 43.0) - 0.5) * 0.3 * (1.0 - smoothstep(0.12, 0.22, px));
  float fine = (valueNoise(at / 0.25 + 47.0) - 0.5) * 0.35 * (1.0 - smoothstep(0.045, 0.08, px));
  float fringe = (valueNoise(drawnViewFrame(at) / vec2(${DRAWN_BLADE_WIDE.toFixed(2)}, ${DRAWN_BLADE_TALL.toFixed(2)}) + 37.0) - 0.5) * ${DRAWN_FRINGE_AMOUNT.toFixed(2)} * (1.0 - smoothstep(0.1, 0.2, px));
  return (valueNoise(at / 1.6 + 41.0) - 0.5) * 0.35 + mid + fine + fringe;
}
float drawnGritNoise(vec2 at, float px) {
  float crumb = (valueNoise(at / ${DRAWN_GRIT_SIZE.toFixed(2)} + 53.0) - 0.5) * 0.6 + (valueNoise(at / ${(DRAWN_GRIT_SIZE / 2.5).toFixed(2)} + 59.0) - 0.5) * 0.4;
  return crumb * 2.0 * ${DRAWN_GRIT_METERS.toFixed(2)} * (1.0 - smoothstep(0.12, 0.24, px));
}
`;

const RELIEF = `varying vec3 vGroundShape;
float drawnSample(vec2 texel) {
  return textureLod(roadField, (texel + 0.5) / heightSide, 0.0).a;
}
`;

const SURFACE_MARKS = `float drawnLine(float dist, float width, float px) {
  float shown = max(width, px * 0.5);
  return (1.0 - smoothstep(shown - px * 0.5, shown + px * 0.5, dist)) * mix(min(1.0, width / (px * 0.5)), 1.0, drawnFarMarks);
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
float drawnAsphaltCracks(vec2 p, float px) {
  return drawnCracks(p + 13.0, ${DRAWN_ROAD_CRACK_CELL.toFixed(1)}, px) * step(0.62, valueNoise(p / 14.0));
}
float drawnPuddles(vec2 p) {
  float wet = valueNoise(p / ${DRAWN_PUDDLE_SIZE.toFixed(1)} + 91.0) * 0.75 + valueNoise(p / ${(DRAWN_PUDDLE_SIZE * 0.35).toFixed(2)} + 97.0) * 0.25;
  float aa = max(fwidth(wet), 0.002);
  return smoothstep(${DRAWN_PUDDLE_FROM.toFixed(2)} - aa, ${DRAWN_PUDDLE_FROM.toFixed(2)} + aa, wet);
}
float drawnFurrows(vec2 p, float px) {
  ivec2 tile = clamp(ivec2(floor(p / facetSide)), ivec2(0), ivec2(int(groundTileSide) - 1));
  float turnShare = texelFetch(groundTiles, ivec3(tile, ${TILE_LAYER.tiles}), 0).a;
  vec2 plot = vec2(turnShare * 97.0, turnShare * 41.0);
  float turn = turnShare * 3.1415927;
  vec2 along = vec2(cos(turn), sin(turn));
  float u = dot(p, along);
  float v = dot(p, vec2(-along.y, along.x)) + (valueNoise(p / 9.0 + plot) - 0.5) * ${DRAWN_FURROW_WANDER.toFixed(2)};
  float row = floor(v / ${DRAWN_FURROW_SPACING.toFixed(2)});
  float across = (fract(v / ${DRAWN_FURROW_SPACING.toFixed(2)}) - 0.5) * ${DRAWN_FURROW_SPACING.toFixed(2)};
  float dashAt = u / ${DRAWN_FURROW_DASH.toFixed(2)} + markHash(vec2(row, plot.x + plot.y * 31.0));
  float dash = floor(dashAt);
  float inDash = fract(dashAt);
  float kept = step(markHash(vec2(dash, row + 17.0)), ${DRAWN_FURROW_KEEP.toFixed(2)});
  float taper = smoothstep(0.0, 0.18, inDash) * (1.0 - smoothstep(0.72, 0.9, inDash));
  return drawnLine(abs(across), ${DRAWN_FURROW_WIDTH.toFixed(3)} * taper, px) * kept * (1.0 - smoothstep(${(DRAWN_FURROW_SPACING / 4).toFixed(3)}, ${(DRAWN_FURROW_SPACING / 2).toFixed(3)}, drawnDetailPx));
}
float drawnBorderNear(float edgeMeters) {
  return 1.0 - smoothstep(${(DRAWN_EDGE_REACH / 2).toFixed(2)}, ${DRAWN_EDGE_REACH.toFixed(2)}, edgeMeters);
}
float drawnEchoLines(vec2 p, float edgeMeters, float spacing, float width, float kept, float px) {
  float broken = smoothstep(kept - 0.1, kept + 0.1, valueNoise(p / ${DRAWN_ECHO_BREAK.toFixed(1)} + 83.0));
  return drawnLine(abs(fract(edgeMeters / spacing) - 0.5) * spacing, width, px) * broken;
}
float drawnWindRipples(vec2 p, float edgeMeters, float px) {
  vec2 q = drawnViewFrame(p);
  float crest = q.y / ${DRAWN_SAND_RIPPLE_SPACING.toFixed(2)} + sin(q.x / 3.1) * 0.35 + (valueNoise(p / 5.0 + 71.0) - 0.5) * 1.2;
  float patchy = smoothstep(0.4, 0.6, valueNoise(p / 6.0 + 77.0));
  float open = drawnLine(abs(fract(crest) - 0.5) * ${DRAWN_SAND_RIPPLE_SPACING.toFixed(2)}, ${DRAWN_SAND_RIPPLE_WIDTH.toFixed(2)}, px) * patchy;
  float echo = drawnEchoLines(p, edgeMeters, ${DRAWN_SAND_RIPPLE_SPACING.toFixed(2)}, ${DRAWN_SAND_RIPPLE_WIDTH.toFixed(2)}, 0.4, px);
  return mix(open, echo, drawnBorderNear(edgeMeters));
}
float drawnShoreLines(vec2 p, float edgeMeters, float px) {
  float echo = drawnEchoLines(p, edgeMeters, ${DRAWN_GLINT_ROW.toFixed(2)}, ${DRAWN_SHORE_WIDTH.toFixed(2)}, 0.55, px);
  return echo * drawnBorderNear(edgeMeters) * (1.0 - smoothstep(0.15, 0.3, drawnDetailPx));
}
float drawnWaves(vec2 p, float px) {
  vec2 q = drawnViewFrame(p);
  float row = floor(q.y / ${DRAWN_GLINT_ROW.toFixed(2)});
  float along = q.x / ${DRAWN_GLINT_LONG.toFixed(2)} + markHash(vec2(row, 4.0)) * 5.0;
  float inside = fract(along);
  float busy = smoothstep(0.3, 0.75, valueNoise(p / ${DRAWN_GLINT_PATCH.toFixed(1)} + 51.0));
  float keep = step(markHash(vec2(floor(along), row) + 3.0), mix(${DRAWN_GLINT_CALM.toFixed(2)}, ${DRAWN_GLINT_BUSY.toFixed(2)}, busy));
  float taper = smoothstep(0.1, 0.35, inside) * (1.0 - smoothstep(0.65, 0.9, inside));
  float across = q.y - (row + 0.5) * ${DRAWN_GLINT_ROW.toFixed(2)} - sin(inside * 6.2831853) * 0.08;
  return drawnLine(abs(across), ${DRAWN_GLINT_WIDTH.toFixed(2)} * taper, px) * keep * (1.0 - smoothstep(0.15, 0.3, drawnDetailPx));
}
float drawnSegment(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  return length(p - a - ab * clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0));
}
float drawnClumps(vec2 p, float seed) {
  return smoothstep(0.3, 0.65, valueNoise(p / ${DRAWN_CLUMP_SIZE.toFixed(1)} + seed));
}
float drawnBlade(vec2 f, vec2 root, float lean, float bend, float tall) {
  vec2 mid = root + vec2(sin(lean), -cos(lean)) * tall * 0.5;
  vec2 tip = mid + vec2(sin(lean + bend), -cos(lean + bend)) * tall * 0.5;
  return min(drawnSegment(f, root, mid), drawnSegment(f, mid, tip));
}
vec2 drawnFromViewFrame(vec2 q) {
  return q.x * vec2(${(-TOWARD_CAMERA.y).toFixed(3)}, ${TOWARD_CAMERA.x.toFixed(3)}) + q.y * vec2(${TOWARD_CAMERA.x.toFixed(3)}, ${TOWARD_CAMERA.y.toFixed(3)});
}
int drawnMarkAt(vec2 at, out float edgeMeters) {
  vec2 tile = at / facetSide;
  vec4 rough = drawnEdgeTraits(tile);
  vec2 warp = rough.x > 0.0 ? drawnWarpAt(rough.x, rough.z, at) : vec2(0.0);
  DrawnBorder edge = drawnBorderAt((at + warp) / facetSide);
  float toward = edge.toward + min(rough.y * 2.0, 1.0) * drawnPepperNoise(at, drawnDetailPx) * ${DRAWN_PEPPER_SPREAD.toFixed(1)} + rough.w * drawnGritNoise(at, drawnDetailPx) / facetSide;
  edgeMeters = abs(toward) * facetSide;
  return int(drawnMaterialMark[toward > 0.0 ? edge.lo : edge.hi] + 0.5);
}
float drawnTufts(vec2 p, float px) {
  vec2 q = drawnViewFrame(p) / ${DRAWN_TUFT_CELL.toFixed(2)};
  vec2 c = floor(q);
  vec2 f = q - c;
  float pick = markHash(c + 41.0);
  if (pick > ${DRAWN_TUFT_EDGE_SHARE.toFixed(2)}) return 0.0;
  vec2 root = vec2(0.3 + 0.4 * markHash(c + 43.0), 0.9);
  vec2 rootAt = drawnFromViewFrame((c + root) * ${DRAWN_TUFT_CELL.toFixed(2)});
  float edgeMeters;
  if (drawnMarkAt(rootAt, edgeMeters) !=${markIndex("tufts")}) return 0.0;
  float clumps = smoothstep(0.5, 0.72, valueNoise(rootAt / ${DRAWN_TUFT_CLUMP.toFixed(1)} + 61.0));
  float edge = 1.0 - smoothstep(${(DRAWN_TUFT_EDGE_REACH / 4).toFixed(2)}, ${DRAWN_TUFT_EDGE_REACH.toFixed(2)}, edgeMeters);
  float share = max(clumps * ${DRAWN_TUFT_SHARE.toFixed(2)}, edge * ${DRAWN_TUFT_EDGE_SHARE.toFixed(2)});
  if (pick > share) return 0.0;
  float near = drawnBlade(f, root, (markHash(c + 59.0) - 0.5) * 0.3, (markHash(c + 61.0) - 0.5) * 1.0, mix(0.6, 0.85, markHash(c + 67.0)));
  if (markHash(c + 71.0) < share) near = min(near, drawnBlade(f, root + vec2(markHash(c + 73.0) < 0.5 ? -0.14 : 0.14, -0.04), (markHash(c + 79.0) - 0.5) * 0.3, (markHash(c + 83.0) - 0.5) * 1.0, mix(0.5, 0.75, markHash(c + 89.0))));
  return drawnLine(near * ${DRAWN_TUFT_CELL.toFixed(2)}, ${DRAWN_TICK_WIDTH.toFixed(3)}, px) * (1.0 - smoothstep(${(DRAWN_TUFT_CELL / 4).toFixed(3)}, ${(DRAWN_TUFT_CELL / 2).toFixed(3)}, drawnDetailPx));
}
float drawnPebbles(vec2 p, float cell, float seed, float open, float gathered, bool clumped, float px) {
  vec2 q = drawnViewFrame(p) / cell;
  vec2 c = floor(q);
  float pick = markHash(c + seed);
  if (pick > gathered) return 0.0;
  vec2 center = 0.3 + 0.4 * vec2(markHash(c + seed + 3.1), markHash(c + seed + 5.3));
  vec2 centerAt = drawnFromViewFrame((c + center) * cell);
  float edgeMeters;
  if (drawnMarkAt(centerAt, edgeMeters) !=${markIndex("pebbles")}) return 0.0;
  float share = mix(open, gathered, drawnBorderNear(edgeMeters)) * (clumped ? drawnClumps(centerAt, 71.0) : 1.0);
  if (pick > share) return 0.0;
  vec2 d = q - c - center;
  float radius = mix(0.12, 0.22, markHash(c + seed + 7.7));
  float under = mix(${DRAWN_PEBBLE_TOP.toFixed(2)}, 1.0, smoothstep(-0.3 * radius, 0.5 * radius, d.y));
  return drawnLine(abs(length(d) - radius) * cell, ${DRAWN_INK_WIDTH.toFixed(3)}, px) * under * (1.0 - smoothstep(cell / 8.0, cell / 4.0, drawnDetailPx));
}
bool drawnStandsBy(DrawnBorder edge, int here, int mark, float overhang) {
  bool beside = int(drawnMaterialMark[edge.lo] + 0.5) == mark || int(drawnMaterialMark[edge.hi] + 0.5) == mark;
  return here == mark || (beside && overhang < ${DRAWN_STAND_OVERHANG.toFixed(1)});
}
float drawnGravel(vec2 p, float px) {
  float small = drawnPebbles(p, ${DRAWN_PEBBLE_CELL.toFixed(2)}, 91.0, ${DRAWN_PEBBLE_SHARE.toFixed(2)}, ${DRAWN_PEBBLE_EDGE_SHARE.toFixed(2)}, true, px);
  float big = drawnPebbles(p, ${DRAWN_STONE_CELL.toFixed(2)}, 99.0, ${DRAWN_STONE_SHARE.toFixed(2)}, ${DRAWN_STONE_EDGE_SHARE.toFixed(2)}, false, px);
  return max(small, big);
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
  vec4 drawnRough = drawnEdgeTraits(drawnTileAt);
  vec2 drawnWarp = vec2(0.0);
  if (drawnRough.x > 0.0) drawnWarp = drawnWarpAt(drawnRough.x, drawnRough.z, vRoadXZ);
  DrawnBorder drawnEdge = drawnBorderAt((vRoadXZ + drawnWarp) / facetSide);
  float drawnPeppered = min(drawnRough.y * 2.0, 1.0);
  float drawnPepperShift = 0.0;
  if (drawnPeppered > 0.0) drawnPepperShift = drawnPeppered * drawnPepperNoise(vRoadXZ, drawnDetailPx) * ${DRAWN_PEPPER_SPREAD.toFixed(1)};
  float drawnGritMeters = 0.0;
  if (drawnRough.w > 0.0) drawnGritMeters = drawnGritNoise(vRoadXZ, drawnDetailPx);
  drawnPepperShift += drawnRough.w * drawnGritMeters / facetSide;
  float drawnToward = drawnEdge.toward + drawnPepperShift;
  float drawnAa = drawnTilePx + fwidth(drawnPepperShift);
  float drawnLoSide = smoothstep(-drawnEdgeSoft - drawnAa, drawnEdgeSoft + drawnAa, drawnToward);
  float drawnStreak = 0.0;
  if (drawnEdge.spill > min(drawnMaterialSpill[drawnEdge.lo], drawnMaterialSpill[drawnEdge.hi])) drawnStreak = drawnStreakAt(vRoadXZ);
  float drawnHaloAa = max(fwidth(drawnEdge.spill * drawnHaloAmount + drawnStreak), 0.0005);
  float drawnLoHaloPast;
  float drawnHiHaloPast;
  float drawnPxMeters = drawnTilePx * facetSide;
  float drawnHaloCrumb = drawnGritMeters / drawnPxMeters * drawnHaloAa;
  float drawnLoHalo = drawnHalo(drawnEdge, drawnEdge.lo, drawnStreak, drawnHaloCrumb, drawnHaloAa, drawnLoHaloPast);
  float drawnHiHalo = drawnHalo(drawnEdge, drawnEdge.hi, drawnStreak, drawnHaloCrumb, drawnHaloAa, drawnHiHaloPast);
  bool drawnSamePair = fwidth(float(drawnEdge.lo * ${GROUND_MATERIAL_IDS.length} + drawnEdge.hi)) == 0.0;
  float drawnLoHaloMeters = drawnHaloMeters(drawnLoHaloPast, drawnPxMeters, drawnSamePair);
  float drawnHiHaloMeters = drawnHaloMeters(drawnHiHaloPast, drawnPxMeters, drawnSamePair);
  vec3 drawnLoColor = mix(drawnMaterialTone(drawnEdge.lo), drawnEdge.spillColor, drawnLoHalo);
  vec3 drawnHiColor = mix(drawnMaterialTone(drawnEdge.hi), drawnEdge.spillColor, drawnHiHalo);
  diffuseColor.rgb = mix(drawnHiColor, drawnLoColor, drawnLoSide);
  float drawnSettles = mix(drawnMaterialSettles[drawnEdge.hi], drawnMaterialSettles[drawnEdge.lo], drawnLoSide) * drawnSurroundBlend;
  if (drawnSettles > 0.0) diffuseColor.rgb = mix(diffuseColor.rgb, texture(groundSurround, vRoadXZ / groundSurroundMeters).rgb, drawnSettles);
  diffuseColor.rgb *= 1.0 - drawnEdgeShadow(drawnEdge, drawnToward * facetSide, drawnLoHaloMeters, drawnHiHaloMeters, drawnAa * facetSide);
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
  float drawnZoomed = 1.0 - smoothstep(${DRAWN_MARK_FADE_FROM.toFixed(2)}, ${DRAWN_MARK_FADE_TO.toFixed(2)}, drawnDetailPx);
  float drawnRoadCrack = 0.0;
  if (roadIn > 0.0) drawnRoadCrack = drawnAsphaltCracks(vRoadXZ, drawnPx) * roadIn;
  diffuseColor.rgb *= 1.0 - ${DRAWN_MARK_DARK.toFixed(2)} * drawnRoadCrack;
  int drawnMark = int(drawnMaterialMark[drawnMaterial] + 0.5);
  vec3 drawnFaceNormal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
  float drawnFlat = smoothstep(${DRAWN_MARK_FLAT_FROM.toFixed(2)}, ${DRAWN_MARK_FLAT_TO.toFixed(2)}, abs(dot(drawnFaceNormal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz))));
  float drawnMarkShow = drawnInside * drawnOffRoad * drawnFlat;
  float drawnDark = 0.0;
  float drawnLight = 0.0;
  bool drawnMarked = drawnMarkShow > 0.0;
  bool drawnFine = drawnMarked && drawnZoomed > 0.0;
  float drawnEdgeMeters = abs(drawnEdge.toward) * facetSide;
  float drawnCrackFiner = drawnBorderNear(drawnEdgeMeters);
  if (drawnFine && drawnMark == ${markIndex("cracks")}) drawnDark = max(drawnCracks(vRoadXZ, ${DRAWN_CRACK_CELL.toFixed(1)}, drawnPx), drawnCrackFiner * drawnCracks(vRoadXZ + 57.0, ${DRAWN_CRACK_FINE_CELL.toFixed(1)}, drawnPx)) * drawnZoomed * 0.6;
  if (drawnFine && drawnMark == ${markIndex("saltCracks")}) drawnLight = max(drawnCracks(vRoadXZ + 31.0, ${DRAWN_CRACK_CELL.toFixed(1)}, drawnPx), drawnCrackFiner * drawnCracks(vRoadXZ + 87.0, ${DRAWN_CRACK_FINE_CELL.toFixed(1)}, drawnPx)) * drawnZoomed * 0.7;
  if (drawnMarked && drawnMark == ${markIndex("furrows")}) drawnDark = drawnFurrows(vRoadXZ, drawnPx) * ${DRAWN_FURROW_MIX.toFixed(2)};
  if (drawnMark == ${markIndex("puddles")}) drawnDark = drawnPuddles(vRoadXZ) * ${DRAWN_PUDDLE_MIX.toFixed(2)};
  if (drawnFine && drawnMark == ${markIndex("windRipples")}) drawnDark = drawnWindRipples(vRoadXZ, drawnEdgeMeters, drawnPx) * drawnZoomed * ${DRAWN_SAND_RIPPLE_MIX.toFixed(2)};
  if (drawnMarked && drawnMark == ${markIndex("waves")}) drawnLight = max(drawnWaves(vRoadXZ, drawnPx), drawnShoreLines(vRoadXZ, drawnEdgeMeters, drawnPx)) * ${DRAWN_GLINT_MIX.toFixed(2)};
  if (drawnFine && drawnMark == ${markIndex("seams")}) drawnDark = drawnSeams(vRoadXZ, drawnPx) * drawnZoomed;
  if (drawnMarked && drawnMark == ${markIndex("ashSmudge")}) drawnDark = smoothstep(0.55, 0.8, valueNoise(vRoadXZ / 2.5)) * 0.5;
  diffuseColor.rgb *= 1.0 - ${DRAWN_MARK_DARK.toFixed(2)} * drawnDark * drawnMarkShow;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.93, 0.88), drawnLight * drawnMarkShow);
  float drawnRoadVerge = smoothstep(roadEdge - ${DRAWN_ROAD_VERGE.toFixed(1)}, roadEdge - 0.2, roadFrame.x);
  float drawnStandShow = drawnFlat * max(drawnOffRoad, drawnRoadVerge);
  float drawnOverhang = abs(drawnToward) * facetSide;
  float drawnStanding = 0.0;
  if (drawnStandShow > 0.0 && drawnStandsBy(drawnEdge, drawnMark, ${markIndex("tufts")}, drawnOverhang)) drawnStanding = drawnTufts(vRoadXZ, drawnPx) * drawnTuftInk;
  if (drawnStandShow > 0.0 && drawnStandsBy(drawnEdge, drawnMark, ${markIndex("pebbles")}, drawnOverhang)) drawnStanding = max(drawnStanding, drawnGravel(vRoadXZ, drawnPx) * ${DRAWN_PEBBLE_INK.toFixed(2)});
  diffuseColor.rgb *= 1.0 - ${DRAWN_MARK_DARK.toFixed(2)} * drawnStanding * drawnStandShow;
`;

const RELIEF_BODY = `
  inkSurface.height = vGroundShape.x;
  inkSurface.slope = vGroundShape.yz;
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
    worn = wearPatch(worn, wear);
    worn *= 1.0 - ${DRAWN_MARK_DARK.toFixed(2)} * drawnAsphaltCracks(vRoadXZ, drawnPx);
    worn = wearPaint(worn, wear, roadWander);
    worn = wearSandOver(worn, wear, roadWander);
    worn = wearRim(worn, wear, roadWander);
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
    vec2 padLocal = vec2(dot(padOff, padAxes[i]), dot(padOff, vec2(-padAxes[i].y, padAxes[i].x)));
    vec2 padIn = padHalf - abs(padLocal);
    float padDepth = min(padIn.x, padIn.y);
    if (padDepth <= 0.0) continue;
    float padSoft = fwidth(padDepth);
    vec2 padSpot = padLocal / ${S.toFixed(4)} + float(i) * 7.31;
    float padLineLeft = padPaintLeft(padSpot, ${PAD_WEAR.gapCells.toFixed(2)}, ${PAD_WEAR.gapFrom.toFixed(2)}) * padPaintLeft(padSpot + 19.0, ${PAD_WEAR.chipCells.toFixed(2)}, ${PAD_WEAR.chipFrom.toFixed(2)});
    float padFillLeft = padPaintLeft(padSpot + 41.0, ${PAD_WEAR.fillCells.toFixed(2)}, ${PAD_WEAR.fillFrom.toFixed(2)});
    float padLine = (1.0 - smoothstep(padBorder - padSoft, padBorder + padSoft, padDepth)) * padLineLeft;
    vec3 padLook = mix(mix(roadColor, padDust * groundShade, 0.35), padMark * groundShade, padLine);
    diffuseColor.rgb = mix(diffuseColor.rgb, padLook, smoothstep(0.0, padSoft, padDepth) * max(padLine, padFillLeft));
  }
#endif
`;

const GROUND_PARTS = `${BORDER_BODY}${GLASS_BODY}${ROAD_BODY}${MARKS_BODY}${RELIEF_BODY}${BAND_BODY}${PADS_BODY}`;


const LAND_BODY = `
  inkSurface.crest = groundCrestLine(vRoadXZ) * inkCrestLine;
  inkSurface.form = groundLandformSlope(vRoadXZ);
`;

const GROUND_BODY = `{${GROUND_PARTS}${LAND_BODY}}`;

const CACHE_WRITE = `{${GROUND_PARTS}
  gl_FragColor = vec4(diffuseColor.rgb, inkSurface.road);
  groundCacheDataOut = vec4(inkSurface.height, inkSurface.slope, inkSurface.rise);
  groundCacheEdgeOut = vec4(min(drawnEdgePx, ${CACHE_EDGE_PX.toFixed(1)}) / ${CACHE_EDGE_PX.toFixed(1)}, drawnEdgeNear, 0.0, 1.0);
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
  vec2 groundCacheEdgeAt = texture(groundCacheEdge, groundCacheUv).rg;
  diffuseColor.rgb = groundCacheLook.rgb;
  inkSurface.road = groundCacheLook.a;
  inkSurface.height = groundCacheRelief.x;
  inkSurface.slope = groundCacheRelief.yz;
  inkSurface.rise = groundCacheRelief.w;
  inkSurface.edge = drawnEdgeLine(groundCacheEdgeAt.x * ${CACHE_EDGE_PX.toFixed(1)} / groundCacheDensity.x) * groundCacheEdgeAt.y;${LAND_BODY}}`;
