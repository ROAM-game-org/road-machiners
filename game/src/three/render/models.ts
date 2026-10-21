
import * as THREE from 'three';
import { GLTFLoader, type GLTF, type GLTFLoaderPlugin, type GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import { fetchAsset } from '../../fetch-asset';
import { publicUrl } from '../../public-url';
import SHAPES from '../../data/prop-shapes.json';
import { PAL } from '../../render/palette';
import { SURFACE_MODELS, WEAPON_POOLS } from '../../render/partLooks';
import { edgeDistances, NEUTRAL_SLOT, packMasks, slotUv, WEAR_EDGE, type AtlasLayout } from './truckSurface';

export const NAMES = [
  'base_scout',
  'base_van',
  'base_longbed',
  'base_hauler',
  'base_tractor',
  'base_wagon',
  'base_carrier',
  'base_buggy',
  'base_courier',
  'base_jeep',
  'base_convertible',
  'base_bus',
  'base_loader',
  'base_niva',
  'base_bukhanka',
  'base_lincoln',
  'base_semi',
  'base_semi_rear',
  'base_sorokonoga',
  'base_sorokonoga_rear',
  'wmount_riser',
  'wreck',
  'rock',
  'rock_slab',
  'rock_split',
  'road_sign',
  'route_sign',
  'barrel',
  'pebbles',
  'scrub',
  'desert_stones',
  'desert_scrub',
  'cactus',
  'building',
  'crates',
  'water_tower',
  'dead_tree',
  'bunker',
  'sandbags',
  'tank_trap',
  'silo',
  'ship_hull',
  'ship_nose',
  'reactor',
  'hull_chunk',
  'ship_bow',
  'ship_cage',
  'ship_hub',
  'hull_shell',
  'hull_drum',
  'hull_shard',
  'hull_tower',
  'hull_gantry',
  'rim_rock',
  'bridge',
  'pump_station',
  'lock_gate',
  'power_pole',
  'billboard',
  'crag',
  'tank_hulk',
  'boat_fishing',
  'boat_barge',
  'boat_skiff',
  'ruin_house',
  'bridge_broken',
  'gas_station',
  'ship_wing',
  'escape_pod',
  'hull_bay',
  'cargo_pod',
  'engine_section',
  'habitat_cylinder',
  'wing_shard',
  'power_cell',
  'wing_deck',
  'ship_wing_deck',
  'ship_flap',
  'shack',
  'fence',
  'junk',
  'farmhouse',
  'barn',
  'drums',
  'woodpile',
  'quonset',
  'guard_post',
  'army_truck',
  'barrier',
  'engine_nozzle',
  'engine_frame',
  'ruin_compound',
  'watchtower',
  'glass_spire',
  'scrap_wall',
  'fort_pumpworks_wall',
  'fort_pumpworks_tower',
  'fort_pumpworks_gate',
  'fort_pumpworks_inner',
  'fort_cistern_wall',
  'fort_cistern_tower',
  'fort_cistern_gate',
  'fort_cistern_inner',
  'fort_ship_wall',
  'fort_ship_tower',
  'fort_ship_gate',
  'fort_scrap_wall',
  'fort_scrap_tower',
  'fort_scrap_gate',
  'fort_scrap_inner',
  'fort_patchwork_wall',
  'fort_patchwork_tower',
  'fort_patchwork_gate',
  'fort_compound_wall',
  'fort_compound_tower',
  'fort_compound_gate',
  'fort_ring_wall',
  'fort_ring_gate',
  'fort_yard_wall',
  'fort_yard_tower',
  'fort_yard_gate',
  'fort_outpost_wall',
  'fort_outpost_tower',
  'fort_outpost_gate',
  'fort_outpost_leaf',
  'fort_outpost_shut',
  'bowl_house_rust',
  'bowl_house_red',
  'bowl_house_grey',
  'windmill_tower',
  'windmill_rotor',
  'stilt_tank',
  'fruit_tree',
  'pumpjack_base',
  'pumpjack_beam',
  'storage_tank',
  'grain_silo',
  'grain_elevator',
  'lean_to',
  'crane_base',
  'crane_upper',
  'crane_grab',
  'ship_hull_ring',
  'ship_hull_ribs',
  'ship_hull_stern',
  'nose_rise',
  'nose_crag',
  'radar_dish',
  'scrap_shelter_flat',
  'scrap_shelter_lean',
  'hull_scaffold',
  'jib_crane',

  'bumper_front',
  'bumper_rear',
  'wheel',
  'coilover',
  'axle',
  'antenna',
  'tow_chain',
  'transmission',
  'fuel_tank',
  'scanner',
  'store_jerrycans',
  'store_locker',

  'util_sprout',
  'util_caltrops',
  'util_oil',
  'util_crane',
  'util_mortar',
  'util_flare',
  'util_scraper',
  'util_emitter',
  'cab_seat',
  'cab_pickup',
  'cab_hardtop',

  'eng_stock',
  'eng_tuned_v8',
  'eng_flat_four',
  'eng_workhorse_diesel',
  'eng_racing_v6',
  'eng_heavy_diesel',
  'eng_turbine',

  'arm_plates',
  'arm_cage',
  'arm_ram',
  'arm_scrap_panels',
  'arm_ceramic_plates',
  'arm_spaced',
  'arm_reinforced_cage',
  'arm_plow_ram',
  'arm_plate',
  'arm_scrap_sheet',
  'arm_ceramic_tile',
  'arm_claymore_ram',

  'cargo_rack',
  'cargo_trailer_box',
  'cargo_panniers',
  'cargo_flatbed',
  'cargo_light_frame',
  'cargo_enclosed_frame',
  'cargo_heavy_frame',

  'good_scrap',
  'parcel',
  'good_salt',
  'good_meds',
  'good_grain',
  'good_textiles',
  'good_tools',
  'good_batteries',
  'good_electronics',
  'good_parts',
  'good_fuel_drums',
  'good_water',
  'good_rations',
  'good_relics',

  'wmount_ring_small',
  'wmount_pintle',
  'wmount_ring_wide',
  'wmount_cradle',

  'wrec_mg_a',
  'wrec_mg_b',
  'wrec_shotgun',
  'wrec_autocannon',
  'wrec_cannon',
  'wrec_tank',
  'wrec_rocket_pod',
  'wrec_sniper',
  'wrec_harpoon',

  'wbar_mg_short',
  'wbar_mg_long',
  'wbar_twin',
  'wbar_shotgun',
  'wbar_autocannon',
  'wbar_cannon',
  'wbar_tank',
  'wbar_sniper',
  'wbar_rocket_tubes',
  'wbar_harpoon',

  'wext_scope',
  'wext_shield',
  'wext_drum',
] as const;
export type ModelName = (typeof NAMES)[number];

const SOCKET_PREFIX = 'socket_';

const loaded = new Map<ModelName, THREE.Object3D>();
const sockets = new Map<ModelName, Map<string, THREE.Vector3>>();

type Box = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
type Shape = { boxes: Box[] };

export type ModelFailure = { name: ModelName; error: unknown };

function standInShape(name: ModelName): Shape | undefined {
  return (SHAPES as Record<string, Shape>)[name];
}

function standIn(name: ModelName, shape: Shape): THREE.Object3D {
  const bounds = new THREE.Box3();
  for (const b of shape.boxes) {
    bounds.expandByPoint(new THREE.Vector3(b.x0, b.z0, -b.y1));
    bounds.expandByPoint(new THREE.Vector3(b.x1, b.z1, -b.y0));
  }
  const size = bounds.getSize(new THREE.Vector3());
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshStandardMaterial({ color: PAL.rock.side }));
  mesh.position.copy(bounds.getCenter(new THREE.Vector3()));
  const root = new THREE.Group();
  root.name = name;
  root.add(mesh);
  return toLambert(root);
}

