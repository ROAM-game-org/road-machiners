import type { Story } from 'inkjs';
import { CHECK_TAG, COST_TAG } from '../data/quests';

export class EffectLookahead extends Error {}

type Choice = { key: string; priced: boolean };
type Point = { ink: string; choices: Choice[] };
type Reply = { lines: string[]; next: Point };

const sameKeys = (a: Point, b: Point): boolean => a.choices.length === b.choices.length && a.choices.every((c, i) => c.key === b.choices[i].key);

export function replyHash(lines: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const ch of lines.join('\n')) hash = Math.imul(hash ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return hash.toString(36);
}

export function choiceKeyAt(story: Story, ink: string, index: number): string {
  story.state.LoadJson(ink);
  return story.currentChoices[index].sourcePath;
}

function pointNow(story: Story): Point {
  const choices = story.currentChoices.map((c) => ({ key: c.sourcePath, priced: (c.tags ?? []).some((t) => t.startsWith(COST_TAG) || t.startsWith(CHECK_TAG)) }));
  return { ink: story.state.toJson(), choices };
}

const stoppedByLookahead = (error: unknown): boolean => error instanceof EffectLookahead || (error instanceof Error && error.message.includes(EffectLookahead.name));

function linesToChoice(story: Story): string[] | null {
  const lines: string[] = [];
  try {
    while (story.canContinue) lines.push((story.Continue() ?? '').trim());
  } catch (error) {
    if (stoppedByLookahead(error)) return null;
    throw error;
  }
  return lines.filter((line) => line !== '');
}

type Replies = Map<string, Reply | null>;

function replyTo(story: Story, point: Point, index: number, memo: Replies): Reply | null {
  const key = `${index}:${point.ink}`;
  if (memo.has(key)) return memo.get(key)!;
  story.state.LoadJson(point.ink);
  story.ChooseChoiceIndex(index);
  const lines = linesToChoice(story);
  const reply = lines === null ? null : { lines, next: pointNow(story) };
  memo.set(key, reply);
  return reply;
}

function isQuestion(point: Point, index: number, reply: Reply | null, replies: Record<string, string>): boolean | null {
  if (!reply || !sameKeys(reply.next, point)) return null;
  return replies[point.choices[index].key] === replyHash(reply.lines);
}

function topicSeen(story: Story, here: Point, there: Point, replies: Record<string, string>, memo: Replies): boolean {
  const repliesTo = there.choices.map((choice, j) => (choice.priced ? null : replyTo(story, there, j, memo)));
  const asked = repliesTo.map((reply, j) => isQuestion(there, j, reply, replies));
  const back = repliesTo.some((reply) => reply !== null && sameKeys(reply.next, here));
  const questions = asked.filter((a) => a !== null);
  return back && questions.length > 0 && questions.every(Boolean);
}

function choiceSeen(story: Story, point: Point, index: number, replies: Record<string, string>, memo: Replies): boolean {
  if (point.choices[index].priced) return false;
  const reply = replyTo(story, point, index, memo);
  if (!reply || reply.next.choices.length === 0) return false;
  if (sameKeys(reply.next, point)) return replies[point.choices[index].key] === replyHash(reply.lines);
  return topicSeen(story, point, reply.next, replies, memo);
}

export function seenAt(story: Story, ink: string, replies: Record<string, string>): boolean[] {
  story.state.LoadJson(ink);
  const point = pointNow(story);
  const memo: Replies = new Map();
  return point.choices.map((_, i) => choiceSeen(story, point, i, replies, memo));
}
