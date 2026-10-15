import { describe, expect, it } from 'vitest';
import { clips, SLOW } from '../../test/gun-clearance-kit';
import { NPCS } from '../../data/npcs';
import { generateNpcLoadout } from '../../sim/npc-loadout';
import { makeVehicle } from '../../sim/factory';
import { emptyWorld } from '../../sim/testkit';
import type { Vehicle } from '../../sim/types';

describe('gun heads clear what they sweep over', () => {
  it('NPC loadouts of every template', () => {
    const problems: string[] = [];
    for (const t of Object.values(NPCS)) {
      for (let seed = 1; seed <= 2; seed++) {
        const world = { ...emptyWorld(), rngState: seed * 7 + 3 };
        let v: Vehicle;
        try {
          const l = generateNpcLoadout(world, t, null, 'loaded');
          v = makeVehicle(world, { ...l, faction: t.faction, brain: null, pos: { x: 50, y: 50 }, heading: 0 });
        } catch {
          continue;
        }
        problems.push(...clips(world, v).map((p) => `${t.id}#${seed} ${p}`));
      }
    }
    expect(problems).toEqual([]);
  }, SLOW);
});
