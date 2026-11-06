import type { Tier } from './market';

export const UNITS = {
  fuelLiters: 5,
  cellDepth: 0.5,
  shadeCelsius: 22,
  celsiusPerHeat: 12,
  engineColdCelsius: 80,
  engineHotCelsius: 120,
  currency: { one: 'M', many: "M's" },
};

export function itemValue(x: number): number {
  return Math.round(x * 100) / 100;
}

export const TIER_VALUE: Record<Tier, number> = { 1: 1, 2: 1.5, 3: 2.25 };

export function gearValue(raw: number, tier: Tier): number {
  return itemValue(raw * TIER_VALUE[tier]);
}
