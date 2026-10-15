import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    situation: { type: 'string' }, out: { type: 'string' }, screens: { type: 'string', default: '40' }, model: { type: 'string' },
    then: { type: 'string', multiple: true, default: [] }, set: { type: 'string', multiple: true, default: [] },
    skill: { type: 'string', multiple: true, default: [] },
    lang: { type: 'string', default: 'en' }, prompt: { type: 'string', default: 'docs/writing/playtest-prompt.md' },
  },
});
const quests = positionals;
if (quests.length === 0 || !values.situation || !values.out) {
  throw new Error('Usage: npm run quest:playtest -- <quest> [<next quest> ...] --situation "<what the player sees on arrival>" [--then "<what happens before the next quest>" ...] [--skill <skill>=<level> ...] --out tmp/<notes>.md');
}
if (values.then.length !== quests.length - 1) {
  throw new Error(`${quests.length} quests need ${quests.length - 1} --then lines, one before each quest after the first, got ${values.then.length}`);
}
const maxScreens = Number(values.screens);
if (!Number.isInteger(maxScreens) || maxScreens < 1) throw new Error(`--screens needs a whole number, got ${values.screens}`);

const work = mkdtempSync(join('tmp', 'playtest-'));
const promptTemplate = readFileSync(values.prompt, 'utf8');
if (!promptTemplate.includes('<SITUATION>')) throw new Error(`${values.prompt} has no <SITUATION> slot`);
const stepSchema = schemaFile('step', {
  summary: { type: 'string', description: 'One line: what this screen showed.' },
  comment: { type: 'string', description: 'Your critique of this screen by the rubric.' },
  pick: { type: 'integer', description: 'The number of the choice you take.' },
});
const CRITERIA = ['clarity', 'voice', 'choices', 'pull', 'consistency', 'prose'];
const rating = {
  type: 'object',
  properties: {
    score: { type: 'integer', description: 'From 1 to 5 by the scale in the rubric.' },
    reason: { type: 'string', description: 'Why this score and not one higher, with a quoted line.' },
  },
  required: ['score', 'reason'],
  additionalProperties: false,
};
const verdictSchema = schemaFile('verdict', {
  best: { type: 'array', items: { type: 'string' }, description: 'The three best things, each with a quoted line.' },
  worst: { type: 'array', items: { type: 'string' }, description: 'Up to five worst problems, each with a quoted line. List only real ones.' },
  verdict: { type: 'string', description: 'A short overall verdict.' },
  scores: { type: 'object', properties: Object.fromEntries(CRITERIA.map((c) => [c, rating])), required: CRITERIA, additionalProperties: false },
  to_five: { type: 'string', description: 'What would have to change for every criterion to score 5.' },
});

writeFileSync(values.out, `# Playtest of ${quests.join(', ')}\n\nSituation: ${values.situation}\n`);
let thread = null;
let run = 0;
let screens = 0;

let carried = null;
for (const [index, quest] of quests.entries()) {
  const last = index === quests.length - 1;
  const from = carried;
  let restarted = false;
  while (screens < maxScreens) {
    run += 1;
    const runFile = join(work, `run-${run}.json`);
    carried = runFile;
    let screen = game(quest, runFile, null, from);
    if (index > 0 && !restarted) screen = `Time passes. ${values.then[index - 1]}\n\n${screen}`;
    appendFileSync(values.out, `\n## Run ${run}: ${quest}\n`);
    while (screens < maxScreens) {
      screens += 1;
      const ended = screen.includes('(the story ends here)');
      const ask = ended ? `${screen}\n\n${endNote(last, restarted)}` : `${screen}\n\nJudge this screen, then pick one of the numbered choices.`;
      const step = player(screens === 1 ? `${promptTemplate.replace('<SITUATION>', values.situation)}\n\nHere is the first screen.\n\n${ask}` : ask, stepSchema);
      appendFileSync(values.out, `\n### Screen ${screens}\n\n${quoted(screen)}\n\nSummary: ${step.summary}\n\nComment: ${step.comment}\n\nPick: ${step.pick}\n`);
      if (ended) break;
      screen = game(quest, runFile, step.pick, from);
    }
    if (!last || restarted || !screen.includes('(the story ends here)') || screens >= maxScreens) break;
    restarted = true;
  }
}

function endNote(last, restarted) {
  if (!last) return 'This part of the story ended, and the next part follows. Judge this last screen. Pick 0.';
  return `The story ended. Judge this last screen. ${restarted ? 'Pick 0.' : 'Pick 1 to start over and take a different road, or 0 to stop.'}`;
}

const verdict = player('You are done playing. Give your overall verdict on the writing across everything you saw. Score each criterion of the rubric from 1 to 5 by its scale.', verdictSchema);
const scores = CRITERIA.map((c) => [c, verdict.scores[c].score]);
const bad = scores.filter(([, s]) => !Number.isInteger(s) || s < 1 || s > 5);
if (bad.length > 0) throw new Error(`The verdict scores must be whole numbers from 1 to 5, got ${bad.map(([c, s]) => `${c} ${s}`).join(', ')}`);
const score = Math.min(...scores.map(([, s]) => s));
const scoreLine = scores.map(([c, s]) => `${c} ${s}`).join(', ');
const ratings = CRITERIA.map((c) => `- ${c} ${verdict.scores[c].score}: ${verdict.scores[c].reason}`).join('\n');
appendFileSync(values.out, `\n## Verdict\n\nScore: ${score}/5, the lowest of ${scoreLine}\n\n${verdict.verdict}\n\nScores:\n${ratings}\n\nBest:\n${verdict.best.map((b) => `- ${b}`).join('\n')}\n\nWorst:\n${verdict.worst.map((w) => `- ${w}`).join('\n')}\n\nTo reach 5:\n${verdict.to_five}\n`);
console.log(`Score ${score}/5, the lowest of ${scoreLine}, after ${screens} screens. Notes in ${values.out}`);

function game(quest, runFile, pick, from) {
  const args = ['scripts/quest.mjs', quest, '--lang', values.lang, '--play', runFile, ...(from === null ? [] : ['--from', from]),...values.set.flatMap((s) => ['--set', s]), ...values.skill.flatMap((s) => ['--skill', s]), ...(pick === null ? [] : ['--pick', String(pick)])];
  const result = spawnSync('node_modules/.bin/vite-node', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`The quest runner failed on pick ${pick}:\n${result.stderr}`);
  return result.stdout.trim();
}

function player(prompt, schema) {
  return values.lang === 'ru' ? agy(prompt, schema) : codex(prompt, schema);
}

function agyArgs(prompt, schema) {
  const conversation = thread === null ? [] : ['--conversation', thread];
  const model = values.model ? ['--model', values.model] : [];
  return ['--output-format', 'json', '--json-schema', resolve(schema), ...conversation, ...model, '-p', prompt];
}

function agy(prompt, schema) {
  const result = spawnSync('agy', agyArgs(prompt, schema), { cwd: work, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`agy failed:\n${result.stderr.slice(-2000)}`);
  const output = JSON.parse(result.stdout);
  if (!output.structured_output) throw new Error(`agy gave no answer: ${output.error ?? result.stdout.slice(-2000)}`);
  thread ??= output.conversation_id;
  return output.structured_output;
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
