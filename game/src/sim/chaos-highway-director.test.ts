import { describe, expect, it } from 'vitest';
import { CHAOS_HIGHWAY, HAZARDS } from '../data/modes';
import { cardsOf, directStretch, eliteCap, expectedGear, payOf, planWaves, stretchBudget } from './chaos-highway-director';
import { NPCS } from '../data/npcs';
import { isShield, PARTS } from '../data/parts';
import { HAULER_KIT, startKit } from '../data/start';
import { waveGear, waveOf } from './chaos-highway';
import { milestoneAt } from './highway';
import { generateNpcLoadout } from './npc-loadout';
import { chaosHighwayWorld } from './testkit';
import type { World } from './types';

const DIRECTOR = CHAOS_HIGHWAY.director;
const KIT = startKit('chaosHighway');
const START_GEAR = KIT.money + [...KIT.parts, ...(KIT.placed ?? []).map((p) => p.defId), ...HAULER_KIT.parts].reduce((sum, id) => sum + PARTS[id].value, 0);
const STRETCHES = Array.from({ length: 30 }, (_, i) => i + 1);
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const GROWTHS = [0, 0.25, 1, 2];

const worlds = new Map<number, World>();

function seedWorld(seed = 3): World {
  let w = worlds.get(seed);
  if (!w) {
    w = chaosHighwayWorld(seed);
    worlds.set(seed, w);
  }
  return w;
}

function withGrowth(growth: number): World {
  const w = seedWorld();
  return { ...w, setup: { ...w.setup, settings: { ...w.setup.settings, enemyGearGrowth: growth } } };
}

