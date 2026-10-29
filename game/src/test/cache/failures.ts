import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import type { TestModule } from 'vitest/node';
import { isWorkerRpcTimeout } from './verdict';

export type FailedTest = { file: string; test: string | null };
export type FailureRecord = { failed: FailedTest[]; unhandledErrors: number };

function finished(mod: TestModule): boolean {
  return mod.state() === 'passed' || mod.state() === 'skipped';
}

function hasErrors(mod: TestModule): boolean {
  return mod.errors().length > 0 || [...mod.children.allSuites()].some((suite) => suite.errors().length > 0);
}

function moduleFailures(root: string, mod: TestModule): FailedTest[] {
  const file = relative(root, mod.moduleId);
  const tests = [...mod.children.allTests()];
  const cases = tests.filter((test) => test.result().state === 'failed').map((test) => ({ file, test: test.fullName }));
  const pending = tests.some((test) => test.result().state === 'pending');
  const outsideCases = hasErrors(mod) || ((!finished(mod) || pending) && cases.length === 0);
  return outsideCases ? [...cases, { file, test: null }] : cases;
}

export function failureRecord(root: string, modules: readonly TestModule[], unhandledErrors: readonly unknown[]): FailureRecord {
  return {
    failed: modules.flatMap((mod) => moduleFailures(root, mod)),
    unhandledErrors: unhandledErrors.filter((error) => !isWorkerRpcTimeout(error)).length,
  };
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
