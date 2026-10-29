import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { GEAR_LEVEL_IDS, GEAR_LEVELS, MIN_NPC_SPEED, NPCS } from '../data/npcs';
import { type EngineDef } from '../data/parts';
import { cloneWorld } from './world';
import { freeCells, mountedParts } from './grid';
import { loadFactor } from './mass';
import { generateNpcLoadout } from './npc-loadout';
import { allegianceFor, spawnAt } from './spawn';
import { gunCapacity, gunDrag, npcMassRoom } from './stats';
import { topSpeedFactor } from './chassis-features';
import { wornDef } from './wear';
import { addGoods } from './inventory';
import { CRATE_MASS } from '../data/goods';
import { budget } from '../test/budget';
import { describeLoadout, fixture, rolled, useLoadoutFixture } from './npc-loadout-kit';

useLoadoutFixture();

describe('NPC speed floor and wear odds', () => {
  it.each(Object.values(NPCS))('keeps $id at MIN_NPC_SPEED on its worn engine at every gear level', (template) => {
    for (const level of GEAR_LEVEL_IDS) {
      for (let seed = 1; seed <= 3; seed++) {
        const v = rolled(template, level, seed);
        const engine = wornDef<EngineDef>(mountedParts(v, 'engine')[0]);
        const speed = (CHASSIS[v.chassisId].maxSpeed + engine.speedBonus) * topSpeedFactor(v.chassisId) * loadFactor(v) * gunDrag(v, gunCapacity(v)!);
        expect(speed, `${level} ${describeLoadout(v)}`).toBeGreaterThanOrEqual(MIN_NPC_SPEED - 1e-9);
      }
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
