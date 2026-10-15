import { mkdirSync, mkdtempSync } from 'node:fs';
import { EMPTY_STATE, writeState } from '../state';
import { VOTING_LABEL, type Card, type Ctx, type Column, type FactoryConfig } from '../types';
import type { Classify, PublicFilter } from './decision';
import { openStore, type PublicStore } from './store';
import type { Ground } from './wiki';

export type SentMessage = { chat: string; text: string; replyTo: number | null | undefined };

export type PublicFake = {
  ctx: Ctx;
  store: PublicStore;
  home: string;
  calls: string[];
  comments: { issue: number; body: string }[];
  created: { title: string; body: string; labels: string[] }[];
  messages: SentMessage[];
  edits: string[];
  logs: string[];
  clock: { now: Date };
  issueState: Record<number, 'OPEN' | 'CLOSED'>;
  issueLabels: Record<number, string[]>;
  cards: Card[];
};

export const COMMITTEE = 'committee';
export const CHANNEL = '-100channel';

export function publicFake(overrides: Partial<FactoryConfig> = {}): PublicFake {
  mkdirSync('tmp', { recursive: true });
  const home = mkdtempSync('tmp/factory-public-');
  const statePath = `${home}/state.json`;
  writeState(statePath, structuredClone(EMPTY_STATE));
  const f = { home, calls: [], comments: [], created: [], messages: [], edits: [], logs: [], clock: { now: new Date('2026-10-14T10:00:00Z') }, issueState: {}, issueLabels: {}, cards: [] } as unknown as PublicFake;
  f.store = openStore(home);
  const note = (text: string) => { f.calls.push(text); };
  f.ctx = {
    cfg: { home, repo: 'o/r', committeeChat: COMMITTEE, proposalChat: CHANNEL, proposalsPerDay: 2, minVotes: 3, voteEmoji: '👍 ❤', vetoEmoji: '👎', publicDigestMinutes: 60, filterPerTick: 10, reportIpPerHour: 5, committeeBootstrapTelegram: '42', committeeBootstrapGithub: 'boss', ...overrides } as FactoryConfig,
    statePath,
    now: () => f.clock.now,
    log: (stage: string, issue: number | null, msg: string) => { f.logs.push(`${stage} ${issue} ${msg}`); },
    github: {
      issue: async (number: number) => { note(`issue ${number}`); return { number, title: `T${number}`, body: '', labels: f.issueLabels[number] ?? [VOTING_LABEL], createdAt: '', state: f.issueState[number] ?? 'OPEN' }; },
      cards: async () => f.cards,
      comment: async (issue: number, body: string) => { note(`comment ${issue}`); f.comments.push({ issue, body }); },
      createIssue: async (title: string, body: string, labels: string[]) => { note('createIssue'); f.created.push({ title, body, labels }); return 600 + f.created.length; },
      removeLabel: async (issue: number, label: string) => note(`removeLabel ${issue} ${label}`),
      addLabel: async (issue: number, label: string) => note(`addLabel ${issue} ${label}`),
      close: async (issue: number, reason: string) => note(`close ${issue} ${reason}`),
      move: async (issue: number, column: Column) => note(`move ${issue} ${column}`),
    },
    telegram: {
      sendMessage: async (chat: string, text: string, replyTo?: number | null) => { note('sendMessage'); f.messages.push({ chat, text, replyTo }); return 500 + f.messages.length; },
      editText: async (_chat: string, id: number, text: string) => { f.edits.push(`${id} ${text}`); },
      sendHtml: async (chat: string, text: string) => { note('sendHtml'); f.messages.push({ chat, text, replyTo: undefined }); return 500 + f.messages.length; },
      editHtml: async (_chat: string, id: number, text: string) => { f.edits.push(`${id} ${text}`); },
      editCaption: async (_chat: string, id: number, text: string) => { f.edits.push(`${id} ${text}`); },
    },
  } as unknown as Ctx;
  return f;
}

export const filterOf = (classify: Classify, ground: Ground = async () => null): PublicFilter => ({ classify, ground });
