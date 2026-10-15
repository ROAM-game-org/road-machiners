import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withLockSync } from './lock';

export type Step = 'typecheck' | 'suite' | 'playtest' | 'build';
export const FULL_STEPS: Step[] = ['typecheck', 'suite', 'playtest', 'build'];

export type Evidence = { tree: string; commit: string; toolchain: string; ran: Step[]; reused: string[]; by: string; issue: number | null; at: string };

const KEEP_DAYS = 30;
const LOCK_MS = 60_000;
const DOCKERFILE = fileURLToPath(new URL('../docker/Dockerfile', import.meta.url));

export function toolchainKey(checkScript: string, dockerfile = DOCKERFILE): string {
  return createHash('sha256').update(readFileSync(dockerfile)).update('\0').update(checkScript).digest('hex').slice(0, 16);
}

function storePath(home: string): string {
  return join(home, 'check-evidence.json');
}

function keyOf(tree: string, toolchain: string): string {
  return `${tree}:${toolchain}`;
}

function readStore(home: string): Record<string, Evidence> {
  const path = storePath(home);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, Evidence>;
  } catch (error) {
    throw new Error(`${path} is not valid JSON, so no check evidence can be reused: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function evidenceFor(home: string, tree: string, toolchain: string): Evidence | null {
  return readStore(home)[keyOf(tree, toolchain)] ?? null;
}

export function recordEvidence(home: string, entry: Evidence, now: Date): void {
  withLockSync(join(home, 'locks', 'check-evidence'), LOCK_MS, () => {
    const oldest = now.getTime() - KEEP_DAYS * 24 * 60 * 60_000;
    const kept = Object.entries(readStore(home)).filter(([, item]) => Date.parse(item.at) >= oldest);
    const store = Object.fromEntries([...kept, [keyOf(entry.tree, entry.toolchain), entry]]);
    const path = storePath(home);
    writeFileSync(`${path}.tmp`, `${JSON.stringify(store, null, 2)}\n`);
    renameSync(`${path}.tmp`, path);
  });
}

export function suiteCounts(log: string): { ran: number; skipped: number } | null {
  if (!existsSync(log)) return null;
  const last = [...readFileSync(log, 'utf8').matchAll(/\[test-cache\] ran (\d+), skipped (\d+)/g)].at(-1);
  return last ? { ran: Number(last[1]), skipped: Number(last[2]) } : null;
}
