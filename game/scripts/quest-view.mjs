import { spawn, spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { checkpoint: { type: 'string' }, picks: { type: 'string' }, page: { type: 'string' }, lang: { type: 'string' } },
});
const [quest] = positionals;
if (!quest) throw new Error('Usage: npm run quest:view -- <quest> [--checkpoint <name>] [--picks 1,2] [--page 4] [--lang ru]');

const built = spawnSync('npx', ['vite-node', 'scripts/quests-build.mjs'], { stdio: 'inherit' });
if (built.status !== 0) process.exit(built.status ?? 1);

const params = new URLSearchParams({ play: '', quest });
if (values.checkpoint) params.set('checkpoint', values.checkpoint);
if (values.picks) params.set('picks', values.picks);
if (values.page) params.set('page', values.page);
if (values.lang) params.set('lang', values.lang);
const vite = spawn('npx', ['vite', '--open', `/?${params}`], { stdio: 'inherit' });
vite.on('exit', (code) => process.exit(code ?? 1));