export async function loadModels(
  read: (name: ModelName) => Promise<ArrayBuffer> = fetchModel,
  progress?: (done: number, total: number) => void,
): Promise<ModelFailure[]> {
  const loader = new GLTFLoader().register(keepMaskBytes);
  const failures: ModelFailure[] = [];
  let done = 0;
  maskImages.clear();
  maskLayout = null;
  SURFACE_ATLAS.value?.dispose();
  SURFACE_ATLAS.value = null;
  progress?.(0, NAMES.length);
  await Promise.all(
    NAMES.map(async (name) => {
      try {
        const gltf = await loader.parseAsync(await read(name), '');
        sockets.set(name, takeSockets(name, gltf.scene));
        takeMask(name, gltf);
        loaded.set(name, toLambert(gltf.scene));
      } catch (error) {
        const shape = standInShape(name);
        if (!shape) throw error;
        sockets.set(name, new Map());
        loaded.set(name, standIn(name, shape));
        failures.push({ name, error });
      }
      progress?.(++done, NAMES.length);
    }),
  );
  checkWeaponSockets();
  prepareSurfaces(new Set(failures.map((f) => f.name)));
  return failures;
}

export function socket(name: ModelName, socketName: string): THREE.Vector3 {
  const own = sockets.get(name);
  if (!own) throw new Error(`Model ${name} is not loaded. Call loadModels() before building views.`);
  const at = own.get(socketName);
  if (!at) throw new Error(`Model ${name} has no socket ${socketName}. It has: ${[...own.keys()].join(', ') || 'none'}.`);
  return at.clone();
}

