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

export function recordQuestionPost(statePath: string, postId: number, issue: number): void {
  updateState(statePath, (state) => ({ ...state, questionPosts: { ...state.questionPosts, [String(postId)]: issue } }));
}

export function questionPostIssue(statePath: string, postId: number): number | null {
  return readState(statePath).questionPosts[String(postId)] ?? null;
}

export function clearAsked(statePath: string, issue: number): void {
  updateState(statePath, (state) => ({
    ...state,
    asked: Object.fromEntries(Object.entries(state.asked).filter(([key]) => key !== String(issue))),
    questionPosts: Object.fromEntries(Object.entries(state.questionPosts).filter(([, asker]) => asker !== issue)),
  }));
}
