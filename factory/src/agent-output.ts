import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
import { OUT_DIR } from './types';

export function agentOutputPath(home: string, name: string): string | null {
  const path = join(home, OUT_DIR, name);
  if (!existsSync(path)) return null;
  if (!realpathSync(path).startsWith(realpathSync(home) + sep)) throw new Error(`${OUT_DIR}/${name} points outside the work clone, so the factory will not read it.`);
  return path;
}

export function readAgentOutput(home: string, name: string): string | null {
  const path = agentOutputPath(home, name);
  return path === null ? null : readFileSync(path, 'utf8');
}
