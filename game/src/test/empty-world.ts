import { START_KITS, type StartKit } from '../data/start';
import { ICARUS_KEY } from '../sim/atlas';
import { defaultSetup } from '../sim/settings';
import type { Terrain } from '../sim/terrain';
import type { World } from '../sim/types';
import { newWorld } from '../sim/world';
import { TEST_MAP } from './map';

export type EmptyTemplate = { world: Omit<World, 'terrain'>; exploredTiles: number[] };

export const PLAIN_KIT: StartKit = {
  ...START_KITS.standard,
  parts: [...START_KITS.standard.parts, 'cage'],
  autoRepair: true,
  opening: null,
};

export function flatTerrain(size: number): Terrain {
  return { size, heights: new Array((size + 1) * (size + 1)).fill(0), types: new Array(size * size).fill('road'), atlas: ICARUS_KEY };
}

function frozenFlatTerrain(size: number): Terrain {
  const terrain = flatTerrain(size);
  Object.freeze(terrain.heights);
  Object.freeze(terrain.types);
  return Object.freeze(terrain);
}

export function buildEmptyTemplate(): EmptyTemplate {
  const { terrain: _terrain, ...template } = newWorld(1, PLAIN_KIT, TEST_MAP, defaultSetup('roaming'));
  const exploredTiles = [...template.player.explored.keys()].filter((tile) => template.player.explored[tile] === 1);
  template.obstacles = [];
  template.vehicles = template.vehicles.filter((v) => v.faction === 'player');
  template.states = [];
  template.rngState = -1655809527;
  template.player = { ...template.player, explored: new Uint8Array(0) };
  return { world: template, exploredTiles };
}

export function emptyWorldFrom(template: EmptyTemplate): World {
  const { world, exploredTiles } = template;
  const explored = new Uint8Array(world.size * world.size);
  for (const tile of exploredTiles) explored[tile] = 1;
  return { ...world, player: { ...world.player, explored }, terrain: frozenFlatTerrain(world.size) };
}
