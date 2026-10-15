import { updateState } from '../state';
import type { Ctx } from '../types';

export function queueAnswer(ctx: Ctx, id: number): void {
  updateState(ctx.statePath, (state) => (state.pendingAnswers.includes(id) ? state : { ...state, pendingAnswers: [...state.pendingAnswers, id] }));
  ctx.log('public', null, `player question ${id} waits for the answer job`);
}

export function dequeueAnswer(ctx: Ctx, id: number): void {
  updateState(ctx.statePath, (state) => ({ ...state, pendingAnswers: state.pendingAnswers.filter((item) => item !== id) }));
}
