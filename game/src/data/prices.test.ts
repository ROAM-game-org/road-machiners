import { describe, expect, it } from 'vitest';
import { bedRows } from '../sim/chassis-features';
import { CHASSIS, chassisModifier } from './chassis';
import { PARTS, partModifier, type PartDef, type Unpriced } from './parts';
import { TIME } from './time';
import { TOW } from './tow';
import { ECONOMY, GOODS } from './goods';
import { START_KITS } from './start';
import { GEAR_LEVELS } from './npcs';
import { itemValue, UNITS } from './units';
import { XP_SOURCES } from './skills';
import { CONTRACTS, EFFORT } from './market';

function bumped(def: Unpriced<PartDef>, field: string): Unpriced<PartDef> {
  const copy = structuredClone(def) as Record<string, unknown>;
  if (field === 'damage') (copy.round as { damage: number }).damage += 1;
  else if (field === 'turns' || field === 'reach') bumpUtility(copy, field);
  else copy[field] = (copy[field] as number) + 1;
  return copy as Unpriced<PartDef>;
}

function bumpUtility(copy: Record<string, unknown>, field: 'turns' | 'reach'): void {
  const effect = copy.effect as Record<string, number>;
  const shot = copy.shot as { range: number } | undefined;
  if (field === 'turns') effect.turns += 1;
  else if (shot) shot.range += 1;
  else if ('maxRange' in effect) effect.maxRange += 1;
  else effect.radius += 1;
}

function pricedStats(def: PartDef): string[] {
  if (def.kind === 'utility' && def.reload === null) return [];
  if (def.kind === 'utility' && def.effect.type === 'oil') return ['turns'];
  return PRICED_STATS[def.kind];
}

const PRICED_STATS: Record<PartDef['kind'], string[]> = {
  weapon: ['damage', 'range'],
  engine: ['speedBonus', 'accelBonus'],
  armor: ['armor', 'blastArmor'],
  accessory: ['armor', 'blastArmor'],
  cargo: ['extraRows'],
  store: ['amount'],
  scanner: ['range'],
  utility: ['turns', 'reach'],
  core: ['hp'],
};

describe('item prices', () => {
  it('prices every part at its base plus its stat modifier', () => {
    for (const def of Object.values(PARTS)) expect(def.value, def.id).toBe(itemValue(def.base + partModifier(def)));
    for (const def of Object.values(CHASSIS)) expect(def.value, def.id).toBe(itemValue(def.base + chassisModifier(def)));
  });

  it('raises the value when a priced stat grows', () => {
    for (const def of Object.values(PARTS)) {
      for (const field of pricedStats(def)) {
        expect(partModifier(bumped(def, field)), `${def.id} ${field}`).toBeGreaterThan(partModifier(def));
      }
    }
  });

  it('charges more for heavier grades of a core part', () => {
    expect(PARTS.wheel.value).toBeLessThan(PARTS.wheelMid.value);
    expect(PARTS.wheelMid.value).toBeLessThan(PARTS.wheelHeavy.value);
    expect(PARTS.transmission.value).toBeLessThan(PARTS.transmissionMid.value);
    expect(PARTS.transmissionMid.value).toBeLessThan(PARTS.transmissionHeavy.value);
    expect(PARTS.tankMid.value).toBeLessThan(PARTS.tankHeavy.value);
  });

  const FINER_GRID = ['buggy', 'courier', 'jeep', 'wagon'];
  const KEPT_PRICE = ['carrier'];

  it('never prices a chassis with more deck cells below one of the same tier and bed rows with fewer', () => {
    const deck = (id: string) => [...CHASSIS[id].layout.join('')].filter((c) => c === 'D').length;
    for (const a of Object.values(CHASSIS).filter((c) => !FINER_GRID.includes(c.id) && !KEPT_PRICE.includes(c.id))) {
      for (const b of Object.values(CHASSIS).filter((c) => !FINER_GRID.includes(c.id) && !KEPT_PRICE.includes(c.id))) {
        if (a.tier === b.tier && bedRows(a.id) === bedRows(b.id) && deck(a.id) > deck(b.id)) expect(a.value, `${a.id} over ${b.id}`).toBeGreaterThan(b.value);
      }
    }
  });
});

describe('tow fees', () => {
  it('price the tower time at the tier-1 wage', () => {
    const turn = EFFORT.wage[1] * TOW.wages;
    expect(TOW.base).toBeCloseTo(TOW.approachTurns * turn);
    expect(TOW.perTile).toBeCloseTo(TOW.turnsPerTile * turn);
    expect(TOW.maxFee).toBeCloseTo(TOW.capTurns * turn);
  });

  it('never cost more than a day of tier-1 earnings', () => {
    expect(TOW.maxFee).toBeLessThanOrEqual(EFFORT.wage[1] * TIME.turnsPerDay);
  });
});

describe('money in whole M', () => {
  it('sells 5 L of fuel for exactly 1 M at a town', () => {
    expect(UNITS.fuelLiters).toBe(5);
    expect(ECONOMY.supplyPrice.fuel).toBe(1);
  });

  it('keeps every start and gear purse a whole number of M', () => {
    const amounts: [string, number][] = [
      ...Object.entries(START_KITS).map(([id, kit]): [string, number] => [`${id} money`, kit.money]),
      ...Object.entries(GEAR_LEVELS).map(([id, g]): [string, number] => [`${id} gear money`, g.money]),
    ];
    for (const [id, amount] of amounts) expect(Number.isInteger(amount), id).toBe(true);
  });

  it('keeps every item value to a hundredth of an M', () => {
    const values: [string, number][] = [
      ...Object.values(PARTS).map((d): [string, number] => [d.id, d.value]),
      ...Object.values(CHASSIS).map((d): [string, number] => [d.id, d.value]),
      ...Object.values(GOODS).map((d): [string, number] => [d.id, d.value]),
    ];
    for (const [id, value] of values) expect(Math.abs(value * 100 - Math.round(value * 100)), id).toBeLessThan(1e-6);
  });
});

describe('XP per M', () => {
  const PER_M = 3;

  it('pays profit, free tow and aid XP at 0.8 of the base rate', () => {
    for (const source of ['profit', 'freeTow', 'aid'] as const) expect(XP_SOURCES[source].weight, source).toBeCloseTo(0.8 * PER_M, 10);
  });

  it('pays contract XP at 0.1 of the base rate', () => {
    expect(CONTRACTS.haul.xpPerEffort).toBeCloseTo(0.1 * PER_M, 10);
  });
});
