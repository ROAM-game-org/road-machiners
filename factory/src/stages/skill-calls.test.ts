import { describe, expect, it } from 'vitest';
import { requireSkill, skillCalls } from './skill-calls';
import { skillStream as streamOf } from './test-fakes';

function followUps(replies: string[], asks: string[]): (ask: string) => Promise<string> {
  return async (ask) => { asks.push(ask); return replies.shift() ?? ''; };
}

const UDOCUMENT = { stage: 'implement', skill: 'up:udocument', after: 'up:uexecute', ask: 'Run the ultrapack skill udocument now.' };

describe('skill calls of an agent stream', () => {
  it('reads the skill of each Skill tool call in order, from assistant events only', () => {
    const stream = [
      streamOf(['up:uexecute']),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'up:expand' } }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'echo up:udocument' } }] } }),
      'not json',
      streamOf(['up:udocument']),
    ].join('\n');
    expect(skillCalls(stream)).toEqual(['up:uexecute', 'up:udocument']);
  });

  it('counts no skill that only the agent text names', () => {
    const stream = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'I ran the skill up:udocument.' }] } });
    expect(skillCalls(stream)).toEqual([]);
  });
});

describe('a required skill', () => {
  it('needs no follow-up when the stage called the skill after the one it follows', async () => {
    const asks: string[] = [];
    await requireSkill(streamOf(['up:uexecute', 'up:udocument']), UDOCUMENT, followUps([], asks));
    expect(asks).toEqual([]);
  });

  it('asks once in a follow-up, and passes when the follow-up called the skill', async () => {
    const asks: string[] = [];
    await requireSkill(streamOf(['up:uexecute']), UDOCUMENT, followUps([streamOf(['up:udocument'])], asks));
    expect(asks).toEqual([UDOCUMENT.ask]);
  });

  it('asks when the skill ran before the one it must follow', async () => {
    const asks: string[] = [];
    await requireSkill(streamOf(['up:udocument', 'up:uexecute']), UDOCUMENT, followUps([streamOf(['up:udocument'])], asks));
    expect(asks).toHaveLength(1);
  });

  it('asks when the skill ran after the one it must come before, and not when it ran first', async () => {
    const asks: string[] = [];
    const expand = { stage: 'design', skill: 'up:expand', before: 'up:udesign', ask: 'Run the ultrapack skill expand now.' };
    await requireSkill(streamOf(['up:udesign', 'up:expand']), expand, followUps([streamOf(['up:expand'])], asks));
    expect(asks).toHaveLength(1);
    await requireSkill(streamOf(['up:expand', 'up:udesign']), expand, followUps([], asks));
    expect(asks).toHaveLength(1);
  });

  it('fails the stage when the follow-up still did not call the skill', async () => {
    const asks: string[] = [];
    await expect(requireSkill('', UDOCUMENT, followUps([streamOf(['up:udocuments'])], asks)))
      .rejects.toThrow('The implement agent never invoked the Skill tool with up:udocument');
    expect(asks).toHaveLength(1);
  });
});
