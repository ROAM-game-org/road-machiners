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

function replyTo(story: Story, point: Point, index: number): Reply | null {
  story.state.LoadJson(point.ink);
  story.ChooseChoiceIndex(index);
  const lines = linesToChoice(story);
  return lines === null ? null : { lines, next: pointNow(story) };
}

function isQuestion(story: Story, point: Point, index: number, replies: Record<string, string>): boolean | null {
  const reply = point.choices[index].priced ? null : replyTo(story, point, index);
  if (!reply || !sameKeys(reply.next, point)) return null;
  return replies[point.choices[index].key] === replyHash(reply.lines);
}

function topicSeen(story: Story, here: Point, there: Point, replies: Record<string, string>): boolean {
  const asked = there.choices.map((_, j) => isQuestion(story, there, j, replies));
  const back = there.choices.some((_, j) => !there.choices[j].priced && sameKeysAfter(story, there, j, here));
  const questions = asked.filter((a) => a !== null);
  return back && questions.length > 0 && questions.every(Boolean);
}

function sameKeysAfter(story: Story, from: Point, index: number, target: Point): boolean {
  const reply = replyTo(story, from, index);
  return reply !== null && sameKeys(reply.next, target);
}

function choiceSeen(story: Story, point: Point, index: number, replies: Record<string, string>): boolean {
  if (point.choices[index].priced) return false;
  const reply = replyTo(story, point, index);
  if (!reply || reply.next.choices.length === 0) return false;
  if (sameKeys(reply.next, point)) return replies[point.choices[index].key] === replyHash(reply.lines);
  return topicSeen(story, point, reply.next, replies);
}

export function seenAt(story: Story, ink: string, replies: Record<string, string>): boolean[] {
  story.state.LoadJson(ink);
  const point = pointNow(story);
  return point.choices.map((_, i) => choiceSeen(story, point, i, replies));
}
