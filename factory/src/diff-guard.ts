import { changesSaveMajor } from './save-guard';

export class CommitteeDecisionError extends Error {}

export class ForeignBaseError extends Error {
  constructor(readonly base: string, readonly other: string, readonly count: number) {
    super(`The branch holds ${count} commit${count === 1 ? '' : 's'} that ${other} has and ${base} lacks, so it cannot go into ${base}.`);
  }
}

const FORBIDDEN_PATH = /^\.github\/|(^|\/)\.factory(-tasks|-media)?\//;

export type Side = { files: string[]; diff: string };

export function factoryPaths(files: string[]): string[] {
  return [...new Set(files)].filter((path) => FORBIDDEN_PATH.test(path));
}

export function changedAgainstAll(fileLists: string[][]): string[] {
  const [first = [], ...others] = fileLists;
  const sets = others.map((files) => new Set(files));
  return first.filter((file) => sets.every((set) => set.has(file)));
}

export function guardDiff(side: Side): void {
  guardAgainstAll([side]);
}

export function guardAgainstAll(sides: Side[]): void {
  const leaked = factoryPaths(changedAgainstAll(sides.map((side) => side.files)));
  if (leaked.length) throw new Error(`The branch touches paths an agent may not push: ${leaked.join(', ')}`);
  if (sides.every((side) => changesSaveMajor(side.diff))) {
    throw new CommitteeDecisionError('The change bumps SAVE_MAJOR in game/src/three/save-migrations.ts. The committee must decide on a major save bump before this can go on.');
  }
}
