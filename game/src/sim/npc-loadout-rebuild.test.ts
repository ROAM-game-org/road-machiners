import { describe, expect, it } from 'vitest';
import { NPCS, type GearLevel } from '../data/npcs';
import { waveGear } from './chaos-highway';
import { makeVehicle } from './factory';
import { isMounted } from './grid';
import { generateNpcLoadout, openGear, type GearRules, type NpcLoadout } from './npc-loadout';
import { fallbackFaction } from './spawn';
import { emptyWorld, npcBrain } from './testkit';
import type { Vehicle } from './types';

const SEEDS = [1, 2, 3, 4];
const LEVELS: GearLevel[] = ['standard', 'heavy', 'loaded'];
const WAVES = [
  { stretch: 1, money: 300, elite: false },
  { stretch: 4, money: 900, elite: false },
  { stretch: 8, money: 1500, elite: true },
  { stretch: 8, money: 3000, elite: false },
];
const base = emptyWorld();
const cases = Object.values(NPCS).flatMap((template) => (template.loadout.spares ? template.loadout.chassis.map(({ value }) => ({ template, chassisId: value })) : []));

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

describe('NPC loadout rebuild', () => {
  it.each(cases)('stows the spares of every rolled $template.id loadout on a $chassisId where the roll stowed them, with or without its cargo', ({ template, chassisId }) => {
    const rules = [openGear(template.loadout), ...WAVES.map((w) => waveGear(template.id, w.stretch, w.money, w.elite))];
    const thrown: string[] = [];
    const moved: string[] = [];
    for (const level of LEVELS) {
      for (const rule of rules) {
        for (const seed of SEEDS) {
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
  });
});
