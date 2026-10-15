import type { TestProject } from 'vitest/node';
import { buildEmptyTemplate, type EmptyTemplate } from './empty-world';

declare module 'vitest' {
  export interface ProvidedContext {
    emptyTemplate: EmptyTemplate;
  }
}

export default function setup(project: TestProject): void {
  project.provide('emptyTemplate', buildEmptyTemplate());
}
