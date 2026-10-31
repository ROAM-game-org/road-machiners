import type { TestProject } from 'vitest/node';
import { measureWorkloadMs, speedFactor, speedWorkload } from './cpu-limits';
import { buildEmptyTemplate, type EmptyTemplate } from './empty-world';

declare module 'vitest' {
  export interface ProvidedContext {
    emptyTemplate: EmptyTemplate;
    runnerSpeedFactor: number;
  }
}

export default function setup(project: TestProject): void {
  const { ms } = measureWorkloadMs(() => speedWorkload());
  const factor = speedFactor(ms);
  console.log(`[cpu-limits] runner speed workload ${ms.toFixed(0)} ms, limits scaled by ${factor.toFixed(3)}`);
  const template = measureWorkloadMs(buildEmptyTemplate);
  console.log(`[cpu-calibration] loop ${ms.toFixed(0)} ms, empty template ${template.ms.toFixed(0)} ms`);
  project.provide('emptyTemplate', template.result);
  project.provide('runnerSpeedFactor', factor);
}