function takeSockets(name: ModelName, root: THREE.Object3D): Map<string, THREE.Vector3> {
  root.updateMatrixWorld(true);
  const found: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.name.startsWith(SOCKET_PREFIX)) found.push(o);
  });
  const out = new Map<string, THREE.Vector3>();
  for (const node of found) {
    const key = node.name.slice(SOCKET_PREFIX.length);
    if (out.has(key)) throw new Error(`Model ${name} has socket ${key} twice`);
    if (node.children.length > 0) throw new Error(`Model ${name} socket ${key} has child nodes`);
    out.set(key, root.worldToLocal(node.getWorldPosition(new THREE.Vector3())));
    node.removeFromParent();
  }
  return out;
}

function checkWeaponSockets(): void {
  for (const pool of Object.values(WEAPON_POOLS)) {
    for (const m of pool.mount) socket(m, 'head');
    for (const b of pool.barrel) socket(b, 'tip');
    for (const r of pool.receiver) {
      socket(r, 'muzzle');
      socket(r, 'extra');
    }
  }
}

function fetchModel(name: ModelName): Promise<ArrayBuffer> {
  return fetchAsset('Model', publicUrl(`models/${name}.glb`));
}

function source(name: ModelName): THREE.Object3D {
  const src = loaded.get(name);
  if (!src) throw new Error(`Model ${name} is not loaded. Call loadModels() before building views.`);
  return src;
}

export function model(name: ModelName): THREE.Object3D {
  const copy = source(name).clone(true);
  copy.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry = o.geometry.clone();
      o.material = (o.material as THREE.Material).clone();
    }
  });
  return copy;
}

export function instancedModel(name: ModelName, placements: THREE.Matrix4[], tints: number[]): THREE.Group {
  if (placements.length === 0) throw new Error(`Instanced ${name} needs at least one placement`);
  if (tints.length !== placements.length) throw new Error(`Instanced ${name} has ${placements.length} placements but ${tints.length} tints`);
  const src = source(name);
  src.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(src.matrixWorld).invert();
  const group = new THREE.Group();
  const local = new THREE.Matrix4();
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  src.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    local.multiplyMatrices(toRoot, o.matrixWorld);
    const mesh = new THREE.InstancedMesh(o.geometry, o.material, placements.length);
    placements.forEach((placement, i) => {
      mesh.setMatrixAt(i, matrix.multiplyMatrices(placement, local));
      mesh.setColorAt(i, color.setScalar(tints[i]));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.add(mesh);
  });
  group.matrixAutoUpdate = false;
  return group;
}

const GLOW_MATERIAL = 'glow';
const GLOW = { color: new THREE.Color(PAL.lamp.amber), strength: 0.4 };
export const MODEL_GLOW = { color: GLOW.color.getHex(), emissive: GLOW.color.clone().multiplyScalar(GLOW.strength).getHex() };

