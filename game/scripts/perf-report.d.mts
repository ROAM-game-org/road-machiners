export const LOAD_SHARE_MAX: number;
export const SPREAD_MAX: number;

export type Budget = {
  frameP99Ms: number;
  over33Per1000: number;
  over100Max: number;
  chunkOver100Max: number;
  turnWaitMs: number;
  previewMs: number;
  bootMs: number;
  viewport: { width: number; height: number; scale: number };
};
export type BudgetFile = { default: Budget; machines: Record<string, Partial<Budget>> };
export type BudgetLine = {
  scene: string;
  label: string;
  limit: number;
  unit: string;
  value: number | null;
  pass: boolean;
  missing: boolean;
  miss: number | null;
  severity: number | null;
};
export type FixEntry = { scene: string; severity: number; text: string };
export type Wrapped = { bench: unknown; run: unknown };

export function budgetsFor(budgets: { default: Partial<Budget>; machines: Record<string, Partial<Budget>> }, machine: string): Budget;
export function fmt(value: number | null, digits?: number): string;
export function checkBudgets(report: unknown, budget: Budget): BudgetLine[];
export function trustProblems(wrapped: Wrapped): string[];
export function notes(wrapped: Wrapped): string[];
export function bundleProblems(manifest: Record<string, { imports?: string[] }>): string[];
export function fixNext(report: unknown, lines: BudgetLine[]): FixEntry[];
export function summary(wrapped: Wrapped, lines: BudgetLine[]): string;
export function compare(a: Wrapped, b: Wrapped): string;
