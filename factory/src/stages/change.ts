import { join } from 'node:path';
import { rmSync, writeFileSync } from 'node:fs';
import { roundSession } from '../sessions';
import { updateState, readState } from '../state';
import { FACTORY_DIR, OUT_DIR, TASK_DIR, type ChangeRequest, type Ctx } from '../types';
import { prBody, prGuide, prTitle } from './change-pr';
import { requestOfRecord } from './request-of-record';
import { RESUME_NOTE, agentHome, agentLog, fillPrompt, isResuming, prepareOutputs, readOutput, useOpenNetwork } from './common';

const CHANGE_BASE = 'main';

export const CHANGE_TASK_FILE = (id: number): string => `${TASK_DIR}/change-${id}.md`;

export async function change(ctx: Ctx, id: number): Promise<void> {
  const request = pendingChange(ctx, id);
  if (!request) throw new Error(`no pending factory change ${id}`);
  const dir = join(ctx.cfg.home, 'work', `change-${id}`);
  const branch = `factory-change/${id}`;
  const resuming = isResuming(ctx, id);
  if (!resuming) rmSync(dir, { recursive: true, force: true });
  await ctx.repo.fetch();
  await ctx.repo.prepareWorkClone(branch, CHANGE_BASE, dir);
  const home = agentHome(dir, FACTORY_DIR);
  prepareOutputs(ctx, id, home);
  writeFileSync(join(home, OUT_DIR, 'request.md'), `Committee request from ${request.by}:\n\n${requestOfRecord(request.words, request.text)}\n`);
  await runChangeAgent(ctx, id, dir, resuming);
  const head = await ctx.repo.fetchFromWork(dir, branch);
  if (!(await ctx.repo.hasNewCommits(CHANGE_BASE, head))) throw new Error(`change ${id} made no commits`);
  const paths = await ctx.repo.changedFiles(CHANGE_BASE, head);
  await ctx.repo.push(head, branch);
  const title = prTitle(readOutput(home, 'pr-title.txt'), id);
  const body = prBody(readOutput(home, 'pr-body.md'), request.by, request.text, paths);
  const url = await ctx.github.openPullRequest(branch, CHANGE_BASE, title, body);
  updateState(ctx.statePath, (state) => ({ ...state, pendingChanges: state.pendingChanges.filter((item) => item.id !== id) }));
  await answerOrigin(ctx, request, `Factory change ${id} is ready for review: ${url}`);
  ctx.log('change', id, `opened ${url}`);
}

async function answerOrigin(ctx: Ctx, request: ChangeRequest, text: string): Promise<number> {
  const { chat, messageId } = request.origin ?? { chat: ctx.cfg.committeeChat, messageId: null };
  if (messageId === null) return ctx.telegram.sendMessage(chat, text);
  try {
    return await ctx.telegram.sendMessage(chat, text, messageId);
  } catch (error) {
    ctx.log('change', request.id, `could not reply on the member message, so the answer goes to the chat: ${error instanceof Error ? error.message : String(error)}`);
    return ctx.telegram.sendMessage(chat, text);
  }
}

export function pendingChange(ctx: Ctx, id: number): ChangeRequest | undefined {
  return readState(ctx.statePath).pendingChanges.find((item) => item.id === id);
}

export async function tellChangeFailed(ctx: Ctx, request: ChangeRequest | undefined): Promise<void> {
  if (request === undefined) return;
  try {
    await answerOrigin(ctx, request, `Factory change ${request.id} failed and left the queue. Hermes is looking into it.`);
  } catch (error) {
    ctx.log('change', request.id, `could not tell the chat the change failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function runChangeAgent(ctx: Ctx, id: number, dir: string, resuming: boolean): Promise<void> {
  const session = roundSession(ctx.cfg.home, id, 'change', resuming);
  if (session.resume) ctx.log('change', id, `resuming round change, session ${session.id}`);
  const prompt = session.resume ? RESUME_NOTE : fillPrompt('change', { taskFile: CHANGE_TASK_FILE(id), prGuide: prGuide() });
  await ctx.container.agent({ clone: dir, dir: FACTORY_DIR, model: ctx.cfg.designModel, prompt, log: agentLog(ctx, id, 'change'), openNetwork: await useOpenNetwork(ctx, 'change', null), session });
}
