import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import type { TestModule } from 'vitest/node';
import { isWorkerRpcTimeout } from './verdict';

export type FailedTest = { file: string; test: string | null };
export type FailureRecord = { failed: FailedTest[]; unhandledErrors: number; unfinished: string[] };

function finished(mod: TestModule): boolean {
  return mod.state() === 'passed' || mod.state() === 'skipped';
}

function hasErrors(mod: TestModule): boolean {
  return mod.errors().length > 0 || [...mod.children.allSuites()].some((suite) => suite.errors().length > 0);
}

function failedCases(root: string, mod: TestModule): FailedTest[] {
  const file = relative(root, mod.moduleId);
  return [...mod.children.allTests()].filter((test) => test.result().state === 'failed').map((test) => ({ file, test: test.fullName }));
}

function moduleFailures(root: string, mod: TestModule): FailedTest[] {
  const file = relative(root, mod.moduleId);
  const cases = failedCases(root, mod);
  const pending = [...mod.children.allTests()].some((test) => test.result().state === 'pending');
  const outsideCases = hasErrors(mod) || ((!finished(mod) || pending) && cases.length === 0);
  return outsideCases ? [...cases, { file, test: null }] : cases;
}

function countedErrors(unhandledErrors: readonly unknown[]): number {
  return unhandledErrors.filter((error) => !isWorkerRpcTimeout(error)).length;
}

export function failureRecord(root: string, modules: readonly TestModule[], unhandledErrors: readonly unknown[]): FailureRecord {
  return { failed: modules.flatMap((mod) => moduleFailures(root, mod)), unhandledErrors: countedErrors(unhandledErrors), unfinished: [] };
}

export function partialFailureRecord(root: string, ended: readonly TestModule[], running: readonly TestModule[], unhandledErrors: readonly unknown[], unfinished: string[]): FailureRecord {
  const failed = [...ended.flatMap((mod) => moduleFailures(root, mod)), ...running.flatMap((mod) => failedCases(root, mod))];
  return { failed, unhandledErrors: countedErrors(unhandledErrors), unfinished };
}

export function clearFailureRecord(file: string): void {
  rmSync(file, { force: true });
}

export function writeFailureRecord(file: string, record: FailureRecord): void {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(record)}\n`);
  renameSync(temp, file);
}
