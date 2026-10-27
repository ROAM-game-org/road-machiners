import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { dockerContainer } from './container';
import { fillPrompt, runAgent } from './stages/common';
import type { AgentRun, Ctx, FactoryConfig, Run } from './types';

const ROOT = resolve('..');
const read = (path: string): string => readFileSync(`${ROOT}/${path}`, 'utf8');
const STAGES = resolve('src/stages');

const CODEX = 'timeout 900 codex exec -o tmp/ru-reply.md - < tmp/ru-request.md';
const SONNET = 'timeout 900 claude -p --model sonnet --tools Read,Grep,Glob --no-session-persistence < tmp/ru-request.md';

describe('the Russian writer fallback instruction', () => {
  const claudeMd = read('game/CLAUDE.md');
  const style = read('game/docs/russian-style.md');

  it('is in game/CLAUDE.md, which Claude Code loads from the agent folder, with agy first and the exact commands', () => {
    const line = claudeMd.split('\n').find((text) => text.startsWith('- `src/text/` owns all player text')) as string;
    expect(line).toContain('agy writes all Russian text');
    expect(line.indexOf('agy')).toBeLessThan(line.indexOf(CODEX));
    expect(line.indexOf(CODEX)).toBeLessThan(line.indexOf(SONNET));
    expect(line).toContain('A writer that fails on the request itself is not unavailable');
  });

  it('gives the same commands in the Russian copy doc that CLAUDE.md links', () => {
    expect(claudeMd).toContain('(docs/russian-style.md)');
    expect(style).toContain(CODEX);
    expect(style).toContain(SONNET);
    expect(style).toContain('`run N exceeds AGY_MAX_RUNS`');
    expect(style).toContain('Do not raise the limit');
  });

  it('keeps every catalog gate and forbids English placeholders', () => {
    expect(style).toContain('the catalog test, the scan for untranslated text and `npm run text:review`');
    expect(style).toContain('never copy the English in as a placeholder, and never relax a check');
  });
});

describe('how the instruction reaches an agent', () => {
  const gameStages = readdirSync(`${STAGES}/../../prompts`).filter((file) => readFileSync(`${STAGES}/../../prompts/${file}`, 'utf8').includes('{{gameDocs}}')).map((file) => file.slice(0, -3));

  it('starts every game stage prompt with the step that reads game CLAUDE.md in full', () => {
    expect(gameStages).toEqual(expect.arrayContaining(['implement', 'test', 'integrate', 'harden', 'groom', 'design', 'release-playtest', 'release', 'adhoc', 'incident', 'merge-fix', 'merge-branches', 'branch-merge', 'ship-fix', 'revert-merge', 'triage']));
    for (const name of gameStages) {
      const vars = Object.fromEntries([...readFileSync(`${STAGES}/../../prompts/${name}.md`, 'utf8').matchAll(/\{\{(\w+)\}\}/g)].map(([, key]) => [key, `<${key}>`]));
      expect(fillPrompt(name, vars), name).toContain('Read CLAUDE.md and docs/DESIGN.md in full.');
    }
  });

  it('runs every agent in game/ except the factory waste review, and only the answer agent has public output', () => {
    const calls = readdirSync(STAGES).filter((file) => file.endsWith('.ts') && !file.includes('.test.') && file !== 'test-fakes.ts').flatMap((file) => readFileSync(`${STAGES}/${file}`, 'utf8').split('\n').filter((line) => line.includes('container.agent(')).map((line) => ({ file, line })));
    expect(calls.length).toBeGreaterThan(8);
    expect(calls.filter(({ line }) => !line.includes('dir: GAME_DIR')).map(({ file }) => file)).toEqual(['waste.ts']);
    expect(calls.filter(({ line }) => line.includes('publicOutput')).map(({ file }) => file)).toEqual(['answer.ts']);
  });

  it('gives runAgent stages the game folder and no public output', async () => {
    const runs: AgentRun[] = [];
    const ctx = {
      cfg: { home: 'tmp/factory-russian-fallback-test', designModel: 'd', buildModel: 'b', triageModel: 't', advisorModel: 'a' },
      github: { issue: async () => ({ labels: [], body: '' }), comments: async () => [] },
      run: async () => ({ code: 0, stdout: 'tok\n', stderr: '' }),
      container: { agent: async (run: AgentRun) => { runs.push(run); } },
      log: () => undefined,
    } as unknown as Ctx;
    for (const stage of ['implement', 'verify', 'design', 'harden', 'triage'] as const) await runAgent(ctx, 7, stage, stage, 'p');
    expect(runs.map((run) => [run.dir, run.publicOutput])).toEqual(Array(5).fill(['game', undefined]));
  });
});

