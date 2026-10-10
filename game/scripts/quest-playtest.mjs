import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { situation: { type: 'string' }, out: { type: 'string' }, screens: { type: 'string', default: '40' }, model: { type: 'string' } },
});
const quest = positionals[0];
if (!quest || !values.situation || !values.out) {
  throw new Error('Usage: npm run quest:playtest -- <quest> --situation "<what the player sees on arrival>" --out tmp/<notes>.md');
}
const maxScreens = Number(values.screens);
if (!Number.isInteger(maxScreens) || maxScreens < 1) throw new Error(`--screens needs a whole number, got ${values.screens}`);

const work = mkdtempSync(join('tmp', 'playtest-'));
const promptTemplate = readFileSync('docs/quest-playtest-prompt.md', 'utf8');
const stepSchema = schemaFile('step', {
  summary: { type: 'string', description: 'One line: what this screen showed.' },
  comment: { type: 'string', description: 'Your critique of this screen by the rubric.' },
  pick: { type: 'integer', description: 'The number of the choice you take.' },
});
const verdictSchema = schemaFile('verdict', {
  best: { type: 'array', items: { type: 'string' }, description: 'The three best things, each with a quoted line.' },
  worst: { type: 'array', items: { type: 'string' }, description: 'The five worst problems, each with a quoted line.' },
  verdict: { type: 'string', description: 'A short overall verdict.' },
  score: { type: 'integer', description: 'Score out of 10.' },
});

writeFileSync(values.out, `# Playtest of ${quest}\n\nSituation: ${values.situation}\n`);
let thread = null;
let run = 0;
let screens = 0;
let restarted = false;

while (screens < maxScreens) {
  run += 1;
  const runFile = join(work, `run-${run}.json`);
  let screen = game(runFile, null);
  appendFileSync(values.out, `\n## Run ${run}\n`);
  while (screens < maxScreens) {
    screens += 1;
    const ended = screen.includes('(the story ends here)');
    const ask = ended
      ? `${screen}\n\nThe story ended. Judge this last screen. ${restarted ? 'Pick 0.' : 'Pick 1 to start over and take a different road, or 0 to stop.'}`
      : `${screen}\n\nJudge this screen, then pick one of the numbered choices.`;
    const step = codex(screens === 1 ? `${promptTemplate.replace('<SITUATION>', values.situation)}\n\nHere is the first screen.\n\n${ask}` : ask, stepSchema);
    appendFileSync(values.out, `\n### Screen ${screens}\n\n${quoted(screen)}\n\nSummary: ${step.summary}\n\nComment: ${step.comment}\n\nPick: ${step.pick}\n`);
    if (ended) break;
    screen = game(runFile, step.pick);
  }
  if (restarted || !screen.includes('(the story ends here)') || screens >= maxScreens) break;
  restarted = true;
}

const verdict = codex('You are done playing. Give your overall verdict on the writing across everything you saw.', verdictSchema);
appendFileSync(values.out, `\n## Verdict\n\nScore: ${verdict.score}/10\n\n${verdict.verdict}\n\nBest:\n${verdict.best.map((b) => `- ${b}`).join('\n')}\n\nWorst:\n${verdict.worst.map((w) => `- ${w}`).join('\n')}\n`);
console.log(`Score ${verdict.score}/10 after ${screens} screens. Notes in ${values.out}`);

function game(runFile, pick) {
  const args = ['scripts/quest.mjs', quest, '--play', runFile, ...(pick === null ? [] : ['--pick', String(pick)])];
  const result = spawnSync('node_modules/.bin/vite-node', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`The quest runner failed on pick ${pick}:\n${result.stderr}`);
  return result.stdout.trim();
}

function codex(prompt, schema) {
  const last = join(work, 'last.json');
  const common = ['--skip-git-repo-check', '--output-schema', schema, '-o', last, ...(values.model ? ['-m', values.model] : [])];
  const args = thread === null
    ? ['exec', '--json', '-s', 'read-only', ...common, '-']
    : ['exec', 'resume', thread, '--json', ...common, '-'];
  const result = spawnSync('codex', args, { input: prompt, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`codex failed:\n${result.stderr.slice(-2000)}`);
  thread ??= threadId(result.stdout);
  return JSON.parse(readFileSync(last, 'utf8'));
}

function threadId(events) {
  const started = events.split('\n').filter(Boolean).map((line) => JSON.parse(line)).find((event) => event.type === 'thread.started');
  if (!started) throw new Error('codex reported no thread id');
  return started.thread_id;
}

function schemaFile(name, properties) {
  const file = join(work, `${name}.schema.json`);
  writeFileSync(file, JSON.stringify({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false }));
  return file;
}

function quoted(text) {
  return text.split('\n').map((line) => `> ${line}`).join('\n');
}
