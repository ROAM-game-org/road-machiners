import { describe, expect, it } from 'vitest';
import { MESSAGE_LIMIT } from '../telegram-limits';
import { postBuild } from './build-post';
import { CHANNEL, publicFake } from './public-fakes';

describe('postBuild', () => {
  it('replies to the proposal with title, link, description and the invitation, and records an open build post', async () => {
    const f = publicFake();
    f.store.addProposal(7, 'Winch\nPull trucks out.', f.clock.now);
    f.store.markProposalPosted(7, CHANNEL, 100, 'footer', f.clock.now);
    await postBuild(f.ctx, 7, 'abc1234', 'https://play.test/abc1234/', 'It pulls trucks.');
    expect(f.messages).toHaveLength(1);
    const { chat, text, replyTo } = f.messages[0]!;
    expect([chat, replyTo]).toEqual([CHANNEL, 100]);
    expect(text).toContain('Winch');
    expect(text).toContain('https://play.test/abc1234/');
    expect(text).toContain('It pulls trucks.');
    expect(text).toContain('Tell us what you think in the comments.');
    expect(text).not.toContain('The committee decides if it ships.');
    expect(f.store.openBuildPost(7)).toMatchObject({ build: 'abc1234', chat: CHANNEL, messageId: 501 });
  });

  it('closes the older build post when a new build is posted', async () => {
    const f = publicFake();
    f.store.addProposal(7, 'Winch', f.clock.now);
    f.store.markProposalPosted(7, CHANNEL, 100, 'footer', f.clock.now);
    await postBuild(f.ctx, 7, 'aaa1111', 'u1', 'd');
    await postBuild(f.ctx, 7, 'bbb2222', 'u2', 'd');
    expect(f.store.openBuildPost(7)).toMatchObject({ build: 'bbb2222', messageId: 502 });
  });

  it('leaves no open build post when the send of the next build fails', async () => {
    const f = publicFake();
    f.store.addProposal(7, 'Winch', f.clock.now);
    f.store.markProposalPosted(7, CHANNEL, 100, 'footer', f.clock.now);
    await postBuild(f.ctx, 7, 'aaa1111', 'u1', 'd');
    f.ctx.telegram.sendMessage = async () => { throw new Error('telegram down'); };
    await expect(postBuild(f.ctx, 7, 'bbb2222', 'u2', 'd')).rejects.toThrow('telegram down');
    expect(f.store.openBuildPost(7)).toBeNull();
  });

  it('cuts a long description so the post is one message, the one whose replies are recorded, and keeps the invitation', async () => {
    const f = publicFake();
    f.store.addProposal(7, 'Winch', f.clock.now);
    f.store.markProposalPosted(7, CHANNEL, 100, 'footer', f.clock.now);
    await postBuild(f.ctx, 7, 'abc1234', 'https://play.test/abc1234/', '🚚'.repeat(3000));
    expect(f.messages).toHaveLength(1);
    const { text } = f.messages[0]!;
    expect(text.length).toBeLessThanOrEqual(MESSAGE_LIMIT);
    expect(text).toContain('…\n\nTell us what you think');
    expect(text.endsWith('Tell us what you think in the comments.')).toBe(true);
    expect(text).not.toContain('The committee decides if it ships.');
  });

  it('does nothing for an issue with no posted proposal', async () => {
    const f = publicFake();
    f.store.addProposal(8, 'Unposted', f.clock.now);
    await postBuild(f.ctx, 7, 'abc1234', 'u', 'd');
    await postBuild(f.ctx, 8, 'abc1234', 'u', 'd');
    expect(f.messages).toEqual([]);
  });
});
