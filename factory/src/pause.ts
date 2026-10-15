import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

export const pauseFile = (home: string): string => `${home}/paused`;

export class UsageLimitError extends Error {}

export type PauseKind = 'usage-limit' | 'factory' | 'member';
export type PauseRecord = { kind: PauseKind; note: string; by: string; at: string; pid?: number; resetsAt?: string };

const KINDS: readonly string[] = ['usage-limit', 'factory', 'member'];

const isText = (value: unknown): boolean => typeof value === 'string' && value !== '';
const isProcessId = (value: unknown): boolean => Number.isInteger(value) && (value as number) > 0;
const isTime = (value: unknown): boolean => isText(value) && !Number.isNaN(Date.parse(value as string));

function requireField(record: Record<string, unknown>, field: string, valid: (value: unknown) => boolean, optional: boolean): void {
  if (optional && record[field] === undefined) return;
  if (!valid(record[field])) throw new Error(`The pause file has no valid ${field}: ${JSON.stringify(record[field])}.`);
}

export function parsePause(text: string): PauseRecord {
  const value: unknown = JSON.parse(text);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('The pause file is not a record.');
  const record = value as Record<string, unknown>;
  requireField(record, 'kind', (kind) => KINDS.includes(kind as string), false);
  for (const field of ['note', 'by', 'at']) requireField(record, field, isText, false);
  requireField(record, 'pid', isProcessId, true);
  requireField(record, 'resetsAt', isTime, true);
  return record as PauseRecord;
}

export function readPause(home: string): PauseRecord | null {
  const path = pauseFile(home);
  if (!existsSync(path)) return null;
  return parsePause(readFileSync(path, 'utf8'));
}

export function writePause(home: string, record: PauseRecord, flag: 'w' | 'wx' = 'w'): void {
  writeFileSync(pauseFile(home), `${JSON.stringify(record)}\n`, { flag });
}

export function pauseForUsageLimit(home: string, message: string, now: Date): void {
  try { writePause(home, { kind: 'usage-limit', note: message, by: 'factory', at: now.toISOString() }, 'wx'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    if ((error as NodeJS.ErrnoException).code === 'EPERM') return true;
    throw error;
  }
}

export function liftEndedPause(home: string, alive: (pid: number) => boolean = pidAlive): PauseRecord | null {
  const record = readPause(home);
  if (record === null || record.pid === undefined || alive(record.pid)) return null;
  rmSync(pauseFile(home));
  return record;
}
