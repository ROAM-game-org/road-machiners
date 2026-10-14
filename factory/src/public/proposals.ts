import { bundleOf } from '../stages/bundle';
import { readState } from '../state';
import { MESSAGE_LIMIT } from '../telegram-limits';
import type { Ctx } from '../types';
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
  return `Needs ${ctx.cfg.minVotes} more ${up[0]} than ${down[0]} to pass. Current: ${tallyText(ctx, tally)}/${ctx.cfg.minVotes}`;
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

export function proposalText(ctx: Ctx, issue: number, pitch: string, footer: string): string {
  const links = [issue, ...bundleOf(readState(ctx.statePath), issue)].map((number) => issueLink(ctx, number));
  const heading = `<b>Proposal: ${escapeHtml(pitchTitle(pitch))}</b>`;
  const tail = `${escapeHtml(links.join('\n'))}\n\n${escapeHtml(footer)}`;
  const body = escapeWithin(pitchBody(pitch), MESSAGE_LIMIT - heading.length - tail.length - 4);
  return [heading, body, tail].filter((part) => part !== '').join('\n\n');
}

export async function postProposal(ctx: Ctx, store: PublicStore): Promise<void> {
  const now = ctx.now();
  if (store.proposalsPostedSince(new Date(now.getTime() - DAY_MS)) >= ctx.cfg.proposalsPerDay) return;
  for (const proposal of store.unpostedProposals()) {
    const item = await ctx.github.issue(proposal.issue);
    if (item.state === 'CLOSED') {
      ctx.log('public', proposal.issue, 'the issue is closed, so its proposal is closed unposted');
      store.closeProposal(proposal.issue, now);
      continue;
    }
    const footer = voteFooter(ctx, { up: 0, down: 0 });
    const messageId = await ctx.telegram.sendHtml(ctx.cfg.proposalChat, proposalText(ctx, proposal.issue, proposal.pitch, footer));
    store.markProposalPosted(proposal.issue, ctx.cfg.proposalChat, messageId, footer, now);
    return;
  }
}
