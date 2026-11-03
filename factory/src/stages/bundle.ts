import { moveCard } from '../card-events';
import { readState, updateState } from '../state';
import { ADHOC_LABEL, BUNDLED_LABEL, HOTFIX_LABEL, NEEDS_INFO_LABEL, RELEASE_TASK_LABEL, STUCK_LABEL, VOTING_LABEL, type Card, type Column, type Ctx, type FactoryState } from '../types';

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

export const carriedIssues = (state: FactoryState): Set<number> => new Set(Object.values(state.bundles).flat());

export function offeredIssues(state: FactoryState, except: number | null = null): Set<number> {
  const designing = new Set(state.jobs.filter((job) => job.stage === 'design' && job.issue !== except).map((job) => String(job.issue)));
  return new Set(Object.entries(state.designOffers).filter(([lead]) => designing.has(lead)).flatMap(([, issues]) => issues));
}

export function designOffer(state: FactoryState, cards: Card[], lead: number, leadLabels: string[]): number[] {
  if (state.designed.includes(lead) || leadLabels.includes(HOTFIX_LABEL) || leadLabels.includes(ADHOC_LABEL)) return [];
  const busy = new Set(state.jobs.map((job) => job.issue));
  const taken = new Set([...carriedIssues(state), ...offeredIssues(state, lead)]);
  const blocked = [STUCK_LABEL, NEEDS_INFO_LABEL, VOTING_LABEL, HOTFIX_LABEL, BUNDLED_LABEL, ADHOC_LABEL];
  const tasks = state.release?.tasks ?? [];
  const releaseScoped = (issue: number, labels: string[]): boolean => tasks.includes(issue) || labels.includes(RELEASE_TASK_LABEL);
  const leadScoped = releaseScoped(lead, leadLabels);
  return cards
    .filter((card) => card.column === 'Design' && card.issue !== lead && releaseScoped(card.issue, card.labels) === leadScoped)
    .filter((card) => !blocked.some((label) => card.labels.includes(label)))
    .filter((card) => !busy.has(card.issue) && !(String(card.issue) in state.held) && !state.designed.includes(card.issue) && bundleOf(state, card.issue).length === 0 && !taken.has(card.issue))
    .map((card) => card.issue)
    .sort((a, b) => a - b);
}

const PAST_DESIGN: Column[] = ['Implementation', 'Testing', 'Approval', 'Hardening', 'Merging'];

export async function offerToDesign(ctx: Ctx, lead: number): Promise<number[]> {
  const { labels } = await ctx.github.issue(lead);
  const cards = await ctx.github.cards();
  let offer: number[] = [];
  updateState(ctx.statePath, (state) => {
    const pastDesign = cards.filter((card) => PAST_DESIGN.includes(card.column) && !state.designed.includes(card.issue)).map((card) => card.issue);
    const known = pastDesign.length === 0 ? state : { ...state, designed: [...state.designed, ...pastDesign] };
    offer = designOffer(known, cards, lead, labels);
    return { ...known, designOffers: { ...known.designOffers, [String(lead)]: offer } };
  });
  return offer;
}

export function dropOffer(ctx: Ctx, lead: number): void {
  updateState(ctx.statePath, (state) => {
    const designOffers = { ...state.designOffers };
    delete designOffers[String(lead)];
    return { ...state, designOffers };
  });
}

export type Taken = { offered: number[]; bundled: number[]; refused: number[] };

export async function takeDesignPicks(ctx: Ctx, lead: number, picks: number[]): Promise<Taken> {
  let taken: Taken = { offered: [], bundled: [], refused: [] };
  updateState(ctx.statePath, (state) => {
    const offered = state.designOffers[String(lead)] ?? [];
    const carried = bundleOf(state, lead);
    const added = picks.filter((issue) => offered.includes(issue) && !carried.includes(issue));
    taken = { offered, bundled: picks.filter((issue) => offered.includes(issue) || carried.includes(issue)), refused: picks.filter((issue) => !offered.includes(issue) && !carried.includes(issue)) };
    const designOffers = { ...state.designOffers };
    delete designOffers[String(lead)];
    const designed = state.designed.includes(lead) ? state.designed : [...state.designed, lead];
    return { ...state, designOffers, designed, bundles: added.length === 0 ? state.bundles : { ...state.bundles, [String(lead)]: [...carried, ...added] } };
  });
  await moveCarried(ctx, lead);
  return taken;
}

async function moveCarried(ctx: Ctx, lead: number): Promise<void> {
  const cards = await ctx.github.cards();
  const unmoved = bundleOf(readState(ctx.statePath), lead).filter((issue) => cards.some((card) => card.issue === issue && card.column === 'Design'));
  await announceBundled(ctx, lead, unmoved, 'Its design found a cause or a fix it shares with this report, so one design covers them together.', 'Design');
}

const IN_WORK: Column[] = ['Design', 'Implementation', 'Testing', 'Approval', 'Hardening', 'Merging'];

export function duplicateLeads(cards: Card[], issue: number): number[] {
  return cards
    .filter((card) => IN_WORK.includes(card.column) && card.issue !== issue && !card.labels.includes(BUNDLED_LABEL))
    .map((card) => card.issue)
    .sort((a, b) => a - b);
}

export async function addToBundle(ctx: Ctx, lead: number, issues: number[], reason: string): Promise<void> {
  await announceBundled(ctx, lead, issues, reason, 'Triage');
  updateState(ctx.statePath, (state) => ({ ...state, bundles: { ...state.bundles, [String(lead)]: [...bundleOf(state, lead), ...issues] } }));
}

async function announceBundled(ctx: Ctx, lead: number, issues: number[], reason: string, by: 'Triage' | 'Design'): Promise<void> {
  for (const issue of issues) {
    await ctx.github.comment(issue, `${by} bundled this into #${lead}, which carries it from here: ${reason}\n\nIt closes when #${lead} ships.`);
    await ctx.github.addLabel(issue, BUNDLED_LABEL);
    await moveCard(ctx, issue, 'Done', 'bundled');
  }
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
