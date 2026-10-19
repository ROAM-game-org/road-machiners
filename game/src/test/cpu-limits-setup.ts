import { relative } from 'node:path';
import { afterAll, afterEach, beforeEach, expect } from 'vitest';
import { cpuLimitsOn, cpuMs, FILE_CPU_LIMIT_MS, overCpuLimit, TEST_CPU_LIMIT_MS } from './cpu-limits';

if (cpuLimitsOn(process.env)) {
  const fileStart = process.threadCpuUsage();
  let testStart = fileStart;

  beforeEach(() => {
    testStart = process.threadCpuUsage();
  });

  afterEach(() => {
    const over = overCpuLimit(`The test "${expect.getState().currentTestName}"`, cpuMs(process.threadCpuUsage(testStart)), TEST_CPU_LIMIT_MS);
    if (over !== null) throw new Error(over);
  });

  afterAll(() => {
    const over = overCpuLimit(`The file ${relative(process.cwd(), expect.getState().testPath ?? '')}`, cpuMs(process.threadCpuUsage(fileStart)), FILE_CPU_LIMIT_MS);
    if (over !== null) throw new Error(over);
  });
}
