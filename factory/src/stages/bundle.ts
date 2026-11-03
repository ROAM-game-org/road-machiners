import { moveCard } from '../card-events';
import { readState, updateState } from '../state';
import { ALONE_SYSTEM, systemOf } from '../systems';
import { ADHOC_LABEL, BUNDLED_LABEL, DESIGN_SONNET_LABEL, HOTFIX_LABEL, NEEDS_INFO_LABEL, RELEASE_TASK_LABEL, STUCK_LABEL, VOTING_LABEL, type Card, type Column, type Ctx, type FactoryState } from '../types';

export function bundleOf(state: FactoryState, lead: number): number[] {
  return state.bundles[String(lead)] ?? [];
}

export function bundleCandidates(state: FactoryState, cards: Card[], lead: number): number[] {
  const busy = new Set(state.jobs.map((job) => job.issue));
  const blocked = [STUCK_LABEL, NEEDS_INFO_LABEL, VOTING_LABEL, HOTFIX_LABEL, BUNDLED_LABEL];
  return cards
    .filter((card) => card.column === 'Triage' && card.issue !== lead && !busy.has(card.issue) && bundleOf(state, card.issue).length === 0)
    .filter((card) => !blocked.some((label) => card.labels.includes(label)))
    .map((card) => card.issue)
    .sort((a, b) => a - b);
}

const UNDESIGNED: Column[] = ['Triage', 'Design'];

export function systemCandidates(state: FactoryState, cards: Card[], lead: number, leadLabels: string[]): number[] {
  const system = systemOf(lead, leadLabels);
  if (system === null || system === ALONE_SYSTEM || leadLabels.includes(HOTFIX_LABEL)) return [];
  const busy = new Set(state.jobs.map((job) => job.issue));
  const blocked = [STUCK_LABEL, NEEDS_INFO_LABEL, VOTING_LABEL, HOTFIX_LABEL, BUNDLED_LABEL, ADHOC_LABEL];
  const releaseTask = leadLabels.includes(RELEASE_TASK_LABEL);
  return cards
    .filter((card) => UNDESIGNED.includes(card.column) && card.issue !== lead && systemOf(card.issue, card.labels) === system)
    .filter((card) => card.labels.includes(RELEASE_TASK_LABEL) === releaseTask && !blocked.some((label) => card.labels.includes(label)))
    .filter((card) => !busy.has(card.issue) && !(String(card.issue) in state.held) && !state.designStarted.includes(card.issue) && bundleOf(state, card.issue).length === 0)
    .map((card) => card.issue)
    .sort((a, b) => a - b);
}

export async function pullSystemBundle(ctx: Ctx, lead: number): Promise<void> {
  const { labels } = await ctx.github.issue(lead);
  const cards = await ctx.github.cards();
  let pulled: number[] = [];
  updateState(ctx.statePath, (state) => {
    if (state.designStarted.includes(lead)) return state;
    pulled = systemCandidates(state, cards, lead, labels);
    return { ...state, designStarted: [...state.designStarted, lead, ...pulled] };
  });
  if (pulled.length === 0) return;
  const system = systemOf(lead, labels);
  await addToBundle(ctx, lead, pulled, `It is about the same game system, ${system}, so one design covers them together.`, 'Design');
  await ctx.github.comment(lead, `Design pulled in ${pulled.map((n) => `#${n}`).join(', ')}, which are about the same game system, ${system}. This card also carries them.`);
  if (labels.includes(DESIGN_SONNET_LABEL)) await ctx.github.removeLabel(lead, DESIGN_SONNET_LABEL);
}

const IN_WORK: Column[] =['Design', 'Implementation', 'Testing', 'Approval', 'Hardening', 'Merging'];

export function duplicateLeads(cards: Card[], issue: number): number[] {
  return cards
    .filter((card) => IN_WORK.includes(card.column) && card.issue !== issue && !card.labels.includes(BUNDLED_LABEL))
    .map((card) => card.issue)
    .sort((a, b) => a - b);
}

export async function addToBundle(ctx: Ctx, lead: number, issues: number[], reason: string, by: 'Triage' | 'Design'): Promise<void> {
  for (const issue of issues) {
    await ctx.github.comment(issue, `${by} bundled this into #${lead}, which carries it from here: ${reason}\n\nIt closes when #${lead} ships.`);
    await ctx.github.addLabel(issue, BUNDLED_LABEL);
    await moveCard(ctx, issue, 'Done', 'bundled');
  }
  updateState(ctx.statePath, (state) => ({ ...state, bundles: { ...state.bundles, [String(lead)]: [...bundleOf(state, lead), ...issues] } }));
}

export async function closeBundle(ctx: Ctx, lead: number, note: string): Promise<number[]> {
  const issues = bundleOf(readState(ctx.statePath), lead);
  for (const issue of issues) {
    await ctx.github.comment(issue, `${note} It shipped as part of #${lead}.`);
    await ctx.github.close(issue, 'completed');
  }
  forgetBundle(ctx, lead);
  return issues;
}

export async function releaseBundle(ctx: Ctx, lead: number, why: string): Promise<void> {
  for (const issue of bundleOf(readState(ctx.statePath), lead)) {
    await ctx.github.comment(issue, `#${lead} ${why}, so this issue goes back to triage on its own.`);
    await ctx.github.removeLabel(issue, BUNDLED_LABEL);
    await moveCard(ctx, issue, 'Triage', 'unbundled');
  }
  forgetBundle(ctx, lead);
}

function forgetBundle(ctx: Ctx, lead: number): void {
  updateState(ctx.statePath, (state) => {
    const bundles = { ...state.bundles };
    delete bundles[String(lead)];
    return { ...state, bundles };
  });
}
