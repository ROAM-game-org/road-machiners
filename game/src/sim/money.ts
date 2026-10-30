const TOLERANCE = 1e-9;

function finite(x: number): number {
  if (!Number.isFinite(x)) throw new Error(`Money amount ${x} is not finite`);
  return x;
}

export function chargeM(x: number): number {
  return Math.ceil(finite(x) - TOLERANCE) || 0;
}

export function payoutM(x: number): number {
  return Math.floor(finite(x) + TOLERANCE) || 0;
}

export function fairM(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(finite(x)) + TOLERANCE) || 0;
}

export function requireWholeM(amount: number, what: string): void {
  if (!Number.isInteger(amount)) throw new Error(`${what}: money ${amount} is not a whole number of M`);
}

export function affordableUnits(budget: number, unitPrice: number): number {
  if (!(unitPrice > 0)) throw new Error(`A unit price of ${unitPrice} buys no count`);
  return Math.max(0, Math.floor(finite(budget) / unitPrice + TOLERANCE));
}
