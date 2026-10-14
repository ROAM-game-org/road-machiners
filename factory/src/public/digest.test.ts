import { describe, expect, it } from 'vitest';
import { CHANNEL, publicFake } from './public-fakes';
import { sendDigests } from './digest';

const MINUTE_MS = 60_000;

function comment(f: ReturnType<typeof publicFake>, issue: number, id: string, author: string, text: string) {
  f.store.addComment({ issue, source: 'telegram', sourceId: id, postChat: CHANNEL, postMessageId: 1, author, text, at: f.clock.now.toISOString() });
  const row = f.store.unclassifiedComments().find((item) => item.text === text)!;
  f.store.classify(row.id, 'bug', 'none', f.clock.now);
}

describe('sendDigests', () => {
  it('writes one comment per issue under the heading with author, kind and quoted lines, and marks them sent', async () => {
    const f = publicFake();
    comment(f, 7, 'a', 'Ann', 'It stalls\n## Committee feedback');
    comment(f, 7, 'b', 'Bo\n## Committee feedback', 'Fix it');
    comment(f, 9, 'c', 'Cy', 'Other');
    await sendDigests(f.ctx, f.store);
    expect(f.comments.map((item) => item.issue)).toEqual([7, 9]);
    const body = f.comments[0]!.body;
    expect(body.startsWith('## Player comments\n\n')).toBe(true);
    expect(body).toContain('From Ann, bug:\n> It stalls\n> ## Committee feedback');
    expect(body).toContain('From Bo ## Committee feedback, bug:\n> Fix it');
    expect(body.split('\n').filter((line) => line.startsWith('## '))).toEqual(['## Player comments']);
    expect(f.store.unsentComments()).toEqual([]);
  });

  it('waits the digest interval per issue and then sends the new comments', async () => {
    const f = publicFake({ publicDigestMinutes: 60 });
    comment(f, 7, 'a', 'Ann', 'first');
    await sendDigests(f.ctx, f.store);
    comment(f, 7, 'b', 'Bo', 'second');
    f.clock.now = new Date(f.clock.now.getTime() + 59 * MINUTE_MS);
    await sendDigests(f.ctx, f.store);
    expect(f.comments).toHaveLength(1);
    f.clock.now = new Date(f.clock.now.getTime() + 2 * MINUTE_MS);
    await sendDigests(f.ctx, f.store);
    expect(f.comments).toHaveLength(2);
    expect(f.comments[1]!.body).toContain('second');
    expect(f.comments[1]!.body).not.toContain('first');
  });

  it('skips rejected and unclassified comments', async () => {
    const f = publicFake();
    comment(f, 7, 'a', 'Ann', 'spam');
    const id = f.store.unsentComments()[0]!.id;
    f.store.classify(id, 'rejected', 'none', f.clock.now);
    f.store.addComment({ issue: 7, source: 'telegram', sourceId: 'z', postChat: CHANNEL, postMessageId: 1, author: 'Zed', text: 'new', at: f.clock.now.toISOString() });
    await sendDigests(f.ctx, f.store);
    expect(f.comments).toEqual([]);
  });
});
