import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { filterWith } from './filter';

type Case = { label: 'keep' | 'drop'; from: string; text: string };

const TARGET_RECALL = 0.99;
const TARGET_F1 = 0.9;

const settings = parseEnv(readFileSync('settings.env', 'utf8'));
const key = process.env.OPENAI_API_KEY;
if (!key) throw new Error('Set OPENAI_API_KEY to run the filter eval.');
const classify = filterWith({ openaiKey: key, filterModel: String(settings.FACTORY_FILTER_MODEL), filterTimeoutSeconds: Number(settings.FACTORY_FILTER_TIMEOUT_SECONDS), filterSincereMin: Number(settings.FACTORY_FILTER_SINCERE_MIN) }, fetch);
const cases = JSON.parse(readFileSync(new URL('./filter-eval.json', import.meta.url), 'utf8')) as Case[];

const counts = { caught: 0, missed: 0, wrong: 0 };
for (const item of cases) {
  const decision = await classify({ source: 'report', text: item.text });
  const dropped = decision.verdict === 'reject';
  if (item.label === 'drop') counts[dropped ? 'caught' : 'missed'] += 1;
  else if (dropped) counts.wrong += 1;
  const mark = dropped === (item.label === 'drop') ? '  ' : 'XX';
  console.log(`${mark} ${item.label} ${decision.intent.padEnd(7)} sincere=${decision.sincere.toFixed(2)}  ${item.from}: ${item.text.split('\n')[0].slice(0, 70)}`);
}

const recall = counts.caught / (counts.caught + counts.missed);
const precision = counts.caught / (counts.caught + counts.wrong);
const f1 = (2 * precision * recall) / (precision + recall);
console.log(`drop recall ${recall.toFixed(3)} (target ${TARGET_RECALL}), precision ${precision.toFixed(3)}, F1 ${f1.toFixed(3)} (target ${TARGET_F1})`);
process.exitCode = recall >= TARGET_RECALL && f1 >= TARGET_F1 ? 0 : 1;