describe('Chaos Highway director', () => {
  it('measures the player gear from the start kit, its money and the pay of every stretch before', () => {
    expect(expectedGear(1)).toBe(START_GEAR);
    expect(expectedGear(3)).toBe(START_GEAR + DIRECTOR.gearShare * (payOf(1) + payOf(2)));
    expect(() => expectedGear(0)).toThrow(/not a stretch/);
  });

  it('grows the gear money of a truck by the growth setting and the truck budget by the stretch alone', () => {
    const flat = withGrowth(0);
    expect(stretchBudget(flat, 20).base).toBe(stretchBudget(flat, 1).base);
    expect(stretchBudget(withGrowth(2), 5).base).toBeGreaterThan(stretchBudget(withGrowth(1), 5).base);
    expect(stretchBudget(withGrowth(2), 5).budget).toBe(stretchBudget(flat, 5).budget);
    expect(stretchBudget(flat, 1).budget).toBe(DIRECTOR.budget.first);
  });

  it('spends no more trucks than the budget, with elite trucks costing more and none before the elite stretch', () => {
    for (const growth of GROWTHS) {
      const w = withGrowth(growth);
      for (const j of STRETCHES) {
        const { budget, base } = stretchBudget(w, j);
        for (const seed of SEEDS) {
          const waves = planWaves(seed, j, budget, base);
          const cost = waves.reduce((sum, wave) => sum + wave.size * (wave.elite ? DIRECTOR.elite.cost : 1), 0);
          expect(cost, `growth ${growth} stretch ${j} seed ${seed}`).toBeLessThanOrEqual(budget);
          expect(waves.length).toBeGreaterThan(0);
          for (const wave of waves) {
            expect(wave.size).toBeGreaterThanOrEqual(DIRECTOR.wave.min);
            expect(wave.size).toBeLessThanOrEqual(DIRECTOR.wave.cap);
            expect(wave.elite && j < DIRECTOR.elite.from).toBe(false);
            const plain = Math.max(CHAOS_HIGHWAY.cards[wave.template].floor, base);
            expect(wave.money).toBe(wave.elite ? plain * DIRECTOR.elite.money : plain);
          }
        }
      }
    }
  });

  it('makes no more elite waves than the cap of the stretch, and never a blocker elite', () => {
    expect(eliteCap(DIRECTOR.elite.from - 1)).toBe(0);
    expect(eliteCap(DIRECTOR.elite.from)).toBe(1);
    expect(eliteCap(DIRECTOR.elite.from + DIRECTOR.elite.every)).toBe(2);
    for (const seed of SEEDS) {
      const world = seedWorld(seed);
      for (const j of STRETCHES) {
        const waves = directStretch(world, j);
        expect(waves.filter((w) => w.elite).length, `stretch ${j} seed ${seed}`).toBeLessThanOrEqual(eliteCap(j));
        expect(waves.some((w) => w.elite && !CHAOS_HIGHWAY.cards[w.template].chase)).toBe(false);
      }
    }
  });

  it('places the waves in order inside the stretch, clear of both outposts and at least one spacing apart on average', () => {
    for (const j of [1, 4, 12]) {
      for (const seed of SEEDS) {
        const waves = directStretch(seedWorld(seed), j);
        const from = milestoneAt(seed, j - 1) + HAZARDS.clearAfterOutpost;
        const to = milestoneAt(seed, j) - HAZARDS.clearBeforeOutpost;
        expect(waves.length).toBeLessThanOrEqual(Math.floor((to - from) / DIRECTOR.spacing));
        waves.forEach((wave, i) => {
          expect(wave.at).toBeGreaterThan(from);
          expect(wave.at).toBeLessThan(to);
          if (i > 0) expect(wave.at).toBeGreaterThan(waves[i - 1].at);
        });
      }
    }
  });

  it('plans the same waves for the same seed and draws only the cards open at the stretch', () => {
    expect(directStretch(seedWorld(7), 5)).toEqual(directStretch(seedWorld(7), 5));
    for (const j of [1, 2, 6]) {
      const open = new Set(cardsOf(j).map(([id]) => id));
      for (const seed of SEEDS) for (const wave of directStretch(seedWorld(seed), j)) expect(open.has(wave.template), `${wave.template} at stretch ${j}`).toBe(true);
    }
  });

  it('opens with small plain waves that grow into more and larger waves with elites', () => {
    const trucks = (j: number) => SEEDS.map((seed) => directStretch(seedWorld(seed), j).reduce((sum, wave) => sum + wave.size, 0));
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const first = SEEDS.flatMap((seed) => directStretch(seedWorld(seed), 1));
    expect(first.every((wave) => !wave.elite && wave.size <= Math.ceil(DIRECTOR.wave.size.first))).toBe(true);
    expect(mean(trucks(3))).toBeGreaterThan(mean(trucks(1)));
    expect(mean(trucks(10))).toBeGreaterThan(mean(trucks(3)));
    expect(SEEDS.some((seed) => directStretch(seedWorld(seed), DIRECTOR.elite.from).some((wave) => wave.elite))).toBe(true);
  });

  it('arms every card with a gun at the plain and the elite gear money of its first stretch', () => {
    const w = withGrowth(1);
    for (const [template, card] of Object.entries(CHAOS_HIGHWAY.cards)) {
      const j = card.from;
      const plain = Math.max(card.floor, stretchBudget(w, j).base);
      for (const elite of j >= DIRECTOR.elite.from ? [false, true] : [false]) {
        const gear = waveGear(template, j, elite ? plain * DIRECTOR.elite.money : plain, elite);
        for (let seed = 1; seed <= 20; seed++) {
          const loadout = generateNpcLoadout({ ...w, rngState: seed }, NPCS[template], null, waveOf(j).level, gear);
          expect(loadout.parts.some((p) => PARTS[p.defId].kind === 'weapon'), `${template} seed ${seed} elite ${elite}`).toBe(true);
        }
      }
    }
  });

  it('gives elite trucks armor before more guns', () => {
    const w = withGrowth(1);
    const j = DIRECTOR.elite.from;
    const money = Math.max(CHAOS_HIGHWAY.cards.merc.floor, stretchBudget(w, j).base) * DIRECTOR.elite.money;
    const platesOf = (armorFirst: boolean) => SEEDS.map((seed) => {
      const loadout = generateNpcLoadout({ ...w, rngState: seed }, NPCS.merc, null, waveOf(j).level, { ...waveGear('merc', j, money, true), armorFirst });
      return loadout.parts.filter((p) => isShield(PARTS[p.defId])).length;
    });
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    expect(sum(platesOf(true))).toBeGreaterThan(sum(platesOf(false)));
    expect(platesOf(true).filter((n) => n > 0).length).toBeGreaterThan(0.5 * SEEDS.length);
  });

  it('pays more every stretch with no cap, and a beaten truck pays nothing', () => {
    const { base } = CHAOS_HIGHWAY.pay;

    expect(payOf(1)).toBe(base.first);
    expect(payOf(2)).toBe(base.first + base.step);
    expect(payOf(100)).toBe(base.first + 99 * base.step);
    expect(CHAOS_HIGHWAY.pay).not.toHaveProperty('perWreck');
  });
});
