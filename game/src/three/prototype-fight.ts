import { freeSpotNear } from '../sim/free-spot';
import { vehicleStats } from '../sim/stats';
import { bearing, dist } from '../sim/vec';
import { PARTS } from '../data/parts';
import { makeVehicle } from '../sim/factory';
import { newTimedCombat } from '../sim/timed-combat';
import { START_KITS } from '../data/start';
import { spawnNear, skipToHour } from '../sim/cheats';
import { newWorld, setAutoFire } from '../sim/world';
import { defaultSetup } from '../sim/settings';
import { refreshVision } from '../sim/vision';
import type { BakedMap } from '../sim/terrain';
import type { World } from '../sim/types';

export function prototypeFight(map: BakedMap, weapon: 'mg' | 'cannon' | 'shotgun' = 'cannon', scenario: 'normal' | 'narrow' = 'normal'): World {
  let world = newWorld(1337, { ...START_KITS.combat, parts: START_KITS.combat.parts.map(id => id === 'cannon' ? weapon : id) }, map, defaultSetup('roaming'), false);
  world = skipToHour(world, 12);
  world.spawnQueue = [];
  for (const id of Object.keys(world.spawnTimer)) world.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
  world = spawnNear(world, 'buggy', true);
  const enemy = world.vehicles.find(v => v.id !== world.player.vehicleId);
  if (!enemy) throw new Error('Prototype fight has no opponent');
  const replacement = makeVehicle(world, { faction: enemy.faction, chassisId: 'buggy', parts: [{ defId: 'mg', wear: 0 }, { defId: 'stockEngine', wear: 0 }], spares: [], cargo: {}, pos: enemy.pos, heading: enemy.heading, brain: enemy.brain });
  const id = enemy.id;
  Object.assign(enemy, replacement, { id });
  if (scenario === 'narrow') narrowApproach(world, enemy.id, weapon);
  world = setAutoFire(world, true);
  refreshVision(world);
  world.combat = newTimedCombat();
  return world;
}

function narrowApproach(world: World, enemyId: string, weapon: 'mg' | 'cannon' | 'shotgun'): void {
  const player = world.vehicles.find(v => v.id === world.player.vehicleId)!;
  const enemy = world.vehicles.find(v => v.id === enemyId)!;
  const def = PARTS[weapon];
  if (def.kind !== 'weapon') throw new Error('Narrow scenario requires a weapon');
  const angle = bearing(player.pos, enemy.pos);
  const gap = def.range + 1;
  const desired = { x: player.pos.x + Math.cos(angle) * gap, y: player.pos.y + Math.sin(angle) * gap };
  const spot = freeSpotNear(world, desired, vehicleStats(world, enemy).radius, enemy.id);
  if (!spot) throw new Error('No free position for the narrow firing scenario');
  enemy.pos = spot; enemy.speed = 0; enemy.order = null; enemy.brain = null;
  const outside = dist(player.pos, enemy.pos) - def.range;
  if (outside <= 0) throw new Error('Narrow scenario must start outside firing range');
  player.heading = bearing(player.pos, enemy.pos);
  player.speed = outside / 0.8;
  player.setSpeed = player.speed;
  player.direct = true;
  player.order = { kind: 'through', dest: { ...enemy.pos }, pace: player.speed };
}

export function prototypeFightFromSearch(map: BakedMap, search: string): World {
  const params = new URLSearchParams(search);
  return prototypeFight(map, prototypeWeapon(params.get('weapon')), prototypeScenario(params.get('scenario')));
}
function prototypeWeapon(raw: string | null): 'mg' | 'cannon' | 'shotgun' {
  const weapon = raw ?? 'cannon';
  if (weapon !== 'mg' && weapon !== 'cannon' && weapon !== 'shotgun') throw new Error(`Unsupported prototype weapon ${weapon}`);
  return weapon;
}
function prototypeScenario(raw: string | null): 'normal' | 'narrow' {
  const scenario = raw ?? 'normal';
  if (scenario !== 'normal' && scenario !== 'narrow') throw new Error(`Unsupported combat scenario ${scenario}`);
  return scenario;
}
