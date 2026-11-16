import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import type { Decision, FilterInput } from './decision';
import { filterWith } from './filter';

type Case = { label: 'keep' | 'drop'; from: string; text: string; clear?: boolean; source?: FilterInput['source']; parent?: string; relevance?: Decision['relevance'] };

const TARGET_ROUTING = 0.9;

const settings = parseEnv(readFileSync('settings.env', 'utf8'));
const key = process.env.OPENAI_API_KEY;
if (!key) throw new Error('Set OPENAI_API_KEY to run the filter eval.');
const classify = filterWith({ openaiKey: key, filterModel: String(settings.FACTORY_FILTER_MODEL), filterTimeoutSeconds: Number(settings.FACTORY_FILTER_TIMEOUT_SECONDS), filterJunkMin: Number(settings.FACTORY_FILTER_JUNK_MIN) }, fetch);
const cases = JSON.parse(readFileSync(new URL('./filter-eval.json', import.meta.url), 'utf8')) as Case[];

const inputOf = (item: Case): FilterInput => ({ source: item.source ?? 'report', text: item.text, parent: item.parent });

const tally = { realDropped: 0, clearKept: 0, junkCaught: 0, junk: 0 };
const routing = { right: 0, all: 0 };

function count(item: Case, dropped: boolean): void {
  if (item.label === 'keep') countReal(dropped);
  else countJunk(item, dropped);
}

function countReal(dropped: boolean): void {
  if (dropped) tally.realDropped += 1;
}

function countJunk(item: Case, dropped: boolean): void {
  tally.junk += 1;
  if (dropped) tally.junkCaught += 1;
  else if (item.clear === true) tally.clearKept += 1;
}

for (const item of cases) {
  const decision = await classify(inputOf(item));
  const dropped = decision.verdict === 'reject';
  count(item, dropped);
  const related = item.relevance === undefined || decision.relevance === item.relevance;
  if (item.relevance !== undefined) {
    routing.all += 1;
    if (related) routing.right += 1;
  }
  const relevance = item.relevance === undefined ? '' : ` relevance=${decision.relevance}`;
  const mark = dropped === (item.label === 'drop') && related ? '  ' : 'XX';
  console.log(`${mark} ${item.label} ${decision.intent.padEnd(7)} sincere=${decision.sincere.toFixed(2)} ${decision.kind}${relevance}  ${item.from}: ${item.text.split('\n')[0]!.slice(0, 70)}`);
}

console.log(`game: real texts dropped ${tally.realDropped} (target 0), ads, gibberish and empty insults kept ${tally.clearKept} (target 0), junk caught ${tally.junkCaught}/${tally.junk}`);
const routed = routing.right / Math.max(1, routing.all);
console.log(`relevance ${routing.right}/${routing.all} right (target ${TARGET_ROUTING})`);
process.exitCode = tally.realDropped === 0 && tally.clearKept === 0 && routed >= TARGET_ROUTING ? 0 : 1;
