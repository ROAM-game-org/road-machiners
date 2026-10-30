import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, statfsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const healthFile = (home: string): string => `${home}/health`;

export function requireCodexLogin(home: string): string {
  const dir = join(home, 'codex');
  if (!existsSync(join(dir, 'auth.json'))) throw new Error(`${dir}/auth.json is missing. Sign Codex in to ChatGPT as the factory README says.`);
  return dir;
}

export function requireAgyLogin(home: string): string {
  const file = join(home, 'agy', 'antigravity-oauth-token');
  if (!existsSync(file)) throw new Error(`${file} is missing. Copy the agy Google login to the server as the factory README says.`);
  return file;
}

export function systemdMemoryMax(slice: string): string {
  return execFileSync('systemctl', ['show', slice, '--property', 'MemoryMax', '--value'], { encoding: 'utf8', timeout: 10_000 }).trim();
}

export function requireCappedSlice(slice: string | null, memoryMax: (slice: string) => string = systemdMemoryMax): void {
  if (slice === null) return;
  const max = memoryMax(slice);
  if (!/^\d+$/.test(max)) throw new Error(`${slice} has MemoryMax "${max}", so job containers have no memory cap. Run infra/deploy/deploy.py, which installs the slice with FACTORY_JOBS_MEMORY_GB.`);
}

export type Health ={ at: string; freeGb: number; minFreeGb: number; availableGb: number | null; minAvailableGb: number };

export function freeGb(path: string): number {
  const stats = statfsSync(path);
  return Math.round((stats.bavail * stats.bsize) / 1e8) / 10;
}

export function availableGb(platform: string = process.platform, meminfo: string = '/proc/meminfo'): number | null {
  if (platform !== 'linux') return null;
  const kb = memAvailableKb(readFileSync(meminfo, 'utf8'), meminfo);
  return Math.round(kb / 1e5) / 10;
}

function memAvailableKb(text: string, source: string): number {
  const line = text.split('\n').find((row) => row.startsWith('MemAvailable:'));
  if (line === undefined) throw new Error(`${source} has no MemAvailable line.`);
  const kb = Number(line.replace(/\D+/g, ''));
  if (!Number.isInteger(kb) || kb <= 0) throw new Error(`${source} has a bad MemAvailable line "${line}".`);
  return kb;
}

export function writeHealth(home: string, minFreeGb: number, minAvailableGb: number, now: Date): Health {
  const health: Health = { at: now.toISOString(), freeGb: freeGb(home), minFreeGb, availableGb: availableGb(), minAvailableGb };
  const path = healthFile(home);
  writeFileSync(`${path}.new`, `${JSON.stringify(health)}\n`);
  renameSync(`${path}.new`, path);
  return health;
}
