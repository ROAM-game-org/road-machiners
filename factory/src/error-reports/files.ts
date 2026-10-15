import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { Rejected } from './report';

export const MB = 1024 * 1024;

export const errorsHome = (home: string): string => join(home, 'error-reports');
export const reportsDir = (home: string): string => join(errorsHome(home), 'reports');
export const playerReportsDir = (home: string): string => join(errorsHome(home), 'player-reports');
export const alertPath = (home: string): string => join(errorsHome(home), 'alert');

export const dayOf = (now: Date): string => now.toISOString().slice(0, 10);

export function raiseAlert(home: string, line: string): void {
  const path = alertPath(home);
  if (existsSync(path) && readFileSync(path, 'utf8').split('\n').includes(line)) return;
  mkdirSync(errorsHome(home), { recursive: true });
  appendFileSync(path, `${line}\n`);
}

function sizeOf(dir: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir, { recursive: true, encoding: 'utf8' }).reduce((sum, file) => sum + statSync(join(dir, file)).size, 0);
}

export function checkRoom(home: string, diskMb: number, bytes: number, now: Date): void {
  if (sizeOf(reportsDir(home)) + sizeOf(playerReportsDir(home)) + bytes <= diskMb * MB) return;
  raiseAlert(home, `error reports: the store is full at FACTORY_ERROR_DISK_MB=${diskMb} on ${dayOf(now)}`);
  throw new Rejected('disk', 507, 'The error store is full.');
}

export function writeReport(path: string, body: Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

export function unzip(body: Buffer, maxMb: number): unknown {
  let text: string;
  try {
    text = gunzipSync(body, { maxOutputLength: maxMb * MB }).toString('utf8');
  } catch (error) {
    if (error instanceof RangeError) throw new Rejected('size', 413, `The report unzips past FACTORY_ERROR_UNZIPPED_MB=${maxMb}.`);
    throw new Rejected('shape', 400, 'The report is not gzip.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Rejected('shape', 400, 'The report is not JSON.');
  }
}
