import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fillPrompt, promptFile } from './common';

const PROMPTS = fileURLToPath(new URL('../../prompts/', import.meta.url));
const GAME_STAGES = ['triage', 'design', 'implement', 'test', 'integrate', 'harden', 'merge-fix', 'merge-branches', 'branch-merge', 'revert-merge', 'ship-fix', 'release', 'release-playtest', 'incident', 'adhoc'];
const FACTORY_STAGES = ['change', 'waste'];
const NO_DOCS_STEP = [...FACTORY_STAGES, 'game-docs', 'design-bug', 'change-pr', 'filter-game', 'release-janitor', 'release-optimize', 'release-playtest-replay', 'release-playtest-checks'];
const STEP_LINE = /^(- )?(Read|Run|Install|Find|Score|Fix|Write)\b/m;

function filled(name: string): string {
  const raw = readFileSync(`${PROMPTS}${name}.md`, 'utf8');
  const vars = Object.fromEntries([...raw.matchAll(/\{\{(\w+)\}\}/g)].map(([, key]) => [key, `<${key}>`]));
  return fillPrompt(name, vars);
}

describe('the game docs step', () => {
  const docs = promptFile('game-docs');

  it('names the game docs, the index and the rule to keep docs in step with fixes', () => {
    expect(docs).toContain('Read CLAUDE.md and docs/DESIGN.md in full.');
    expect(docs).toContain('The Docs list in CLAUDE.md is the index of the game docs.');
    expect(docs).toContain('Skip the docs that do not cover the task.');
    expect(docs).toContain('update that doc in the same commit');
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

  it.each(FACTORY_STAGES)('stays out of the %s prompt, which works on the factory', (name) => {
    expect(filled(name)).not.toContain(docs);
  });
});
