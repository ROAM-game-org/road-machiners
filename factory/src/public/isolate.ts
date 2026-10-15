import { reportFailure } from '../fail';
import type { Ctx } from '../types';

export async function isolated(ctx: Ctx, issue: number | null, what: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    await reportFailure(ctx, 'public', issue, `${what}: ${error instanceof Error ? error.message : String(error)}`, null, []);
  }
}
