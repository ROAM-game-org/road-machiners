import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import type { Decision, FilterInput } from './decision';
import { filterWith } from './filter';

type Outcome = 'file' | 'stay';
type Case = { label: 'keep' | 'drop'; from: string; text: string; clear?: boolean; origin?: FilterInput['origin']; source?: FilterInput['source']; parent?: string; context?: string; work?: string[]; addressed?: boolean; expect?: Outcome; relevance?: Decision['relevance'] };

const TARGET_ROUTING = 0.9;

const settings = parseEnv(readFileSync('settings.env', 'utf8'));
const key = process.env.OPENAI_API_KEY;
if (!key) throw new Error('Set OPENAI_API_KEY to run the filter eval.');
const classify = filterWith({ openaiKey: key, filterModel: String(settings.FACTORY_FILTER_MODEL), filterTimeoutSeconds: Number(settings.FACTORY_FILTER_TIMEOUT_SECONDS), filterJunkMin: Number(settings.FACTORY_FILTER_JUNK_MIN) }, fetch);
const cases = JSON.parse(readFileSync(new URL('./filter-eval.json', import.meta.url), 'utf8')) as Case[];

const sourceOf = (item: Case): FilterInput['source'] => item.source ?? 'report';

const originOf = (item: Case): FilterInput['origin'] => item.origin ?? (sourceOf(item) === 'report' ? 'game' : 'chat');

const inputOf = (item: Case): FilterInput => ({ origin: originOf(item), source: sourceOf(item), text: item.text, parent: item.parent, context: item.context, work: item.work, addressed: item.addressed });

const isReport = (decision: Decision): boolean => decision.verdict === 'accept' && (decision.kind === 'bug' || decision.kind === 'feature');

const isNewWork = (decision: Decision): boolean => decision.filing === true && decision.work === undefined && decision.relevance === 'other';

function outcomeOf(decision: Decision): Outcome {
  return isReport(decision) && isNewWork(decision) ? 'file' : 'stay';
}

type Tally = { realDropped: number; clearKept: number; junkCaught: number; junk: number };
const tallies: Record<FilterInput['origin'], Tally> = { game: { realDropped: 0, clearKept: 0, junkCaught: 0, junk: 0 }, chat: { realDropped: 0, clearKept: 0, junkCaught: 0, junk: 0 } };
const routing = { right: 0, all: 0, discussionFiled: 0 };

function count(tally: Tally, item: Case, dropped: boolean): void {
  if (item.label === 'keep') countReal(tally, dropped);
  else countJunk(tally, item, dropped);
}

function countReal(tally: Tally, dropped: boolean): void {
  if (dropped) tally.realDropped += 1;
}

function countJunk(tally: Tally, item: Case, dropped: boolean): void {
  tally.junk += 1;
  if (dropped) tally.junkCaught += 1;
  else if (item.clear === true) tally.clearKept += 1;
}

for (const item of cases) {
  const decision = await classify(inputOf(item));
  const dropped = decision.verdict === 'reject';
  count(tallies[originOf(item)], item, dropped);
  const outcome = item.expect === undefined ? null : outcomeOf(decision);
  if (item.expect !== undefined) {
    routing.all += 1;
    if (outcome === item.expect) routing.right += 1;
    else if (item.expect === 'stay') routing.discussionFiled += 1;
  }
  const related = item.relevance === undefined || decision.relevance === item.relevance;
  if (item.relevance !== undefined) {
    routing.all += 1;
    if (related) routing.right += 1;
  }
  const routed = outcome === null ? '' : ` ${outcome} work=${decision.work ?? 'none'} ${decision.language ?? ''}`;
  const relevance = item.relevance === undefined ? '' : ` relevance=${decision.relevance}`;
  const mark = dropped === (item.label === 'drop') && (outcome === null || outcome === item.expect) && related ? '  ' : 'XX';
  console.log(`${mark} ${item.label} ${decision.intent.padEnd(7)} sincere=${decision.sincere.toFixed(2)} ${decision.kind}${routed}${relevance}  ${item.from}: ${item.text.split('\n')[0]!.slice(0, 70)}`);
}

const passes = (tally: Tally): boolean => tally.realDropped === 0 && tally.clearKept === 0;
for (const [origin, tally] of Object.entries(tallies)) {
  console.log(`${origin}: real texts dropped ${tally.realDropped} (target 0), ads, gibberish and empty insults kept ${tally.clearKept} (target 0), junk caught ${tally.junkCaught}/${tally.junk}`);
}
const routed = routing.right / Math.max(1, routing.all);
console.log(`routing ${routing.right}/${routing.all} right (target ${TARGET_ROUTING}), discussion filed as a new issue ${routing.discussionFiled} (target 0)`);
process.exitCode = passes(tallies.game) && passes(tallies.chat) && routed >= TARGET_ROUTING && routing.discussionFiled === 0 ? 0 : 1;
