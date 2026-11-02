import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sessionsDir } from './sessions';
import type { AgentSession } from './types';

export const CARD_SESSION_ROUND = 'test';
const ID_FILE = 'card.id';

export const cardSessionsRoot = (home: string): string => join(home, 'card-sessions');

export const cardSessionDir = (home: string, issue: number): string => join(cardSessionsRoot(home), `issue-${issue}`);

export function keepCardSession(home: string, issue: number): string | null {
  const from = sessionsDir(home, issue);
  const idFile = join(from, `${CARD_SESSION_ROUND}.id`);
  if (!existsSync(idFile)) return `no ${CARD_SESSION_ROUND} session id in ${from}`;
  const id = readFileSync(idFile, 'utf8').trim();
  const folders = transcriptFolders(from, id);
  if (folders.length === 0) return `session ${id} has no transcript in ${from}`;
  const to = cardSessionDir(home, issue);
  const temp = `${to}.tmp`;
  rmSync(temp, { recursive: true, force: true });
  for (const folder of folders) {
    cpSync(join(from, folder, `${id}.jsonl`), join(temp, folder, `${id}.jsonl`));
    if (existsSync(join(from, folder, id))) cpSync(join(from, folder, id), join(temp, folder, id), { recursive: true });
  }
  writeFileSync(join(temp, ID_FILE), id);
  rmSync(to, { recursive: true, force: true });
  mkdirSync(cardSessionsRoot(home), { recursive: true });
  renameSync(temp, to);
  return null;
}

export function cardSession(home: string, issue: number): AgentSession | null {
  const dir = cardSessionDir(home, issue);
  const idFile = join(dir, ID_FILE);
  if (!existsSync(idFile)) return null;
  const id = readFileSync(idFile, 'utf8').trim();
  if (id === '') throw new Error(`The card session id file ${idFile} is empty`);
  if (transcriptFolders(dir, id).length === 0) throw new Error(`The kept session ${id} of #${issue} has no transcript in ${dir}`);
  return { dir, id, resume: true };
}

function transcriptFolders(dir: string, id: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, `${id}.jsonl`))).map((entry) => entry.name);
}
