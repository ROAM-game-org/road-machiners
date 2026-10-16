import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import type { Decision, FilterInput } from './decision';
import { filterWith } from './filter';

type Outcome = 'file' | 'stay';
type Case = { label: 'keep' | 'drop'; from: string; text: string; source?: FilterInput['source']; parent?: string; context?: string; work?: string[]; addressed?: boolean; expect?: Outcome };

const TARGET_RECALL = 0.99;
const TARGET_F1 = 0.9;
const TARGET_ROUTING = 0.9;

const settings = parseEnv(readFileSync('settings.env', 'utf8'));
const key = process.env.OPENAI_API_KEY;
if (!key) throw new Error('Set OPENAI_API_KEY to run the filter eval.');
const classify = filterWith({ openaiKey: key, filterModel: String(settings.FACTORY_FILTER_MODEL), filterTimeoutSeconds: Number(settings.FACTORY_FILTER_TIMEOUT_SECONDS), filterSincereMin: Number(settings.FACTORY_FILTER_SINCERE_MIN) }, fetch);
const cases = JSON.parse(readFileSync(new URL('./filter-eval.json', import.meta.url), 'utf8')) as Case[];

const inputOf = (item: Case): FilterInput => ({ source: item.source ?? 'report', text: item.text, parent: item.parent, context: item.context, work: item.work, addressed: item.addressed });

const isReport = (decision: Decision): boolean => decision.verdict === 'accept' && (decision.kind === 'bug' || decision.kind === 'feature');

const isNewWork = (decision: Decision): boolean => decision.filing === true && decision.work === undefined && decision.relevance === 'other';

function outcomeOf(decision: Decision): Outcome {
  return isReport(decision) && isNewWork(decision) ? 'file' : 'stay';
}

const counts = { caught: 0, missed: 0, wrong: 0 };
const routing = { right: 0, all: 0, discussionFiled: 0 };
for (const item of cases) {
  const decision = await classify(inputOf(item));
  const dropped = decision.verdict === 'reject';
  if (item.label === 'drop') counts[dropped ? 'caught' : 'missed'] += 1;
  else if (dropped) counts.wrong += 1;
  const outcome = item.expect === undefined ? null : outcomeOf(decision);
  if (item.expect !== undefined) {
    routing.all += 1;
    if (outcome === item.expect) routing.right += 1;
    else if (item.expect === 'stay') routing.discussionFiled += 1;
  }
  const routed = outcome === null ? '' : ` ${outcome} work=${decision.work ?? 'none'} ${decision.language ?? ''}`;
  const mark = dropped === (item.label === 'drop') && (outcome === null || outcome === item.expect) ? '  ' : 'XX';
  console.log(`${mark} ${item.label} ${decision.intent.padEnd(7)} sincere=${decision.sincere.toFixed(2)} ${decision.kind}${routed}  ${item.from}: ${item.text.split('\n')[0]!.slice(0, 70)}`);
}

const recall = counts.caught / (counts.caught + counts.missed);
const precision = counts.caught / (counts.caught + counts.wrong);
const f1 = (2 * precision * recall) / (precision + recall);
const routed = routing.right / Math.max(1, routing.all);
console.log(`drop recall ${recall.toFixed(3)} (target ${TARGET_RECALL}), precision ${precision.toFixed(3)}, F1 ${f1.toFixed(3)} (target ${TARGET_F1})`);
console.log(`routing ${routing.right}/${routing.all} right (target ${TARGET_ROUTING}), discussion filed as a new issue ${routing.discussionFiled} (target 0)`);
process.exitCode = recall >= TARGET_RECALL && f1 >= TARGET_F1 && routed >= TARGET_ROUTING && routing.discussionFiled === 0 ? 0 : 1;