function toLambert(root: THREE.Object3D): THREE.Object3D {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const lambert = mats.map((m) => {
      if (!(m instanceof THREE.MeshStandardMaterial)) throw new Error(`Model mesh ${o.name} has unexpected material ${m.type}`);
      const l = new THREE.MeshLambertMaterial({ color: m.color, flatShading: true, name: m.name });
      if (m.name === GLOW_MATERIAL) {
        l.color.copy(GLOW.color);
        l.emissive.copy(GLOW.color).multiplyScalar(GLOW.strength);
      }
      m.dispose();
      return l;
    });
    o.material = Array.isArray(o.material) ? lambert : lambert[0];
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return root;
}

const OUTLINE = {
  width: { value: 0.5 },
  viewport: { value: new THREE.Vector2(1, 1) },
};

function readViewport(renderer: THREE.WebGLRenderer): void {
  renderer.getSize(OUTLINE.viewport.value);
}

export const TRUCK_BIT = 1;
export const PROP_BIT = 2;
export const READY_ARC_BIT = 4;
export const SPENT_ARC_BIT = 8;
export const OUTLINE_ORDER = 805;

function outlineMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color: PAL.outline,
    side: THREE.BackSide,
    stencilWrite: true,
    stencilRef: 0,
    stencilFuncMask: TRUCK_BIT | PROP_BIT,
    stencilFunc: THREE.EqualStencilFunc,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.outlineWidth = OUTLINE.width;
    shader.uniforms.viewport = OUTLINE.viewport;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float outlineWidth;\nuniform vec2 viewport;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec3 outlineNormal = normal;
        #ifdef USE_INSTANCING
          outlineNormal = mat3(instanceMatrix) * outlineNormal;
        #endif
        vec2 outlineDir = (normalMatrix * outlineNormal).xy;
        if (dot(outlineDir, outlineDir) > 1e-8) gl_Position.xy += normalize(outlineDir) * outlineWidth * 2.0 / viewport * gl_Position.w;`);
  };
  material.customProgramCacheKey = () => 'outline';
  material.userData.shared = true;
  return material;
}

const truckOutline = outlineMaterial();
const propOutline = outlineMaterial();

const WELD_PER_METER = 1e3;

type WeldGrid = { min: [number, number, number]; span: [number, number, number] };

function weldStep(v: number): number {
  return Math.trunc(v * WELD_PER_METER + 0.5);
}

function weldGrid(geos: readonly THREE.BufferGeometry[]): WeldGrid {
  const box = new THREE.Box3();
  for (const g of geos) box.union(new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute));
  const min: WeldGrid['min'] = [weldStep(box.min.x), weldStep(box.min.y), weldStep(box.min.z)];
  const span: WeldGrid['span'] = [weldStep(box.max.x) - min[0] + 1, weldStep(box.max.y) - min[1] + 1, weldStep(box.max.z) - min[2] + 1];
  if (span[0] * span[1] * span[2] > Number.MAX_SAFE_INTEGER) throw new Error(`Outline of ${box.max.x - box.min.x} by ${box.max.y - box.min.y} by ${box.max.z - box.min.z} meters is outside the weld range`);
  return { min, span };
}

function weldKey(grid: WeldGrid, x: number, y: number, z: number): number {
  const [i, j, k] = [weldStep(x) - grid.min[0], weldStep(y) - grid.min[1], weldStep(z) - grid.min[2]];
  return (i * grid.span[1] + j) * grid.span[2] + k;
}

function weld(geos: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const origin = weldGrid(geos);
  const slots = new Map<number, number>();
  const positions: number[] = [];
  const indices: number[] = [];
  for (const g of geos) {
    const pos = g.getAttribute('position');
    const count = g.index ? g.index.count : pos.count;
    for (let n = 0; n < count; n++) {
      const at = g.index ? g.index.getX(n) : n;
      const [x, y, z] = [pos.getX(at), pos.getY(at), pos.getZ(at)];
      const key = weldKey(origin, x, y, z);
      let slot = slots.get(key);
      if (slot === undefined) {
        slot = slots.size;
        slots.set(key, slot);
        positions.push(x, y, z);
      }
      indices.push(slot);
    }
  }
  const welded = new THREE.BufferGeometry();
  welded.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  welded.setIndex(indices);
  welded.computeVertexNormals();
  return welded;
}

export function outlineOf(geos: readonly THREE.BufferGeometry[]): THREE.Mesh[] {
  if (geos.length === 0) return [];
  const mesh = new THREE.Mesh(weld(geos), truckOutline);
  mesh.onBeforeRender = readViewport;
  mesh.renderOrder = OUTLINE_ORDER;
  mesh.userData.outline = true;
  return [mesh];
}

const welded = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

export function outlineProps(obj: THREE.Object3D): void {
  const meshes: THREE.Mesh[] = [];
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.outline) meshes.push(o);
  });
  for (const mesh of meshes) {
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      m.stencilWrite = true;
      m.stencilRef = PROP_BIT;
      m.stencilWriteMask = PROP_BIT;
      m.stencilFunc = THREE.AlwaysStencilFunc;
      m.stencilZPass = THREE.ReplaceStencilOp;
    }
    let geo = welded.get(mesh.geometry);
    if (!geo) {
      geo = weld([mesh.geometry]);
      welded.set(mesh.geometry, geo);
    }
    const outline = mesh instanceof THREE.InstancedMesh ? instancedOutline(mesh, geo) : new THREE.Mesh(geo, propOutline);
    outline.onBeforeRender = readViewport;
    outline.renderOrder = OUTLINE_ORDER;
    outline.userData.outline = true;
    mesh.add(outline);
  }
}

function instancedOutline(mesh: THREE.InstancedMesh, geo: THREE.BufferGeometry): THREE.InstancedMesh {
  const outline = new THREE.InstancedMesh(geo, propOutline, mesh.count);
  outline.instanceMatrix = mesh.instanceMatrix;
  outline.boundingSphere = mesh.boundingSphere;
  outline.boundingBox = mesh.boundingBox;
  outline.matrixAutoUpdate = false;
  return outline;
}

export const SURFACE_MASK = { version: 1, metersPerPixel: 0.1, maxSide: 256 };

type Surface = { dirt: [number, number, number]; edge: number; chips: number; shine: number; grain: number; neutral: number };

const SURFACES = {
  paint: { dirt: [0.22, 0.18, 0.14], edge: 0.25, chips: 1, shine: 0, grain: 1, neutral: 0 },
  metal: { dirt: [0.28, 0.27, 0.26], edge: 0.6, chips: 0, shine: 1, grain: 0, neutral: 0.6 },
  rust: { dirt: [0.25, 0.17, 0.12], edge: 0.2, chips: 0, shine: 0, grain: 0, neutral: 0 },
  grime: { dirt: [0.2, 0.19, 0.17], edge: 0.35, chips: 0, shine: 0, grain: 0, neutral: 0 },
  plain: { dirt: [0.25, 0.24, 0.22], edge: 0.15, chips: 0, shine: 0, grain: 0, neutral: 0 },
} satisfies Record<string, Surface>;

export type SurfaceName = keyof typeof SURFACES;

const SURFACE_OF_MATERIAL: Record<string, SurfaceName | null> = {
  paint: 'paint',
  trim: 'paint',
  red: 'paint',
  mustard: 'paint',
  stripe: 'paint',
  white: 'paint',
  metal: 'metal',
  metal_light: 'metal',
  metal_dark: 'metal',
  steel: 'metal',
  rust: 'rust',
  rust_side: 'rust',
  rust_dark: 'rust',
  dark: 'grime',
  under: 'grime',
  wheel: 'grime',
  soot: 'grime',
  glass: null,
  light: null,
  glow: null,
};

const CHIP = { color: new THREE.Color(0x5b5a57), scale: 7, at: 1.05, share: 0.5, slope: 1.35 };
const WEAR = { width: 0.08 };
const CHROME = { reflect: 0.55, grazing: 0.35, horizon: 1.6, gain: 0.1, body: 0 };

const GRAIN = { scale: 40, amount: 0.05 };

export const SURFACE_LOOK = { chips: { value: CHIP.share }, chipAt: { value: CHIP.at }, chrome: { value: CHROME.gain }, chromeBody: { value: CHROME.body }, grain: { value: GRAIN.amount } };

export function surfaceOf(materialName: string): SurfaceName | null {
  const named = SURFACE_OF_MATERIAL[materialName];
  return named === undefined ? 'plain' : named;
}

export function surfacedMaterial(color: number, surface: SurfaceName | null): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ color, flatShading: true });
  if (surface === null) return material;
  const own = SURFACES[surface];
  const uniforms = {
    surfaceMask: SURFACE_ATLAS,
    surfaceDirt: { value: new THREE.Vector3(...own.dirt) },
    surfaceEdge: { value: own.edge },
    surfaceChips: { value: own.chips },
    surfaceChipShare: SURFACE_LOOK.chips,
    surfaceChipAt: SURFACE_LOOK.chipAt,
    surfaceShine: { value: own.shine },
    surfaceChrome: SURFACE_LOOK.chrome,
    surfaceChromeBody: SURFACE_LOOK.chromeBody,
    surfaceGrain: { value: own.grain },
    surfaceGrainShare: SURFACE_LOOK.grain,
    surfaceNeutral: { value: own.neutral },
  };
  material.onBeforeCompile = (shader) => {
    if (!SURFACE_ATLAS.value) throw new Error('Call paintSurfaceMasks() after loadModels() before drawing trucks');
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSurfacePos;\nvarying vec2 vMaskUv;\nvarying vec3 vEdgeDistance;\nattribute vec2 ${MASK_UV};\nattribute vec3 ${EDGE_DISTANCE};`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvSurfacePos = position;\nvMaskUv = ${MASK_UV};\nvEdgeDistance = ${EDGE_DISTANCE};`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SURFACE_UNIFORMS}`)
      .replace('#include <color_fragment>', SURFACE_COLOR)
      .replace('#include <opaque_fragment>', `${SURFACE_CHROME}\n${SURFACE_NEUTRAL}\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'surface';
  return material;
}

const f = (n: number) => n.toFixed(4);

const SURFACE_UNIFORMS = `varying vec3 vSurfacePos;
varying vec2 vMaskUv;
varying vec3 vEdgeDistance;
uniform sampler2D surfaceMask;
uniform vec3 surfaceDirt;
uniform float surfaceEdge;
uniform float surfaceChips;
uniform float surfaceChipShare;
uniform float surfaceChipAt;
uniform float surfaceShine;
uniform float surfaceChrome;
uniform float surfaceChromeBody;
uniform float surfaceGrain;
uniform float surfaceGrainShare;
uniform float surfaceNeutral;
float surfaceHash(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}
float surfaceNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 t = fract(p);
  t = t * t * (3.0 - 2.0 * t);
  return mix(
    mix(mix(surfaceHash(i), surfaceHash(i + vec3(1, 0, 0)), t.x), mix(surfaceHash(i + vec3(0, 1, 0)), surfaceHash(i + vec3(1, 1, 0)), t.x), t.y),
    mix(mix(surfaceHash(i + vec3(0, 0, 1)), surfaceHash(i + vec3(1, 0, 1)), t.x), mix(surfaceHash(i + vec3(0, 1, 1)), surfaceHash(i + vec3(1, 1, 1)), t.x), t.y),
    t.z);
}`;

const SURFACE_COLOR = `
  float surfaceAo = texture2D(surfaceMask, vMaskUv).r;
  float surfaceFold = min(min(vEdgeDistance.x, vEdgeDistance.y), vEdgeDistance.z);
  float surfaceWorn = clamp(1.0 - surfaceFold / ${f(WEAR.width)}, 0.0, 1.0);
  diffuseColor.rgb *= mix(surfaceDirt, vec3(1.0), surfaceAo);
  diffuseColor.rgb *= 1.0 + surfaceEdge * surfaceWorn;
  vec3 grainAt = vSurfacePos * ${f(GRAIN.scale)};
  float grainShare = surfaceGrain * surfaceGrainShare * (1.0 - smoothstep(0.35, 1.0, length(fwidth(grainAt))));
  if (grainShare > 0.0) {
    float grain = surfaceNoise(grainAt) * 0.6 + surfaceNoise(grainAt * 2.3) * 0.4 - 0.5;
    diffuseColor.rgb *= 1.0 + 2.0 * grain * grainShare;
  }
  float chipWidth = fwidth(surfaceWorn) * 1.45 + surfaceWorn * length(fwidth(vSurfacePos)) * ${f(CHIP.scale * CHIP.slope)};
  float chipShare = surfaceChips * surfaceChipShare;
  if (surfaceWorn > 0.0 && chipShare > 0.0) {
    float chipField = surfaceWorn * (0.55 + 0.9 * surfaceNoise(vSurfacePos * ${f(CHIP.scale)}));
    float chip = smoothstep(surfaceChipAt - chipWidth, surfaceChipAt + chipWidth, chipField) * chipShare;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${f(CHIP.color.r)}, ${f(CHIP.color.g)}, ${f(CHIP.color.b)}) * mix(0.6, 1.0, surfaceAo), chip);
  }
