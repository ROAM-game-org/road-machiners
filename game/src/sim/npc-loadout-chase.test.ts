import { describe, expect, it } from 'vitest';
import { CHASE_SPEED, NPCS } from '../data/npcs';
import { isLineGun, partDef } from '../data/parts';
import { cloneWorld } from './world';
import { mountedItems } from './grid';
import { generateNpcLoadout } from './npc-loadout';
import { allegianceFor, fallbackFaction, spawnAt } from './spawn';
import { refitAtHome } from './defeat';
import { makeVehicle } from './factory';
import { massRoomAbove, vehicleStats } from './stats';
import { fixture, loadoutOf, useLoadoutFixture } from './npc-loadout-kit';

useLoadoutFixture();

const CHASE_ROLES = ['gunwagon', 'noseArmy', 'bowlFarmer', 'convoyGuard', 'merc'] as const;

describe.each(CHASE_ROLES)('chase role %s', (id) => {
  const template = NPCS[id];

  it('keeps every chassis and level at chase speed with a real gun, its goods and its full haul', () => {
    for (const { value: chassis } of template.loadout.chassis) {
      for (const level of ['standard', 'heavy', 'loaded'] as const) {
        for (let seed = 1; seed <= 6; seed++) {
          const world = { ...fixture, rngState: seed, marketRng: { rngState: seed * 104729 + 1 } };
          const v = makeVehicle(world, { ...loadoutOf(world, template, chassis, level), faction: fallbackFaction(template), brain: null, pos: { x: 50, y: 50 }, heading: 0 });
          const label = `${chassis} ${level} ${seed}`;
          expect(vehicleStats(world, v).maxSpeed, label).toBeGreaterThanOrEqual(CHASE_SPEED - 1e-9);
          expect(massRoomAbove(v, 0, CHASE_SPEED), label).toBeGreaterThanOrEqual(template.loadout.haul.kg);
          expect(mountedItems(v, 'weapon').some((item) => !isLineGun(partDef(item.part.defId))), label).toBe(true);
        }
      }
    }
  });

  it('refits a lying-up truck back to chase speed', () => {
    const world = cloneWorld(fixture);
    const roll = generateNpcLoadout(world, template, template.loadout.chassis[0].value, 'standard');
    const truck = spawnAt(world, template, { ...roll, cargo: {} }, { x: 50, y: 50 }, allegianceFor(world, template, null, null));
    for (let i = 0; i < 4; i++) {
      refitAtHome(world, truck);
      expect(vehicleStats(world, truck).maxSpeed, `refit ${i}`).toBeGreaterThanOrEqual(CHASE_SPEED - 1e-9);
    }
  });
});
