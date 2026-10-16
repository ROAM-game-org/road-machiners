import { MESSAGE_LIMIT } from '../telegram-limits';
import type { Ctx } from '../types';
import { pitchTitle } from './proposals';
import { openStore } from './store';

const INVITE = 'Tell us what you think in the comments.';

function fitWithin(text: string, room: number): string {
  if (text.length <= room) return text;
  let fitted = '';
  for (const char of text) {
    if (fitted.length + char.length > room - 1) break;
    fitted += char;
  }
  return `${fitted}…`;
}

export function buildPostText(title: string, url: string, description: string): string {
  const head = `${title}\n\nPlay: ${url}\n\n`;
  const tail = `\n\n${INVITE}`;
  return `${head}${fitWithin(description, MESSAGE_LIMIT - head.length - tail.length)}${tail}`;
}

export async function postBuild(ctx: Ctx, issue: number, build: string, url: string, description: string): Promise<void> {
  const store = openStore(ctx.cfg.home);
  try {
    const proposal = store.proposal(issue);
    if (proposal === null || proposal.chat === null || proposal.messageId === null) return;
    store.closeBuildPosts(issue);
    const messageId = await ctx.telegram.sendMessage(proposal.chat, buildPostText(pitchTitle(proposal.pitch), url, description), proposal.messageId);
    store.addBuildPost(issue, build, proposal.chat, messageId, ctx.now());
  } finally {
    store.close();
  }
}