`;

const SURFACE_NEUTRAL = `
  outgoingLight = mix(outgoingLight, vec3(dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722))), surfaceNeutral);
`;

const SURFACE_CHROME = `
#if NUM_HEMI_LIGHTS > 0
  if (surfaceShine > 0.0) {
    vec3 chromeView = normalize(vViewPosition);
    vec3 chromeRay = reflect(-chromeView, normal);
    float chromeUp = dot(chromeRay, hemisphereLights[0].direction);
    vec3 chromeSky = hemisphereLights[0].skyColor;
    vec3 chromeHorizon = chromeSky * ${f(CHROME.horizon)};
    vec3 chromeEnv = chromeUp > 0.0
      ? mix(chromeHorizon, chromeSky, sqrt(chromeUp))
      : mix(chromeHorizon, hemisphereLights[0].groundColor, pow(-chromeUp, 0.4));
    float chromeFresnel = pow(1.0 - max(dot(normal, chromeView), 0.0), 5.0);
    float chromeShare = clamp(surfaceShine * mix(surfaceChromeBody, 1.0, surfaceWorn) * (${f(CHROME.reflect)} + ${f(CHROME.grazing)} * chromeFresnel), 0.0, 1.0);
    vec3 chromeTint = diffuseColor.rgb / max(max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)), 0.001);
    outgoingLight = mix(outgoingLight, chromeEnv * chromeTint * surfaceChrome * surfaceAo, chromeShare);
  }
