import type { TestProject } from 'vitest/node';
import { cpuLimitsOn, measureWorkloadMs, speedFactor } from './cpu-limits';
import { buildEmptyTemplate, type EmptyTemplate } from './empty-world';

declare module 'vitest' {
  export interface ProvidedContext {
    emptyTemplate: EmptyTemplate;
    runnerSpeedFactor: number;
  }
}

export default function setup(project: TestProject): void {
  if (!cpuLimitsOn(process.env)) {
    project.provide('emptyTemplate', buildEmptyTemplate());
    project.provide('runnerSpeedFactor', 1);
    return;
  }
  const { ms, result } = measureWorkloadMs(buildEmptyTemplate);
  const factor = speedFactor(ms);
  console.log(`[cpu-limits] runner speed workload ${ms.toFixed(0)} ms, limits scaled by ${factor.toFixed(3)}`);
  project.provide('emptyTemplate', result);
  project.provide('runnerSpeedFactor', factor);
}
