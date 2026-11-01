import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { createHash } from 'node:crypto';
import { GEAR_LEVEL_IDS, GEAR_LEVELS, MIN_NPC_SPEED, NPCS, RAIDER_CHASE_SPEED } from '../data/npcs';
import { PHYSICS } from '../data/physics';
import { TERRAIN } from '../data/terrain';
import { type EngineDef } from '../data/parts';
import { cloneWorld } from './world';
import { freeCells, mountedParts } from './grid';
import { loadFactor } from './mass';
import { generateNpcLoadout, openGear } from './npc-loadout';
import { allegianceFor, fallbackFaction, spawnAt } from './spawn';
import { refitAtHome } from './defeat';
import { makeVehicle } from './factory';
import { gunCapacity, gunDrag, massRoomAbove, npcMassRoom, vehicleStats } from './stats';
import { topSpeedFactor } from './chassis-features';
import { wornDef } from './wear';
import { addGoods } from './inventory';
import { CRATE_MASS } from '../data/goods';
import { budget } from '../test/budget';
import { describeLoadout, fixture, loadoutOf, rolled, useLoadoutFixture } from './npc-loadout-kit';
import { mountedItems } from './grid';
import { isLineGun, partDef } from '../data/parts';

useLoadoutFixture();

describe('NPC speed floor and wear odds', () => {
  it.each(Object.values(NPCS))('keeps $id at its table floor on its worn engine with its goods and haul at every gear level', (template) => {
    for (const level of GEAR_LEVEL_IDS) {
      for (let seed = 1; seed <= 3; seed++) {
        const v = rolled(template, level, seed);
        const engine = wornDef<EngineDef>(mountedParts(v, 'engine')[0]);
        const speed = (CHASSIS[v.chassisId].maxSpeed + engine.speedBonus) * topSpeedFactor(v.chassisId) * loadFactor(v) * gunDrag(v, gunCapacity(v)!);
        expect(speed, `${level} ${describeLoadout(v)}`).toBeGreaterThanOrEqual(template.loadout.minSpeed - 1e-9);
      }
    }
  }, budget(120_000));

  it('keeps every gunwagon chassis and level at chase speed with a real gun, its goods and its full haul', () => {
    const template = NPCS.gunwagon;
    for (const { value: chassis } of template.loadout.chassis) {
      for (const level of ['standard', 'heavy', 'loaded'] as const) {
        for (let seed = 1; seed <= 6; seed++) {
          const world = { ...fixture, rngState: seed, marketRng: { rngState: seed * 104729 + 1 } };
          const v = makeVehicle(world, { ...loadoutOf(world, template, chassis, level), faction: fallbackFaction(template), brain: null, pos: { x: 50, y: 50 }, heading: 0 });
          const label = `${chassis} ${level} ${seed}`;
          expect(vehicleStats(world, v).maxSpeed, label).toBeGreaterThanOrEqual(RAIDER_CHASE_SPEED - 1e-9);
          expect(massRoomAbove(v, 0, RAIDER_CHASE_SPEED), label).toBeGreaterThanOrEqual(template.loadout.haul.kg);
          expect(mountedItems(v, 'weapon').some((item) => !isLineGun(partDef(item.part.defId))), label).toBe(true);
        }
      }
    }
  }, budget(300_000));

  it('refits a lying-up gunwagon back to chase speed', () => {
    const world = cloneWorld(fixture);
    const roll = generateNpcLoadout(world, NPCS.gunwagon, 'wagon', 'standard');
    const truck = spawnAt(world, NPCS.gunwagon, { ...roll, cargo: {} }, { x: 50, y: 50 }, allegianceFor(world, NPCS.gunwagon, null, null));
    for (let i = 0; i < 4; i++) {
      refitAtHome(world, truck);
      expect(vehicleStats(world, truck).maxSpeed, `refit ${i}`).toBeGreaterThanOrEqual(RAIDER_CHASE_SPEED - 1e-9);
    }
  });

  it('sets the chase speed so that open ground still tops 50 km/h', () => {
    expect(RAIDER_CHASE_SPEED * TERRAIN.drive.unpavedTopSpeed * PHYSICS.metersPerTile * 3.6).toBeGreaterThanOrEqual(50);
  });

  it('gives every template its own floor and only the gunwagon a higher one', () => {
    for (const template of Object.values(NPCS)) {
      expect(openGear(template.loadout).minSpeed).toBe(template.id === 'gunwagon' ? RAIDER_CHASE_SPEED : MIN_NPC_SPEED);
      expect(openGear(template.loadout).chassisFloor).toBe(MIN_NPC_SPEED);
    }
  });

  it('refuses a table floor below the roaming floor', () => {
    const slow = { ...NPCS.trader, loadout: { ...NPCS.trader.loadout, minSpeed: MIN_NPC_SPEED - 0.1 } };
    expect(() => generateNpcLoadout(cloneWorld(fixture), slow)).toThrow('floor');
  });

  it('rolls every other template as it did before the floor moved to the table', () => {
    const hashes = {"buggy":"3c5dc4fc68b6","trader":"ef4b43e252cf","scavenger":"e1b1f32b8afa","bowlFarmer":"887ff83e8162","noseArmy":"321b9ebd771e","marshal":"94f9c49dcd24","courier":"bd7d63994a24","roamer":"5776c02146ee","vulture":"a5eefa9e7f93","convoy":"2feb26bc945d","convoyGuard":"ecbc2fd1a1e2","merc":"3dd1c19a6f16","cavalcade":"b60e707e489e","hunter":"7938e748019a"};
    for (const [id, hash] of Object.entries(hashes)) {
      const rolls = [1, 2, 3].map((seed) => describeLoadout(rolled(NPCS[id], 'standard', seed)));
      expect(createHash('sha1').update(rolls.join('|')).digest('hex').slice(0, 12), id).toBe(hash);
    }
  }, budget(120_000));

  it('rolls engine wear by the same odds as other parts', () => {
    const wears = Object.values(NPCS).flatMap((template) => Array.from({ length: 8 }, (_, i) => mountedParts(rolled(template, 'standard', i + 1), 'engine')[0].wear));
    const table = GEAR_LEVELS.standard.wear;
    const worn = wears.filter((wear) => wear >= 3).length / wears.length;
    const odds = table.filter((w) => w.value >= 3).reduce((sum, w) => sum + w.weight, 0) / table.reduce((sum, w) => sum + w.weight, 0);
    expect(worn).toBeGreaterThan(odds * 0.8);
  }, budget(120_000));

  it('gives an NPC no cargo past its speed floor, and the player any', () => {
    const world = cloneWorld(fixture);
    const npc = spawnAt(world, NPCS.gunwagon, { ...generateNpcLoadout(world, NPCS.gunwagon, null, 'loaded'), cargo: {}, spares: [] }, { x: 50, y: 50 }, allegianceFor(world, NPCS.gunwagon, null, null));
    const room = npcMassRoom(npc);
    const free = freeCells(npc);
    const added = addGoods(world, npc, 'tools', 1000);
    expect(added).toBe(Math.min(free, Math.floor(room / CRATE_MASS)));
    const player = spawnAt(world, NPCS.gunwagon, { ...generateNpcLoadout(world, NPCS.gunwagon, null, 'loaded'), cargo: {}, spares: [] }, { x: 60, y: 50 }, allegianceFor(world, NPCS.gunwagon, null, null));
    player.brain = null;
    const playerFree = freeCells(player);
    expect(addGoods(world, player, 'tools', 1000)).toBe(playerFree);
  });
});
