import { withLock } from './lock';
import { RUN_KEY, RUN_LOCK_NAME, WORK_LOCK, type Ctx, type JobStage } from './types';

const RUN_LOCK_WAIT_MS = 30_000;

export function withActiveRun<T>(ctx: Ctx, stage: JobStage, issue: number | null, work: () => Promise<T>, waitMs = RUN_LOCK_WAIT_MS): Promise<T> {
  return withLock(WORK_LOCK(ctx.cfg.home, RUN_LOCK_NAME(issue === null ? RUN_KEY.stage(stage) : RUN_KEY.issue(issue))), waitMs, work);
}
