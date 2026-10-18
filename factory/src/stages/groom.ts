import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_DIR, type Ctx } from '../types';
import { fillPrompt, readOutput, runAgent } from './common';

export type Complexity = 'trivial' | 'intermediate' | 'hard';
export type Routing = { complexity: Complexity; why: string };
export type Pitch = { title: string; text: string };
export type Groomed = { verdict: 'ready'; reason: string; routing: Routing } | { verdict: 'vote'; reason: string; routing: Routing; pitch: Pitch } | { verdict: 'wont-do'; reason: string };

type Story = { need: string; existing: string; version: string; fit: string };
type RussianPitch = { title: string; summary: string; how: string; when: string; pros: string[]; cons: string[] };

const groomedFile = (home: string, issue: number): string => join(home, 'groomed', `issue-${issue}.md`);

export async function groom(ctx: Ctx, issue: number, home: string): Promise<Groomed> {
  await runAgent(ctx, issue, 'triage', 'groom', fillPrompt('groom', { issue: String(issue) }), { model: ctx.cfg.designModel, effort: ctx.cfg.designEffort });
  const fields = readFields(readOutput(home, 'groom.json'));
  const story = readStory(fields);
  const groomed = readGroomed(fields);
  const record = groomedText(story, groomed);
  await ctx.github.comment(issue, record);
  if (groomed.verdict !== 'wont-do') saveGroomed(ctx.cfg.home, issue, record);
  return groomed;
}

export function writeGroomedInput(ctx: Ctx, issue: number, home: string): void {
  const file = groomedFile(ctx.cfg.home, issue);
  if (existsSync(file)) writeFileSync(`${home}/${OUT_DIR}/groomed.md`, readFileSync(file, 'utf8'));
}

function saveGroomed(factoryHome: string, issue: number, record: string): void {
  mkdirSync(join(factoryHome, 'groomed'), { recursive: true });
  writeFileSync(groomedFile(factoryHome, issue), `${record}\n`);
}

function groomedText(story: Story, groomed: Groomed): string {
  const parts = ['## Groomed request', `Player need: ${story.need}`, `What the game has for it: ${story.existing}`, `Groomed version: ${story.version}`, `Fit: ${story.fit}`, `Verdict: ${groomed.verdict}. ${groomed.reason}`];
  if (groomed.verdict === 'vote') parts.push(`Pitch for the player vote:\n\n${groomed.pitch.title}\n\n${groomed.pitch.text}`);
  return parts.join('\n\n');
}

function readFields(text: string | null): Record<string, unknown> {
  if (text === null) throw new Error('The groom run wrote no .factory/groom.json');
  const data: unknown = JSON.parse(text);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('groom.json is not an object');
  return data as Record<string, unknown>;
}

function readText(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`groom.json needs ${name} as a non-empty string`);
  return value.trim();
}

function readList(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`groom.json needs ${name} as a non-empty list of strings`);
  return value.map((item) => readText(item, name));
}

function readStory(fields: Record<string, unknown>): Story {
  return { need: readText(fields.need, 'need'), existing: readText(fields.existing, 'existing'), version: readText(fields.version, 'version'), fit: readText(fields.fit, 'fit') };
}

function readGroomed(fields: Record<string, unknown>): Groomed {
  const reason = readText(fields.reason, 'reason');
  if (fields.verdict === 'wont-do') return { verdict: 'wont-do', reason };
  if (fields.verdict !== 'ready' && fields.verdict !== 'vote') throw new Error(`groom.json has an unknown verdict: ${String(fields.verdict)}`);
  const routing = readRouting(fields.complexity, fields.complexityReason);
  return fields.verdict === 'ready' ? { verdict: 'ready', reason, routing } : { verdict: 'vote', reason, routing, pitch: composePitch(readPitch(fields.pitch)) };
}

function readRouting(complexity: unknown, why: unknown): Routing {
  if (complexity !== 'trivial' && complexity !== 'intermediate' && complexity !== 'hard') throw new Error('groom.json needs complexity as trivial, intermediate or hard');
  return { complexity, why: readText(why, 'complexityReason') };
}

function readPitch(value: unknown): RussianPitch {
  if (typeof value !== 'object' || value === null) throw new Error('groom.json needs a pitch for a vote verdict');
  const pitch = value as Record<string, unknown>;
  return {
    title: readText(pitch.title, 'pitch.title'), summary: readText(pitch.summary, 'pitch.summary'), how: readText(pitch.how, 'pitch.how'), when: readText(pitch.when, 'pitch.when'),
    pros: readList(pitch.pros, 'pitch.pros'), cons: readList(pitch.cons, 'pitch.cons'),
  };
}

function composePitch({ title, summary, how, when, pros, cons }: RussianPitch): Pitch {
  const points = (items: string[]): string => items.map((item) => `- ${item}`).join('\n');
  return { title, text: [summary, `Как это работает:\n${how}`, `Когда это выгодно:\n${when}`, `Плюсы:\n${points(pros)}`, `Минусы:\n${points(cons)}`].join('\n\n') };
}
