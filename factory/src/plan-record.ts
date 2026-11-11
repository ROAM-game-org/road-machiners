import { existsSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { sep } from 'node:path';
import { PLAN_FILE } from './types';

export type PlanRecord = { change: string | null; howToTry: string | null };

const text = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

export function savePlanRecord(home: string, issue: number, change: string | null, howToTry: string | null): void {
  const path = `${home}/${PLAN_FILE(issue)}`;
  const record: PlanRecord = { change: text(change), howToTry: text(howToTry) };
  if (record.change === null && record.howToTry === null) {
    rmSync(path, { force: true });
    return;
  }
  const temp = `${path}.tmp`;
  writeFileSync(temp, JSON.stringify(record));
  renameSync(temp, path);
}

export function planRecordExists(home: string, issue: number): boolean {
  return existsSync(`${home}/${PLAN_FILE(issue)}`);
}

export function readPlanRecord(home: string, issue: number): PlanRecord | null {
  const file = PLAN_FILE(issue);
  const path = `${home}/${file}`;
  if (!existsSync(path)) return null;
  if (!realpathSync(path).startsWith(realpathSync(home) + sep)) throw new Error(`${file} points outside the work clone, so the factory will not read it.`);
  const { change, howToTry } = (JSON.parse(readFileSync(path, 'utf8')) ?? {}) as Record<string, unknown>;
  const valid = (value: unknown): value is string | null => value === null || typeof value === 'string';
  if (!valid(change) || !valid(howToTry)) throw new Error(`${file} needs fields change and howToTry, each a string or null`);
  return { change, howToTry };
}
