import { beforeAll, expect, it } from 'vitest';
import { CRATE_MASS } from '../data/goods';
import { NPCS } from '../data/npcs';
import { fallbackFaction } from '../sim/spawn';
import { makeVehicle } from '../sim/factory';
import { addGoods, cargoRoom } from '../sim/inventory';
import { generateNpcLoadout } from '../sim/npc-loadout';
import { emptyWorld } from '../sim/testkit';
import type { Vehicle, World } from '../sim/types';
import type { TerrainTypeId } from '../data/terrain';
import { endTurn } from '../sim/world';
import { KPH } from '../test/traffic-speed';
import { budget } from '../test/budget';
import { buildDrive, freeDrive, initPhysics, type Drive } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const OPEN_GROUND: TerrainTypeId = 'hardpan';
const ROAD_Y = 30;
const HEAD_START = 30;
const FAR = { x: 480, y: ROAD_Y };
const OPEN_KPH = 50;
const TURNS = 18;

function openGround(w: World): void {
  const types = w.terrain.types.map(() => OPEN_GROUND) as typeof w.terrain.types;
  w.terrain = Object.freeze({ ...w.terrain, types: Object.freeze(types) as typeof types });
}

function rolledTruck(w: World, templateId: string, chassisId: string, x: number): Vehicle {
  const template = NPCS[templateId];
  const roll = generateNpcLoadout(w, template, chassisId, 'standard');
  const v = makeVehicle(w, { ...roll, faction: fallbackFaction(template), brain: null, pos: { x, y: ROAD_Y }, heading: 0 });
  v.order = { kind: 'through', dest: FAR };
  w.vehicles.push(v);
  return v;
}

it('a rolled gunwagon with its haul reaches 50 km/h on open ground and closes on a laden hauler trader', () => {
  const w = emptyWorld({ x: 70, y: ROAD_Y + 12 });
  openGround(w);
  const raider = rolledTruck(w, 'gunwagon', 'wagon', 20);
  addGoods(w, raider, 'scrap', Math.floor(NPCS.gunwagon.loadout.haul.kg / CRATE_MASS));
  const prey = rolledTruck(w, 'trader', 'hauler', 20 + HEAD_START);
  addGoods(w, prey, 'scrap', cargoRoom(prey));
  let world = w;
  let drive: Drive = buildDrive(world);
  const gaps: number[] = [];
  let fastest = 0;
  for (let turn = 0; turn < TURNS; turn++) {
    let next: Drive | null = null;
    world = endTurn(world, physicsMove(drive, (r) => { next = r.next; }));
    freeDrive(drive);
    drive = next!;
    const me = world.vehicles.find((v) => v.id === raider.id)!;
    const them = world.vehicles.find((v) => v.id === prey.id)!;
    fastest = Math.max(fastest, me.speed * KPH);
    gaps.push(them.pos.x - me.pos.x);
  }
  freeDrive(drive);
  console.info(`gunwagon top ${fastest.toFixed(1)} km/h, gap ${gaps[0].toFixed(1)} -> ${gaps[gaps.length - 1].toFixed(1)}`);
  expect(fastest).toBeGreaterThanOrEqual(OPEN_KPH);
  expect(gaps[gaps.length - 1]).toBeLessThan(HEAD_START);
  expect(gaps[gaps.length - 1]).toBeLessThan(gaps[4]);
}, budget(180_000));
