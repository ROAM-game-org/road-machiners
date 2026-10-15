import { updateState } from '../state';
import type { Ctx } from '../types';

export function queueAnswer(ctx: Ctx, id: number): void {
  updateState(ctx.statePath, (state) => (state.pendingAnswers.includes(id) ? state : { ...state, pendingAnswers: [...state.pendingAnswers, id] }));
  ctx.log('public', null, `player comment ${id} waits for an answer job`);
}

export async function answerNext(_ctx: Ctx): Promise<void> {
  throw new Error('The answer job is not built yet.');
}
