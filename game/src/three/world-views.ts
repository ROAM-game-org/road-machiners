import * as THREE from 'three';
import type { World } from '../sim/types';
import { PERF } from '../data/perf';
import { playerVehicle } from '../sim/damage';
import { PHYSICS } from '../data/physics';
import type { V3 } from '../phys/frames';
import { grayRadius, grayReach, playerSeenPropTiles } from '../sim/vision';
import { CraterViews } from './render/craters';
import { FogView } from './render/fog';
import { ObstacleViews } from './render/obstacles';
import { addScatter } from './render/scatter';
import { RenderScope, SightLimit } from './render/scope';
import { ShadeView } from './render/shade';
import { addShipDecks } from './render/ship-decks';
import { spotShadowsFit } from './render/lightBudget';
import { SiteLights } from './render/siteLights';
import { addSites, HollowLamps } from './render/sites';
import { CellStreamer } from './render/streamer';
import { GroundCache, groundCacheUniforms } from './render/groundCache';
import { cachedGround, groundMaterial, terrainMesh } from './render/terrain';
import type { DrawnGround } from './render/groundShader';
import { PLAY_EASE } from '../config';
import { reportError } from './crash';
import type { GpuContext } from './gpu-context';
import { PlayClock } from './play-clock';
import { CameraRig } from './render/camera';
import { refreshShadows, VehicleLights } from './render/daylight';
import { ShaderWarmup } from './shader-errors';
import type { WebGLSurface } from './webgl';

export type SceneCore = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  rig: CameraRig;
  shaders: ShaderWarmup;
  ground: THREE.Group;
  props: THREE.Group;
  play: PlayClock;
  vehicleLights: VehicleLights;
};

export function sceneCore(surface: WebGLSurface, gpu: GpuContext, view: HTMLElement): SceneCore {
  const renderer = new THREE.WebGLRenderer({ canvas: surface.canvas, context: surface.context, antialias: true, stencil: true });
  const scene = new THREE.Scene();
  const vehicleLights = new VehicleLights(scene, spotShadowsFit(renderer.capabilities.maxVaryings));
  refreshShadows(renderer, scene, gpu);
  view.appendChild(renderer.domElement);
  renderer.domElement.classList.add('view');
  const rig = new CameraRig(renderer.domElement);
  const shaders = new ShaderWarmup(renderer, scene, rig.camera, reportError, gpu);
  return { renderer, scene, rig, shaders, ground: new THREE.Group(), props: new THREE.Group(), play: new PlayClock(PLAY_EASE), vehicleLights };
}

export type WorldViewHost = {
  core: SceneCore;
  drawn: DrawnGround;
  pinOutpost: () => void;
};

export type WorldViews = {
  sightLimit: SightLimit;
  scopes: RenderScope[];
  craters: CraterViews;
  siteLights: SiteLights;
  obstacles: ObstacleViews;
  fog: FogView;
  shade: ShadeView;
  streamer: CellStreamer;
  groundMaterial: THREE.MeshLambertMaterial;
};

export function sightAround(limit: SightLimit, streamer: CellStreamer, world: World, truck: V3): number {
  const meters = grayRadius(world) * PHYSICS.metersPerTile;
  limit.set(truck, meters);
  const reach = grayReach(world, playerVehicle(world));
  streamer.frame({ x: truck.x / PHYSICS.metersPerTile, y: truck.z / PHYSICS.metersPerTile }, reach, reach + PERF.stream.leadTiles);
  return meters;
}

function groundFor(world: World, host: WorldViewHost): THREE.MeshLambertMaterial {
  const { renderer, ground, shaders } = host.core;
  if (!renderer.extensions.has('EXT_color_buffer_float')) return groundMaterial(world, host.drawn);
  const cacheUniforms = groundCacheUniforms();
  const { reader, writer, writes } = cachedGround(world, host.drawn, cacheUniforms);
  shaders.drawGroundThrough(new GroundCache(renderer, ground, reader, writer, writes.uniforms, cacheUniforms));
  return reader;
}

export function* worldViewPieces(world: World, host: WorldViewHost): Generator<string, WorldViews> {
  const { scene, props, play, renderer, shaders } = host.core;
  yield 'building the scopes';
  const sightLimit = new SightLimit(world.size);
  const groundScope = new RenderScope(host.core.ground, world.size, sightLimit, false, false);
  const propScope = new RenderScope(props, world.size, sightLimit, true, true);
  const craters = new CraterViews(world, sightLimit, scene);
  const scopes = [groundScope, propScope, craters.scope];
  yield 'building the ground material';
  const groundMaterial = groundFor(world, host);
  yield 'building the fog';
  const fog = new FogView(world, groundMaterial, sightLimit, playerSeenPropTiles(world));
  terrainMesh(world, groundMaterial, groundScope, (chunk) => fog.attach(chunk));
  yield 'building the site lights';
  const hollow = world.terrain.atlas.kind === 'icarus' ? new HollowLamps(world.terrain, propScope) : null;
  const siteLights = new SiteLights(scene, hollow, { worldSize: world.size, maxTextureSize: renderer.capabilities.maxTextureSize, spotShadows: spotShadowsFit(renderer.capabilities.maxVaryings) });
  yield 'placing the props';
  addSites(world.terrain, propScope, play, siteLights);
  addShipDecks(world.terrain, propScope);
  const obstacles = new ObstacleViews(propScope, world.terrain, host.pinOutpost);
  obstacles.sync(world.obstacles, world.salvage, world.broken);
  yield 'placing the scatter';
  addScatter(world.terrain, world.obstacles, propScope);
  yield 'building the first cells';
  const shade = new ShadeView(world, groundMaterial, play);
  const streamer = new CellStreamer(scopes, (root) => shaders.prepare(root), () => performance.now(), PERF.stream.budgetMs);
  const reach = grayReach(world, playerVehicle(world));
  streamer.boot(playerVehicle(world).pos, reach, reach);
  return { sightLimit, scopes, craters, siteLights, obstacles, fog, shade, streamer, groundMaterial };
}

export type NamedTexture = [name: string, texture: THREE.Texture];

export type FirstFrameHost = {
  upload: (texture: THREE.Texture) => void;
  compile: () => void;
  fillGroundCache: () => void;
  drawFirstFrame: () => void;
};

export function* firstFramePieces(textures: readonly NamedTexture[], host: FirstFrameHost): Generator<string, void> {
  for (const [name, texture] of textures) {
    yield `uploading ${name}`;
    host.upload(texture);
  }
  yield 'compiling the shaders';
  host.compile();
  yield 'drawing the ground cache';
  host.fillGroundCache();
  yield 'drawing the first frame';
  host.drawFirstFrame();
}

export function groundTextures(uniforms: Record<string, THREE.IUniform>, extra: Record<string, THREE.Texture | null>): NamedTexture[] {
  const named = [...Object.entries(uniforms).map(([name, uniform]): [string, unknown] => [name, uniform.value]), ...Object.entries(extra)];
  return named.filter((entry): entry is NamedTexture => isTexture(entry[1]));
}

function isTexture(value: unknown): value is THREE.Texture {
  return typeof value === 'object' && value !== null && (value as { isTexture?: unknown }).isTexture === true;
}
