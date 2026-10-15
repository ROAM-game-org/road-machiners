export type SkillCheck = { stage: string; skill: string; after?: string; before?: string; ask: string };

type StreamEvent = { type?: string; message?: { content?: { type?: string; name?: string; input?: { skill?: unknown } }[] } };

function parseEvent(line: string): StreamEvent | null {
  try {
    return JSON.parse(line) as StreamEvent;
  } catch {
    return null;
  }
}

export function skillCalls(stream: string): string[] {
  return stream.split('\n').map(parseEvent).flatMap((event) => {
    const blocks = event?.type === 'assistant' ? event.message?.content : undefined;
    if (!Array.isArray(blocks)) return [];
    return blocks.flatMap((block) => block.type === 'tool_use' && block.name === 'Skill' && typeof block.input?.skill === 'string' ? [block.input.skill] : []);
  });
}

function calledInOrder(calls: string[], check: SkillCheck): boolean {
  const first = calls.indexOf(check.skill);
  if (first < 0) return false;
  const afterOk = check.after === undefined || calls.lastIndexOf(check.after) < calls.lastIndexOf(check.skill);
  const beforeOk = check.before === undefined || !calls.includes(check.before) || first < calls.indexOf(check.before);
  return afterOk && beforeOk;
}

export async function requireSkill(stream: string, check: SkillCheck, followUp: (ask: string) => Promise<string>): Promise<void> {
  if (calledInOrder(skillCalls(stream), check)) return;
  const again = await followUp(check.ask);
  if (!skillCalls(again).includes(check.skill)) throw new Error(`The ${check.stage} agent never invoked the Skill tool with ${check.skill}`);
}
