import { readState, updateState } from './state';
import type { PendingFeedback } from './types';

export function recordFeedback(statePath: string, issue: number, feedback: PendingFeedback): void {
  updateState(statePath, (state) => ({ ...state, pendingFeedback: { ...state.pendingFeedback, [String(issue)]: feedback } }));
}

export function pendingFeedback(statePath: string, issue: number): PendingFeedback | null {
  return readState(statePath).pendingFeedback[String(issue)] ?? null;
}

export function clearFeedback(statePath: string, issue: number): void {
  updateState(statePath, (state) => ({ ...state, pendingFeedback: Object.fromEntries(Object.entries(state.pendingFeedback).filter(([key]) => key !== String(issue))) }));
}
