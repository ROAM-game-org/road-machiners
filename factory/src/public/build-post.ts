import type { Ctx } from '../types';
import { pitchTitle } from './proposals';
import { openStore } from './store';

export async function postBuild(ctx: Ctx, issue: number, build: string, url: string, description: string): Promise<void> {
  const store = openStore(ctx.cfg.home);
  try {
    const proposal = store.proposal(issue);
    if (proposal === null || proposal.chat === null || proposal.messageId === null) return;
    const invite = 'Tell us what you think in the comments. The committee decides if it ships.';
    const text = `${pitchTitle(proposal.pitch)}\n\nPlay: ${url}\n\n${description}\n\n${invite}`;
    const messageId = await ctx.telegram.sendMessage(proposal.chat, text, proposal.messageId);
    store.addBuildPost(issue, build, proposal.chat, messageId, ctx.now());
  } finally {
    store.close();
  }
}
