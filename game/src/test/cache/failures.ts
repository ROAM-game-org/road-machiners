import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import type { TestCase, TestModule } from 'vitest/node';
import { isWorkerRpcTimeout } from './verdict';

export type FailedTest = { file: string; test: string | null; errors: string[] };
export type FailureRecord = { failed: FailedTest[]; unhandledErrors: number };

type ErrorLike = { message?: unknown; diff?: unknown };

function errorText(error: ErrorLike): string {
  const message = typeof error.message === 'string' ? error.message : String(error);
  return typeof error.diff === 'string' && error.diff !== '' ? `${message}\n${error.diff}` : message;
}

function failedCase(file: string, test: TestCase): FailedTest[] {
  const result = test.result();
  return result.state === 'failed' ? [{ file, test: test.fullName, errors: result.errors.map(errorText) }] : [];
}

function fileErrors(mod: TestModule): string[] {
  return [...mod.errors(), ...[...mod.children.allSuites()].flatMap((suite) => suite.errors())].map(errorText);
}

function unfinished(mod: TestModule): boolean {
  const done = mod.state() === 'passed' || mod.state() === 'skipped';
  return !done || [...mod.children.allTests()].some((test) => test.result().state === 'pending');
}

function moduleFailures(root: string, mod: TestModule): FailedTest[] {
  const file = relative(root, mod.moduleId);
  const cases = [...mod.children.allTests()].flatMap((test) => failedCase(file, test));
  const errors = fileErrors(mod);
  const outsideCases = errors.length > 0 || (unfinished(mod) && cases.length === 0);
  return outsideCases ? [...cases, { file, test: null, errors }] : cases;
}

export function failureRecord(root: string, modules: readonly TestModule[], unhandledErrors: readonly unknown[]): FailureRecord {
  return { failed: modules.flatMap((mod) => moduleFailures(root, mod)), unhandledErrors: unhandledErrors.filter((error) => !isWorkerRpcTimeout(error)).length };
}

export function clearFailureRecord(file: string): void {
  rmSync(file, { force: true });
}

export function writeFailureRecord(file: string, record: FailureRecord): void {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(record));
  renameSync(temp, file);
}
