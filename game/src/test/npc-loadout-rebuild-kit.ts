import { expect } from 'vitest';
import { NPCS, type GearLevel } from '../data/npcs';
import { waveGear } from '../sim/chaos-highway';
import { makeVehicle } from '../sim/factory';
import { isMounted } from '../sim/grid';
import { generateNpcLoadout, openGear, type GearRules, type NpcLoadout } from '../sim/npc-loadout';
import { fallbackFaction } from '../sim/spawn';
import { emptyWorld, npcBrain } from '../sim/testkit';
import type { Vehicle } from '../sim/types';

const LEVELS: GearLevel[] = ['standard', 'heavy', 'loaded'];
const TIER_3_PRICE_FACTOR = 2.25;
const WAVES = [
  { stretch: 1, money: 300 * TIER_3_PRICE_FACTOR },
  { stretch: 4, money: 900 * TIER_3_PRICE_FACTOR },
  { stretch: 8, money: 1500 * TIER_3_PRICE_FACTOR },
  { stretch: 8, money: 3000 * TIER_3_PRICE_FACTOR },
];
const base = emptyWorld();

const looseSpares = (v: Vehicle) => v.items.filter((item) => item.kind === 'part' && !isMounted(v.chassisId, item));
const spareCells = (v: Vehicle) => looseSpares(v).map(({ x, y, rot }) => ({ x, y, rot }));
const rolledCells = (loadout: NpcLoadout) => loadout.spares.map(({ at }) => at);

function build(loadout: NpcLoadout, id: string, cargo: NpcLoadout['cargo']): Vehicle {
  return makeVehicle({ ...base }, { ...loadout, cargo, faction: fallbackFaction(NPCS[id]), brain: npcBrain(id, { x: 50, y: 50 }, []), pos: { x: 50, y: 50 }, heading: 0 });
}

function roll(id: string, chassisId: string, level: GearLevel, seed: number, rules: GearRules): NpcLoadout {
  const world = { ...base, rngState: seed, marketRng: { rngState: seed * 104729 + 1 } };
  return generateNpcLoadout(world, NPCS[id], chassisId, level, rules);
}

export const rebuildCases = Object.values(NPCS).flatMap((template) => (template.loadout.spares ? template.loadout.chassis.map(({ value }) => ({ template, chassisId: value })) : []));

export function expectSparesStay({ template, chassisId }: (typeof rebuildCases)[number], seeds: readonly number[]): void {
  const rules = [openGear(template.loadout), ...WAVES.map((w) => waveGear(template.id, w.stretch, w.money))];
  const thrown: string[] = [];
  const moved: string[] = [];
  for (const level of LEVELS) {
    for (const rule of rules) {
      for (const seed of seeds) {
        const loadout = roll(template.id, chassisId, level, seed, rule);
        const label = `${level} seed ${seed} minSpeed ${rule.minSpeed} money ${rule.money}`;
        for (const cargo of [loadout.cargo, {}]) {
          try {
            const cells = spareCells(build(loadout, template.id, cargo));
            if (JSON.stringify(cells) !== JSON.stringify(rolledCells(loadout))) moved.push(label);
          } catch (error) {
            thrown.push(`${label}: ${(error as Error).message}`);
          }
        }
      }
    }
  }
  expect(thrown).toEqual([]);
  expect(moved).toEqual([]);
}
