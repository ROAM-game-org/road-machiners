import type { ProfileReport } from './perf-profile.mjs';

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
export type Wrapped = { bench: unknown; run: unknown; profile?: ProfileReport };

export function budgetsFor(budgets: { default: Partial<Budget>; machines: Record<string, Partial<Budget>> }, machine: string): Budget;
export function fmt(value: number | null, digits?: number): string;
export function checkBudgets(report: unknown, budget: Budget): BudgetLine[];
export function trustProblems(wrapped: Wrapped): string[];
export function notes(wrapped: Wrapped): string[];
export function bundleProblems(manifest: Record<string, { imports?: string[] }>): string[];
export function fixNext(report: unknown, lines: BudgetLine[]): FixEntry[];
export function summary(wrapped: Wrapped, lines: BudgetLine[]): string;
export function compare(a: Wrapped, b: Wrapped): string;

export type GateMeasure = { value: number; noise: number; limit: number; watched?: boolean };
export type Landed = { commit: string; machine: string; renderer: string; reports: number; measures: Record<string, GateMeasure> };
export type LandedFile = { machines: Record<string, Landed> };
export type GateLine = { key: string; value: number; limit: number; watched: boolean; pass: boolean };
export type GateResult = { status: 'pass' | 'slower' | 'untrusted'; problems: string[]; lines: GateLine[] };
export function landedFrom(reports: Wrapped[]): Landed;
export function landInto(file: LandedFile, landed: Landed): LandedFile;
export function gateLines(wrapped: Wrapped, file: LandedFile): GateResult;
export function gateSummary(result: GateResult): string;
