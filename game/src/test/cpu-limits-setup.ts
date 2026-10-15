import { relative } from 'node:path';
import { afterAll, afterEach, beforeEach, expect } from 'vitest';
import { cpuMs, FILE_CPU_LIMIT_MS, overCpuLimit, TEST_CPU_LIMIT_MS } from './cpu-limits';

const fileStart = process.cpuUsage();
let testStart = fileStart;

beforeEach(() => {
  testStart = process.cpuUsage();
});

afterEach(() => {
  const over = overCpuLimit(`The test "${expect.getState().currentTestName}"`, cpuMs(process.cpuUsage(testStart)), TEST_CPU_LIMIT_MS);
  if (over !== null) throw new Error(over);
});

afterAll(() => {
  const over = overCpuLimit(`The file ${relative(process.cwd(), expect.getState().testPath ?? '')}`, cpuMs(process.cpuUsage(fileStart)), FILE_CPU_LIMIT_MS);
  if (over !== null) throw new Error(over);
});
