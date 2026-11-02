
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
