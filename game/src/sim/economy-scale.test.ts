import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { PARTS } from '../data/parts';
import { chargeM, payoutM } from './money';
import { contractReward, estimateTurns, goodValue, partPristineBuyPrice, siteOf } from './market';
import { wearFactor } from './wear';
import { ECONOMY } from '../data/goods';
import { RULES } from '../data/rules';
import { START_KITS } from '../data/start';
import { readQuestSources } from '../test/quest-compile';
import { playerVehicle } from './damage';
import { mountedParts } from './grid';
import { cargoSaleValue, partRepairCost, supplyCharge } from './economy';
import { emptyWorld } from './testkit';
import { setStartHp } from './wear';

const MID_HAUL_CRATES = 7;

function midHaulPay(): number {
  const turns = estimateTurns(siteOf('bowl').pos, siteOf('granary').pos);
  return contractReward(turns, MID_HAUL_CRATES * goodValue('grain'), false, MID_HAUL_CRATES);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

describe('the gear to haul ratio', () => {
  it('prices the median new tier 3 gun at 4 to 8 reference mid hauls', () => {
    const guns = Object.values(PARTS).filter((d) => d.kind === 'weapon' && d.tier === 3);
    const hauls = median(guns.map((d) => partPristineBuyPrice(d.id))) / midHaulPay();
    expect(hauls).toBeGreaterThanOrEqual(4);
    expect(hauls).toBeLessThanOrEqual(8);
  });

  it('prices a new tier 2 chassis, minus a wear 2 scout trade-in, at 12 or more reference mid hauls', () => {
    const tradeIn = payoutM(CHASSIS.scout.value * (1 - ECONOMY.spread) * wearFactor(2));
    for (const def of Object.values(CHASSIS).filter((c) => c.tier === 2)) {
      expect((chargeM(def.value) - tradeIn) / midHaulPay(), def.id).toBeGreaterThanOrEqual(12);
    }
  });
});

describe('the purse at the first Bowl garage', () => {
  const arrival = START_KITS.arrival;

  function essentials() {
    const w = emptyWorld();
    const truck = playerVehicle(w);
    const repair = Object.entries(arrival.opening!.condition).reduce((sum, [defId, share]) => {
      const part = mountedParts(truck).find((p) => p.defId === defId)!;
      setStartHp(part, share);
      return sum + partRepairCost(w, part);
    }, 0);
    const tank = Math.ceil((CHASSIS.scout.fuelCap - arrival.fuel) * ECONOMY.supplyPrice.fuel);
    const supplies = supplyCharge('supplies', RULES.baseSupplies - arrival.supplies);
    const cheapestGun = Math.min(...Object.values(PARTS).filter((d) => d.kind === 'weapon' && d.tier === 1).map((d) => partPristineBuyPrice(d.id)));
    const kitCargo = cargoSaleValue(w, truck, 'bowl');
    return { repair, tank, supplies, cheapestGun, kitCargo };
  }

  function farmhouseFinds(): number {
    const source = readQuestSources('src/data/quests')['intro_arrival.ink'];
    return [...source.matchAll(/give_money\((\d+)\)/g)].reduce((sum, m) => sum + Number(m[1]), 0);
  }

  it('lets the kit money alone pay the tank fill and the opening repair', () => {
    const e = essentials();
    expect(arrival.money).toBeGreaterThanOrEqual(e.tank + e.repair);
  });

  it('keeps the whole purse under the essentials plus the cheapest new tier 1 gun', () => {
    const e = essentials();
    const purse = arrival.money + farmhouseFinds() + e.kitCargo;
    expect(purse).toBeLessThan(e.tank + e.supplies + e.repair + e.cheapestGun);
  });

  it('keeps the whole purse under the cheapest tier 3 gun at the worst garage wear', () => {
    const e = essentials();
    const purse = arrival.money + farmhouseFinds() + e.kitCargo;
    const cheapestTier3 = Math.min(...Object.values(PARTS).filter((d) => d.kind === 'weapon' && d.tier === 3).map((d) => partPristineBuyPrice(d.id) * wearFactor(3)));
    expect(purse).toBeLessThan(cheapestTier3);
  });

  it('gives the standard kit the arrival kit money', () => {
    expect(START_KITS.standard.money).toBe(arrival.money);
  });
});
