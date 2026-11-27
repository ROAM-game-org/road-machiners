import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { createHash } from 'node:crypto';
import { GEAR_LEVEL_IDS, GEAR_LEVELS, MIN_NPC_SPEED, NPCS, CHASE_SPEED } from '../data/npcs';
import { PHYSICS } from '../data/physics';
import { TERRAIN } from '../data/terrain';
import { type EngineDef } from '../data/parts';
import { cloneWorld } from './world';
import { freeCells, mountedParts } from './grid';
import { loadFactor } from './mass';
import { generateNpcLoadout, openGear } from './npc-loadout';
import { allegianceFor, spawnAt } from './spawn';
import { gunCapacity, gunDrag, npcMassRoom } from './stats';
import { topSpeedFactor } from './chassis-features';
import { wornDef } from './wear';
import { addGoods } from './inventory';
import { CRATE_MASS } from '../data/goods';
import { budget } from '../test/budget';
import { describeLoadout, fixture, rolled, useLoadoutFixture } from './npc-loadout-kit';

useLoadoutFixture();

const CHASE_ROLES = ['gunwagon', 'noseArmy', 'bowlFarmer', 'convoyGuard', 'merc'] as const;

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

  it('sets the chase speed so that open ground still tops 50 km/h', () => {
    expect(CHASE_SPEED * TERRAIN.drive.unpavedTopSpeed * PHYSICS.metersPerTile * 3.6).toBeGreaterThanOrEqual(50);
  });

  it('gives every template its own floor and the chase roles the chase floor', () => {
    for (const template of Object.values(NPCS)) {
      expect(openGear(template.loadout).minSpeed).toBe((CHASE_ROLES as readonly string[]).includes(template.id) ? CHASE_SPEED : MIN_NPC_SPEED);
      expect(openGear(template.loadout).chassisFloor).toBe(MIN_NPC_SPEED);
    }
  });

  it('refuses a table floor below the roaming floor', () => {
    const slow = { ...NPCS.trader, loadout: { ...NPCS.trader.loadout, minSpeed: MIN_NPC_SPEED - 0.1 } };
    expect(() => generateNpcLoadout(cloneWorld(fixture), slow)).toThrow('floor');
  });

  it('rolls every other template at the rescaled prices as it did before the floor moved to the table', () => {
    const hashes = {"buggy":"90f1382cbcc6","trader":"8636f6ea863f","scavenger":"458f02902704","marshal":"7b7d92ea28f7","courier":"3406fc5ebbd9","roamer":"772c0738a8a2","vulture":"9664f5a62950","convoy":"6c359a482fda","cavalcade":"dd89b40e30b1","hunter":"ecaa123ea195"};
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
