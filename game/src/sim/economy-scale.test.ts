import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { PARTS } from '../data/parts';
import { chargeM, payoutM } from './money';
import { contractReward, estimateTurns, goodValue, partPristineBuyPrice, siteOf } from './market';
import { wearFactor } from './wear';
import { ECONOMY } from '../data/goods';

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
