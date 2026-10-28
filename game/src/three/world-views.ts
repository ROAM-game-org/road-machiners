import type * as THREE from 'three';
import type { World } from '../sim/types';
import { playerSeenPropTiles } from '../sim/vision';
import type { PlayClock } from './play-clock';
import { CraterViews } from './render/craters';
import { FogView } from './render/fog';
import { ObstacleViews } from './render/obstacles';
import { addScatter } from './render/scatter';
import { RenderScope, SightLimit } from './render/scope';
import { ShadeView } from './render/shade';
import { addShipDecks } from './render/ship-decks';
import { SiteLights } from './render/siteLights';
import { addSites } from './render/sites';
import { CellStreamer } from './render/streamer';
import { groundMaterial, terrainMesh } from './render/terrain';

export type WorldViewHost = {
  scene: THREE.Scene;
  ground: THREE.Group;
  props: THREE.Group;
  play: PlayClock;
  maxTextureSize: number;
  prepare: (root: THREE.Object3D) => void;
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
};

export function buildWorldViews(world: World, host: WorldViewHost): WorldViews {
  const sightLimit = new SightLimit(world.size);
  const groundScope = new RenderScope(host.ground, world.size, sightLimit, false, false);
  const propScope = new RenderScope(host.props, world.size, sightLimit, true, true);
  const craters = new CraterViews(world, sightLimit, host.scene);
  const scopes = [groundScope, propScope, craters.scope];
  const ground = groundMaterial(world);
  const fog = new FogView(world, ground, sightLimit, playerSeenPropTiles(world));
  terrainMesh(world, ground, groundScope, (chunk) => fog.attach(chunk));
  const siteLights = new SiteLights(host.scene, addSites(world.terrain, propScope, host.play), { worldSize: world.size, maxTextureSize: host.maxTextureSize });
  addShipDecks(world.terrain, propScope);
  const obstacles = new ObstacleViews(propScope, world.terrain, host.pinOutpost);
  obstacles.sync(world.obstacles, world.salvage, world.broken);
  addScatter(world.terrain, world.obstacles, propScope);
  const shade = new ShadeView(world, ground, host.play);
  const streamer = new CellStreamer(scopes, host.prepare, () => performance.now(), Number.POSITIVE_INFINITY);
  streamer.buildAll();
  return { sightLimit, scopes, craters, siteLights, obstacles, fog, shade, streamer };
}
