export type TruckOffer = { id: string; value: number; price: number };

export function bestTruck(offers: readonly TruckOffer[], currentValue: number, budget: number): string | null {
  const better = offers.filter((t) => t.value > currentValue && t.price <= budget);
  return [...better].sort((a, b) => b.value - a.value)[0]?.id ?? null;
}

export function keepsPace(maxSpeed: number, haulerTopSpeed: number): boolean {
  return maxSpeed >= haulerTopSpeed;
}
