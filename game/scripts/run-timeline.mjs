import { readFileSync } from 'node:fs';
import { skippedBeforeSession, timeline } from '../src/sim/progression/run-timeline.ts';

const USAGE = 'Usage: npm run run:timeline -- <log.jsonl> [--by day|stretch]';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const byAt = argv.indexOf('--by');
const by = byAt < 0 ? 'day' : argv[byAt + 1];
if (by !== 'day' && by !== 'stretch') throw new Error(`--by takes day or stretch. ${USAGE}`);
const files = byAt < 0 ? argv : argv.filter((_, i) => i !== byAt && i !== byAt + 1);
if (files.length !== 1) throw new Error(`Give exactly one log file. ${USAGE}`);

const records = readFileSync(files[0], 'utf8').split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line));
const skipped = skippedBeforeSession(records);
if (skipped > 0) console.log(`Skipped ${skipped} records before the first session line. They come from a build before the run stream.`);
console.log(timeline(records, by).join('\n'));
