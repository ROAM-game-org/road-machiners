import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fillPrompt, promptFile } from './common';

const PROMPTS = fileURLToPath(new URL('../../prompts/', import.meta.url));
const GAME_STAGES = ['triage', 'groom', 'design', 'implement', 'test', 'integrate', 'harden', 'merge-fix', 'merge-branches', 'branch-merge', 'revert-merge', 'ship-fix', 'release-playtest', 'incident', 'adhoc', 'release', 'answer'];
const FACTORY_STAGES = ['waste'];
const FIX_STAGES = ['test', 'integrate', 'harden', 'merge-fix', 'ship-fix', 'release-playtest'];
const WRITING_STAGES = ['groom', 'design', 'implement', 'release', 'answer'];
const NO_DOCS_STEP = [...FACTORY_STAGES, 'game-docs', 'fix-docs', 'writing', 'humanizer', 'design-bug', 'filter-game', 'release-janitor', 'release-optimize', 'release-playtest-replay', 'release-playtest-checks'];
const STEP_LINE = /^(- )?(Read|Run|Install|Find|Score|Fix|Write|Check|Open|Create|Resolve|Play|Look|Build|Take|Use|Start|Compare)\b/m;

function filled(name: string): string {
  const raw = readFileSync(`${PROMPTS}${name}.md`, 'utf8');
  const vars = Object.fromEntries([...raw.matchAll(/\{\{(\w+)\}\}/g)].map(([, key]) => [key, `<${key}>`]));
  return fillPrompt(name, vars);
}

describe('the game docs step', () => {
  const docs = promptFile('game-docs');

  it('names the game docs and the index, and asks for no edit, so read-only stages keep their rules', () => {
    expect(docs).toContain('Read CLAUDE.md and docs/DESIGN.md in full.');
    expect(docs).toContain('The Docs list in CLAUDE.md is the index of the game docs.');
    expect(docs).toContain('Skip the docs that do not cover the task.');
    expect(docs).not.toMatch(/commit|update/i);
  });

  it('sorts every prompt into game stages or prompts with no docs step', () => {
    const names = readdirSync(PROMPTS).filter((file) => file.endsWith('.md')).map((file) => file.slice(0, -3));
    expect(names.filter((name) => !GAME_STAGES.includes(name) && !NO_DOCS_STEP.includes(name))).toEqual([]);
  });

  it.each(GAME_STAGES)('comes first in the %s prompt, before any other step', (name) => {
    const text = filled(name);
    const at = text.indexOf(docs);
    expect(at).toBeGreaterThan(0);
    expect(text.slice(0, at)).not.toMatch(STEP_LINE);
    expect(text.indexOf(docs, at + 1)).toBe(-1);
  });

  it.each(GAME_STAGES.filter((name) => readFileSync(`${PROMPTS}${name}.md`, 'utf8').includes('npm ci')))('keeps npm ci right after the docs step and before any check in the %s prompt', (name) => {
    const text = filled(name);
    const end = text.indexOf(docs) + docs.length;
    const npm = text.indexOf('npm ci', end);
    expect(npm).toBeGreaterThan(-1);
    expect(text.slice(end, npm)).not.toMatch(/npx vitest|npm run typecheck|npm test/);
    expect(text).toMatch(/(Run `npm ci`|Install the hooks) right after the docs step, before any code, test or check\./);
  });
});

describe('the docs rule of a fix', () => {
  const rule = promptFile('fix-docs');

  it.each(FIX_STAGES)('follows the commit of a fix in the %s prompt', (name) => {
    const text = filled(name);
    expect(text.indexOf(rule)).toBeGreaterThan(text.search(/[Cc]ommit (each fix|the fix)/));
  });

  it.each(GAME_STAGES.filter((name) => !FIX_STAGES.includes(name)))('stays out of the %s prompt, which fixes nothing or ends with its own docs pass', (name) => {
    expect(filled(name)).not.toContain(rule);
  });
});

describe('the writing rules', () => {
  const humanizer = promptFile('humanizer');

  it('keep the Writing Humanizer verbatim from its source', () => {
    const [header, ...body] = readFileSync(`${PROMPTS}humanizer.md`, 'utf8').split('\n');
    expect(header).toContain('https://www.jayceelydian.com/prompts/humanizer/');
    expect(header).toContain('CC0 1.0');
    expect(createHash('sha256').update(body.join('\n')).digest('hex')).toBe('6f179fcab9aa094da0bb509c5af02626da20a41bfbadcda6d570bc562ede9eac');
    expect(body[0]).toBe('# Writing Humanizer');
  });

  it.each(WRITING_STAGES)('reach the %s prompt once, after the docs step', (name) => {
    const text = filled(name);
    expect(text.indexOf(humanizer)).toBeGreaterThan(text.indexOf(promptFile('game-docs')));
    expect(text.indexOf(humanizer, text.indexOf(humanizer) + 1)).toBe(-1);
    expect(text).toContain('Keep the established voice');
  });

  it.each(GAME_STAGES.filter((name) => !WRITING_STAGES.includes(name)))('stay out of the %s prompt, which writes no player-facing prose', (name) => {
    expect(filled(name)).not.toContain(humanizer);
  });
});