describe('the agent container', () => {
  const HOME = resolve('tmp/factory-russian-fallback-container');
  const cfg = { image: 'img:1', oauthToken: 'claude-login', elevenlabsKey: 'k', sfxMaxGenerations: 6, agyMaxRuns: 100, agyModel: 'flash', codexModel: 'sol', codexEffort: 'medium', agentJobMaxMinutes: 30, home: HOME, tokenPrices: {}, jobsSlice: null } as unknown as FactoryConfig;

  beforeEach(() => {
    mkdirSync(`${HOME}/codex`, { recursive: true });
    writeFileSync(`${HOME}/codex/auth.json`, '{}');
    mkdirSync(`${HOME}/agy`, { recursive: true });
    writeFileSync(`${HOME}/agy/antigravity-oauth-token`, '{}');
  });

  it('starts in /work/game and carries the three writers: agy login and cap, the Codex login and model, and the Claude login', async () => {
    const calls: { args: string[]; env?: Record<string, string> }[] = [];
    const run: Run = async (_cmd, args, opts) => {
      calls.push({ args, env: opts?.env });
      return { code: 0, stdout: JSON.stringify({ type: 'result', duration_ms: 1, total_cost_usd: 1 }), stderr: '' };
    };
    await dockerContainer(run, cfg, null).agent({ clone: '/w/c', dir: 'game', model: 'sonnet', prompt: 'p', log: '/l.log', openNetwork: true });
    const call = calls.find(({ args }) => args[0] === 'run') as (typeof calls)[number];
    expect(call.args.slice(call.args.indexOf('-w'), call.args.indexOf('-w') + 2)).toEqual(['-w', '/work/game']);
    expect(call.args).toContain('/w/c:/work');
    expect(call.args).toContain(`${HOME}/codex:/home/pwuser/.codex`);
    expect(call.args).toContain(`${HOME}/agy/antigravity-oauth-token:/home/pwuser/.gemini/antigravity-cli/antigravity-oauth-token:ro`);
    expect(call.env).toMatchObject({ CLAUDE_CODE_OAUTH_TOKEN: 'claude-login', AGY_MAX_RUNS: '100', AGY_MODEL: 'flash', CODEX_MODEL: 'sol', CODEX_EFFORT: 'medium' });
  });

  it('installs all three CLIs in the agent image', () => {
    const dockerfile = read('factory/docker/Dockerfile');
    expect(dockerfile).toContain('npm install -g @anthropic-ai/claude-code');
    expect(dockerfile).toContain('npm install -g @openai/codex');
    expect(dockerfile).toContain('/opt/agy');
  });

  it('lets the proxy reach the Anthropic, Codex and agy hosts', () => {
    const allowlist = read('factory/docker/proxy/allowlist');
    for (const host of ['api\\.anthropic\\.com', 'chatgpt\\.com', 'auth\\.openai\\.com', 'oauth2\\.googleapis\\.com', 'www\\.googleapis\\.com', 'lh3\\.googleusercontent\\.com', 'daily-cloudcode-pa\\.googleapis\\.com']) expect(allowlist).toContain(`^${host}$`);
  });
});