#endif
`;

type MaskImage = { side: number; bytes: Uint8Array<ArrayBuffer>; mime: string };
type MaskMarker = { version: number; side: number };

const maskImages = new Map<ModelName, MaskImage>();
let maskLayout: AtlasLayout | null = null;
export const SURFACE_ATLAS: { value: THREE.Texture | null } = { value: null };

function keepMaskBytes(parser: GLTFParser): GLTFLoaderPlugin {
  return {
    name: 'roam_surface_mask',
    loadTexture: async (index: number) => {
      const image = parser.json.images[parser.json.textures[index].source];
      const view: ArrayBuffer = await parser.getDependency('bufferView', image.bufferView);
      const texture = new THREE.Texture();
      texture.userData.mask = { bytes: new Uint8Array(view), mime: image.mimeType };
      return texture;
    },
  };
}

function maskBytesOf(root: THREE.Object3D): Omit<MaskImage, 'side'> | undefined {
  let found: Omit<MaskImage, 'side'> | undefined;
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) found ??= (m as THREE.MeshStandardMaterial).aoMap?.userData.mask;
  });
  return found;
}

function takeMask(name: ModelName, gltf: GLTF): void {
  const marker = gltf.scene.userData.surfaceMask as MaskMarker | undefined;
  const bytes = maskBytesOf(gltf.scene);
  if (!marker && !bytes) return;
  maskImages.set(name, { side: checkedMarker(name, marker).side, ...bakedBytes(name, bytes) });
}

function checkedMarker(name: ModelName, marker: MaskMarker | undefined): MaskMarker {
  if (!marker) throw new Error(`Model ${name} has a mask image but no mask marker. Run npm run models:bake ${name}.`);
  if (marker.version !== SURFACE_MASK.version) throw new Error(`Model ${name} has mask version ${marker.version}, the game reads ${SURFACE_MASK.version}. Run npm run models:bake ${name}.`);
  return marker;
}

function bakedBytes(name: ModelName, bytes: Omit<MaskImage, 'side'> | undefined): Omit<MaskImage, 'side'> {
  if (!bytes) throw new Error(`Model ${name} has a mask marker but no mask image. Run npm run models:bake ${name}.`);
  return bytes;
}

function prepareSurfaces(failed: ReadonlySet<ModelName>): void {
  const missing = SURFACE_MODELS.filter((n) => !failed.has(n) && !maskImages.has(n));
  if (missing.length) throw new Error(`Truck models without a surface mask: ${missing.join(', ')}. Run npm run models:bake.`);
  maskLayout = packMasks(new Map([...maskImages].map(([n, m]) => [n, m.side])));
  for (const name of maskImages.keys()) surfaceGeometry(name, source(name), maskLayout);
}

function surfaceGeometry(name: ModelName, root: THREE.Object3D, layout: AtlasLayout): void {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const slot = layout.slots.get(name)!;
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o);
  });
  const soups = meshes.map((mesh) => {
    const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    if (geo !== mesh.geometry) mesh.geometry.dispose();
    mesh.geometry = geo;
    const uv = geo.getAttribute('uv');
    if (!uv) throw new Error(`Model ${name} mesh ${mesh.name} has a surface mask but no UVs`);
    const atlasUv = new Float32Array(uv.count * 2);
    for (let i = 0; i < uv.count; i++) atlasUv.set(slotUv(layout, slot, maskCoord(name, uv.getX(i)), maskCoord(name, uv.getY(i))), i * 2);
    geo.setAttribute(MASK_UV, new THREE.BufferAttribute(atlasUv, 2));
    geo.deleteAttribute('uv');
    return geo.getAttribute('position').clone().applyMatrix4(toRoot.clone().multiply(mesh.matrixWorld)).array as Float32Array;
  });
  const all = new Float32Array(soups.reduce((n, s) => n + s.length, 0));
  soups.reduce((at, s) => (all.set(s, at), at + s.length), 0);
  const distances = edgeDistances(all);
  soups.reduce((at, s, i) => (meshes[i].geometry.setAttribute(EDGE_DISTANCE, new THREE.BufferAttribute(distances.slice(at, at + s.length), 3)), at + s.length), 0);
}

export const MASK_UV = 'maskUv';
export const EDGE_DISTANCE = 'edgeDistance';

export function neutralSurface(count: number): { maskUv: THREE.BufferAttribute; edgeDistance: THREE.BufferAttribute } {
  if (!maskLayout) throw new Error('Call loadModels() before building truck surfaces');
  const slot = maskLayout.slots.get(NEUTRAL_SLOT)!;
  const center = slotUv(maskLayout, slot, 0.5, 0.5);
  const uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) uv.set(center, i * 2);
  return { maskUv: new THREE.BufferAttribute(uv, 2), edgeDistance: new THREE.BufferAttribute(new Float32Array(count * 3).fill(WEAR_EDGE.far), 3) };
}

export async function paintSurfaceMasks(): Promise<void> {
  const layout = maskLayout;
  if (!layout) throw new Error('Call loadModels() before paintSurfaceMasks()');
  SURFACE_ATLAS.value?.dispose();
  SURFACE_ATLAS.value = null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = layout.side;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas for the truck surface masks');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, layout.side, layout.side);
  await Promise.all(
    [...maskImages].map(async ([name, mask]) => {
      const bitmap = await createImageBitmap(new Blob([mask.bytes], { type: mask.mime }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const slot = layout.slots.get(name)!;
      if (bitmap.width !== slot.side || bitmap.height !== slot.side) throw new Error(`Mask of ${name} is ${bitmap.width}x${bitmap.height}, its marker says ${slot.side}`);
      ctx.drawImage(bitmap, slot.x, slot.y);
      bitmap.close();
    }),
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.NoColorSpace;
  SURFACE_ATLAS.value = texture;
}

function maskCoord(name: ModelName, t: number): number {
  if (t < 0 || t > 1) throw new Error(`Model ${name} has a mask UV of ${t}, outside its mask. Rebake it with npm run models:bake ${name}.`);
  return t;
}
