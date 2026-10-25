import { moveCard } from '../card-events';
import { BRANCH, BUG_LABEL, GAME_DIR, HOTFIX_LABEL, TASK_FILE, WONT_DO_LABEL, type Ctx } from '../types';
import { releaseBundle } from './bundle';
import { agentHome, askAuthor, baseBranchOf, catchUpBase, fillPrompt, fitComment, guardAndPush, prepareOutputs, promptFile, readOutput, runAgent, throwIfNeedsCommittee, workDir, writeIssueInput } from './common';
import { writeGroomedInput } from './groom';
import { existsSync, readFileSync } from 'node:fs';

export async function runStage(ctx: Ctx, issue: number): Promise<void> {
  const clone = workDir(ctx, issue);
  const base = await baseBranchOf(ctx, issue);
  await ctx.repo.fetch();
  await ctx.repo.prepareWorkClone(BRANCH(issue), base, clone);
  const baseNote = await catchUpBase(ctx, issue, base, 'design');
  const home = agentHome(clone, GAME_DIR);
  prepareOutputs(ctx, issue, home);
  await writeIssueInput(ctx, issue, home);
  writeGroomedInput(ctx, issue, home);
  const bugExpansion = await bugExpansionFor(ctx, issue);
  const prompt = fillPrompt('design', { issue: String(issue), taskFile: TASK_FILE(issue), branch: BRANCH(issue), baseNote, bugExpansion });
  await runAgent(ctx, issue, 'design', 'design', prompt, { effort: ctx.cfg.designEffort, subagentModel: ctx.cfg.buildModel });
  throwIfNeedsCommittee(home);
  const questions = readOutput(home, 'questions.json');
  if (questions !== null) return askBack(ctx, issue, questions);
  const reason = readOutput(home, 'wont-do.md');
  if (reason !== null) return refuse(ctx, issue, reason);
  requirePlan(home, TASK_FILE(issue));
  await guardAndPush(ctx, issue, base, 'design');
  await postDesign(ctx, issue, readFileSync(`${home}/${TASK_FILE(issue)}`, 'utf8'), readOutput(home, 'summary.md'));
  await moveCard(ctx, issue, 'Implementation', 'planned');
}

async function bugExpansionFor(ctx: Ctx, issue: number): Promise<string> {
  const { labels } = await ctx.github.issue(issue);
  return labels.includes(BUG_LABEL) || labels.includes(HOTFIX_LABEL) ? promptFile('design-bug') : '';
}

async function askBack(ctx: Ctx, issue: number, text: string): Promise<void> {
  const questions = parseQuestions(text);
  await askAuthor(ctx, issue, questions, 'design', 'Design hit a blocker it cannot settle by a sensible reading.');
  await moveCard(ctx, issue, 'Triage', 'questions');
}

function parseQuestions(text: string): string[] {
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data) || data.length === 0 || data.some((item) => typeof item !== 'string' || item.trim() === '')) throw new Error('questions.json must be a non-empty array of non-empty strings');
  return data.map((item: string) => item.trim());
}

async function refuse(ctx: Ctx, issue: number, reason: string): Promise<void> {
  await ctx.github.comment(issue, reason.trim());
  await ctx.github.addLabel(issue, WONT_DO_LABEL);
  await ctx.github.close(issue, 'not planned');
  await moveCard(ctx, issue, 'Done', 'design-wont-do');
  await releaseBundle(ctx, issue, 'will not be built');
}

function requirePlan(home: string, taskFile: string): void {
  const path = `${home}/${taskFile}`;
  if (!existsSync(path)) throw new Error(`The design stage wrote no task file ${taskFile}`);
  if (planText(readFileSync(path, 'utf8')) === '') throw new Error(`Task file ${taskFile} has no non-empty "## Plan" section`);
}

function planText(task: string): string {
  const lines = task.split('\n');
  const start = lines.findIndex((line) => line.trim() === '## Plan');
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
}

const SUMMARY_CHARS = 3000;

function summaryPart(summary: string | null): string {
  const text = summary?.trim() ?? '';
  return text === '' ? '' : `**Planned change**\n\n${text.slice(0, SUMMARY_CHARS)}\n\n`;
}

async function postDesign(ctx: Ctx, issue: number, taskFile: string, summary: string | null): Promise<void> {
  const body = fitComment(taskFile, 'the factory work clone');
  await ctx.github.comment(issue, `${summaryPart(summary)}<details>\n<summary>Design and plan</summary>\n\n${body}\n\n</details>`);
}
