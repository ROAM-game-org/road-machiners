import type { CardStep } from '../card-events';
import type { Activity } from '../observability';
import type { WaitReason } from '../tick';
import type { Column, JobStage, Queue } from '../types';
import type { JobOutcome } from '../ledger';
import type { MergeState } from './snapshot';
import type { DeliveryStage } from './vocabulary';

const columns: Record<Column, string> = {
  Triage: 'Triage', Design: 'Design', Implementation: 'Implement', Testing: 'Test', Approval: 'Approval', Hardening: 'Harden', Merging: 'Merge', Done: 'Done',
};
const stages: Record<JobStage, string> = {
  triage: 'Triage', design: 'Design', implement: 'Implement', verify: 'Verify', harden: 'Harden', checks: 'Test', approve: 'Approval', merge: 'Merge', 'catch-up': 'Merge catch-up',
  playtest: 'Playtest', adhoc: 'Private task', change: 'Factory change', candidate: 'Candidate', release: 'Release', ship: 'Ship', remove: 'Removal',
  incident: 'Incident', dev: 'Dev build', waste: 'Review',
};
const queues: Record<Queue, string> = { triage: 'Triage', design: 'Design', implement: 'Implement', verify: 'Verify', test: 'Test', branch: 'Branch' };
const activities: Record<Activity, string> = {
  starting: 'Starting', model: 'Waiting for model', reading: 'Reading code', editing: 'Editing code', command: 'Running command', tests: 'Running tests',
  typecheck: 'Typechecking', playtest: 'Running playtest', build: 'Building', publish: 'Publishing', install: 'Installing dependencies', git: 'Git operation',
  lock: 'Waiting for repository lock', review: 'Reviewing', design: 'Designing', investigate: 'Investigating', waiting: 'Waiting', finished: 'Finished',
};
const reasons: Record<WaitReason, string> = {
  'queue-full': 'Queue occupied', 'issue-running': 'Already running', 'card-budget': 'Card job limit',
  'needs-info': 'Needs author reply', voting: 'Waits for player votes', failed: 'Failed job needs attention', approval: 'Needs committee approval', held: 'Held until resumed',
};
const dwell: Record<DeliveryStage, string> = {
  triage: columns.Triage, design: columns.Design, implementation: columns.Implementation, preview: columns.Testing, approval: columns.Approval, harden: columns.Hardening, merge: columns.Merging,
};
const loops: Partial<Record<CardStep, string>> = {
  questions: 'Design asks the author', rebuild: 'Visual review: rebuild', 'plan-wrong': 'Testing finds the plan wrong', 'review-failed': 'Code review fails twice',
  patch: 'Committee patch', redesign: 'Committee redesign', 'patch-replan': 'Patch needs a new plan', conflict: 'Merge conflict', 'base-moved': 'Hotfix base moved', removed: 'Removed from release',
  unbundled: 'Bundle lead dropped',
};
const mergeStates: Record<MergeState, string> = { merging: 'Merging', next: 'Next', stuck: 'Stuck', held: 'Held', 'after-ship': 'After ship' };
const outcomes: Record<JobOutcome, string> = { done: 'Finished', failed: 'Failed', died: 'Died', timeout: 'Timed out', stopped: 'Stopped', held: 'Held' };

export const LABELS = { columns, stages, queues, activities, reasons, dwell, loops, mergeStates, outcomes };
export type Labels = typeof LABELS;
