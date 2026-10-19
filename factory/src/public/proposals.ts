import { bundleOf } from '../stages/bundle';
import { readState } from '../state';
import { MESSAGE_LIMIT } from '../telegram-limits';
import { VOTING_LABEL, type Ctx } from '../types';
import { isolated } from './isolate';
import type { PublicStore, Tally } from './store';

const DAY_MS = 24 * 3_600_000;

export type VoteSides = { up: string[]; down: string[] };

export const pitchTitle = (pitch: string): string => pitch.split('\n')[0]!.trim();

const pitchBody = (pitch: string): string => pitch.split('\n').slice(1).join('\n').trim();

const issueLink = (ctx: Ctx, issue: number): string => `https://github.com/${ctx.cfg.repo}/issues/${issue}`;

export const escapeHtml = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function emojiOf(list: string, name: string): string[] {
  const emoji = list.split(/\s+/).filter((item) => item !== '');
  if (emoji.length === 0) throw new Error(`${name} names no emoji, so proposal votes cannot be counted`);
  return emoji;
}

export const voteSides = (ctx: Ctx): VoteSides => ({ up: emojiOf(ctx.cfg.voteEmoji, 'FACTORY_VOTE_EMOJI'), down: emojiOf(ctx.cfg.vetoEmoji, 'FACTORY_VETO_EMOJI') });

export const netScore = (tally: Tally): number => tally.up - tally.down;

export const signed = (score: number): string => (score > 0 ? `+${score}` : String(score));

export function tallyText(ctx: Ctx, tally: Tally): string {
  const { up, down } = voteSides(ctx);
  return `${tally.up} ${up[0]}, ${tally.down} ${down[0]}, net ${signed(netScore(tally))}`;
}

export function voteFooter(ctx: Ctx, tally: Tally): string {
  const { up, down } = voteSides(ctx);
  return `Нужно на ${ctx.cfg.minVotes} ${up[0]} больше, чем ${down[0]}. Сейчас: ${tally.up} ${up[0]}, ${tally.down} ${down[0]}, итог ${signed(netScore(tally))}/${ctx.cfg.minVotes}`;
}

function escapeWithin(text: string, room: number): string {
  let fitted = '';
  for (const char of text) {
    const next = escapeHtml(char);
    if (fitted.length + next.length > room - 1) return `${fitted}…`;
    fitted += next;
  }
  return fitted;
}

export const ACCEPTED_BY_COMMITTEE = '✅ Принято участником комитета';
export const REJECTED_BY_COMMITTEE = '❌ Отклонено участником комитета';
export const CLOSED_CONCLUSION = 'Закрыто';
export const acceptedWith = (score: number): string => `✅ Принято с итогом ${signed(score)}`;

export function proposalText(ctx: Ctx, issue: number, pitch: string, footer: string): string {
  const links = [issue, ...bundleOf(readState(ctx.statePath), issue)].map((number) => issueLink(ctx, number));
  const heading = `<b>Предложение: ${escapeHtml(pitchTitle(pitch))}</b>`;
  const tail = `${escapeHtml(links.join('\n'))}\n\n${escapeHtml(footer)}`;
  const body = escapeWithin(pitchBody(pitch), MESSAGE_LIMIT - heading.length - tail.length - 4);
  return [heading, body, tail].filter((part) => part !== '').join('\n\n');
}

export async function postProposal(ctx: Ctx, store: PublicStore): Promise<void> {
  const now = ctx.now();
  if (store.proposalPostAttemptsSince(new Date(now.getTime() - DAY_MS)) >= ctx.cfg.proposalsPerDay) return;
  const footer = voteFooter(ctx, { up: 0, down: 0 });
  for (const proposal of store.unpostedProposals()) {
    store.beginProposalPost(proposal.issue, now);
    let skipped = false;
    await isolated(ctx, proposal.issue, 'the proposal could not be posted and is closed without a post, so post it by hand or put the card to a vote again', async () => {
      const item = await ctx.github.issue(proposal.issue);
      if (item.state === 'CLOSED') {
        ctx.log('public', proposal.issue, 'the issue is closed, so its proposal is closed unposted');
        skipped = true;
      } else if (!item.labels.includes(VOTING_LABEL)) {
        ctx.log('public', proposal.issue, 'the issue lost its voting label, so its proposal is closed unposted');
        skipped = true;
      } else {
        const messageId = await ctx.telegram.sendHtml(ctx.cfg.proposalChat, proposalText(ctx, proposal.issue, proposal.pitch, footer));
        store.markProposalPosted(proposal.issue, ctx.cfg.proposalChat, messageId, footer, now);
      }
    });
    if (!skipped) return;
    store.closeProposal(proposal.issue, now);
  }
}
