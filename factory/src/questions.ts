import { readState, updateState } from './state';
import type { IssueComment } from './types';

export function isAnswered(comments: IssueComment[], askedAt: string): boolean {
  const asked = Date.parse(askedAt);
  return comments.some((comment) => !comment.byFactory && Date.parse(comment.createdAt) > asked);
}

export function askedAt(statePath: string, issue: number): string | null {
  return readState(statePath).asked[String(issue)] ?? null;
}

export function recordAsked(statePath: string, issue: number, at: string): void {
  updateState(statePath, (state) => ({ ...state, asked: { ...state.asked, [String(issue)]: at } }));
}

export function clearAsked(statePath: string, issue: number): void {
  updateState(statePath, (state) => ({ ...state, asked: Object.fromEntries(Object.entries(state.asked).filter(([key]) => key !== String(issue))) }));
}
