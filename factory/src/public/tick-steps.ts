import { reportFailure } from '../fail';
import type { Ctx } from '../types';
import { postProposal } from './proposals';
import { classifyComments } from './classify-comments';
import type { PublicFilter } from './decision';
import { sendDigests } from './digest';
import { fileComments } from './file-comments';
import { ingest } from './ingest';
import { sendReplies } from './replies';
import { routeReports } from './routes';
import { openStore, type PublicStore } from './store';
import { countVotes } from './votes';

type Step = (ctx: Ctx, store: PublicStore, filter: PublicFilter) => Promise<void>;

const STEPS: Step[] = [
  ingest,
  classifyComments,
  postProposal,
  countVotes,
  fileComments,
  sendDigests,
  routeReports,
  sendReplies,
];

export async function publicTick(ctx: Ctx, filter: PublicFilter): Promise<void> {
  const store = openStore(ctx.cfg.home);
  try {
    for (const step of STEPS) {
      try {
        await step(ctx, store, filter);
      } catch (error) {
        await reportFailure(ctx, 'public', null, error, null, []);
      }
    }
  } finally {
    store.close();
  }
}
