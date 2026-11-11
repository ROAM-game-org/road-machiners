import { QUEUE_OF, type JobStage } from './types';

const ONE_GB_EACH = Object.fromEntries(Object.keys(QUEUE_OF).map((stage) => [stage, 1])) as Record<JobStage, number>;

export const ROOMY_MEMORY = { jobsMemoryGb: 100, stageMemoryGb: ONE_GB_EACH, smallJobMemoryGb: 1 };
