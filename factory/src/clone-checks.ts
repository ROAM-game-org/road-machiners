import { readAgentOutput } from './agent-output';
import { readShown } from './evidence';

export type Approval = { description: string; howToTry: string };

export function readApproval(home: string): Approval {
  const raw = readAgentOutput(home, 'approval.json');
  if (raw === null) throw new Error('The testing stage wrote no .factory/approval.json');
  return parseApproval(JSON.parse(raw));
}

function parseApproval(data: unknown): Approval {
  const { description, howToTry } = (data ?? {}) as Record<string, unknown>;
  if (typeof description !== 'string' || typeof howToTry !== 'string') throw new Error('.factory/approval.json needs string fields description and howToTry');
  return { description, howToTry };
}

export type CloneRound = 'test';
export const CLONE_ROUNDS: readonly CloneRound[] = ['test'];

export const HOST_ONLY_CHECKS = [
  'the guard on the pushed diff: factory paths and a SAVE_MAJOR bump',
  'the merge of the base branch into the work branch',
  'the build in a fresh clone',
] as const;

export type CloneReport = { failures: string[] };

export function checkClone(home: string): CloneReport {
  const failures: string[] = [];
  try {
    readApproval(home);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  const { problem } = readShown(home);
  if (problem !== null) failures.push(`${problem} The post leaves out what it cannot show.`);
  return { failures };
}
