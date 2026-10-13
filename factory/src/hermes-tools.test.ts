import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { countAgyRun, decodeToolCall, HERMES_TOOL_LABEL, runHermesTool, toolDockerArgs, toolWorkdir, type ToolDeps } from './hermes-tools';
import { AGENT_NETWORK, type FactoryConfig } from './types';

const SECRET = 'gemini-secret-value';

function encode(...parts: string[]): string {
  return Buffer.from(parts.map((part) => `${part}\0`).join(''), 'utf8').toString('base64');
}

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'hermes-tools-'));
  mkdirSync(join(home, 'codex'));
  writeFileSync(join(home, 'codex/auth.json'), '{}');
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

function config(): FactoryConfig {
  return { home, image: 'roam-factory:dev', geminiKey: SECRET, agyMaxRuns: 2, agyModel: 'gemini-3.8-flash-medium', codexModel: 'gpt-6-sol', codexEffort: 'medium', agentJobMaxMinutes: 30 } as FactoryConfig;
}

describe('decodeToolCall', () => {
  it('reads the cwd and the arguments with spaces, quotes and Cyrillic intact', () => {
    const call = decodeToolCall('agy', encode('/factory/home/hermes-tools/post', '-p', 'Напиши "черновик" релиза', ''));
    expect(call).toEqual({ tool: 'agy', cwd: '/factory/home/hermes-tools/post', args: ['-p', 'Напиши "черновик" релиза', ''] });
  });

  it('refuses a tool other than agy and codex', () => {
    expect(() => decodeToolCall('claude', encode('/'))).toThrow('agy or codex');
  });

  it('refuses a payload that is not base64 of a NUL-ended list', () => {
    expect(() => decodeToolCall('agy', 'not base64!')).toThrow('payload');
    expect(() => decodeToolCall('agy', Buffer.from('no end').toString('base64'))).toThrow('payload');
  });
});

describe('toolWorkdir', () => {
  it('maps a folder under the shared tools folder to the same folder under /work', () => {
    expect(toolWorkdir('/factory/home/hermes-tools/post/ru')).toBe('/work/post/ru');
    expect(toolWorkdir('/factory/home/hermes-tools')).toBe('/work');
  });

  it('uses /work for any other folder', () => {
    expect(toolWorkdir('/opt/data')).toBe('/work');
    expect(toolWorkdir('/factory/home/hermes-tools-other')).toBe('/work');
    expect(toolWorkdir('/factory/home/hermes-tools/../state')).toBe('/work');
  });
});

describe('countAgyRun', () => {
  it('counts the runs of one UTC day and refuses the run past AGY_MAX_RUNS', () => {
    const day = new Date('2026-10-13T10:00:00Z');
    expect(countAgyRun(home, 2, day)).toBe(1);
    expect(countAgyRun(home, 2, day)).toBe(2);
    expect(() => countAgyRun(home, 2, day)).toThrow('AGY_MAX_RUNS=2');
    expect(JSON.parse(readFileSync(join(home, 'state/hermes-agy-runs.json'), 'utf8'))).toEqual({ day: '2026-10-13', runs: 2 });
  });

  it('starts again on the next UTC day', () => {
    countAgyRun(home, 1, new Date('2026-10-13T23:59:00Z'));
    expect(countAgyRun(home, 1, new Date('2026-10-14T00:00:00Z'))).toBe(1);
  });
});

describe('toolDockerArgs', () => {
  it('runs agy in the agent image behind the proxy with the Gemini key by name only and no Codex login', () => {
    const { args, env } = toolDockerArgs(config(), { tool: 'agy', cwd: '/factory/home/hermes-tools/post', args: ['-p', 'hi'] }, 'hermes-tool-1');
    expect(args.join(' ')).not.toContain(SECRET);
    expect(env).toEqual({ GEMINI_API_KEY: SECRET, AGY_MODEL: 'gemini-3.8-flash-medium', AGY_MAX_RUNS: '2' });
    expect(args).toEqual(expect.arrayContaining(['-e', 'GEMINI_API_KEY', '--network', AGENT_NETWORK, `${home}/hermes-tools:/work`, '/work/post', HERMES_TOOL_LABEL, 'hermes-tool-1']));
    expect(args.join(' ')).not.toContain('.codex');
    expect(args.slice(-4)).toEqual(['roam-factory:dev', 'agy', '-p', 'hi']);
  });

  it('runs codex with the Codex login, model and effort and no Gemini key', () => {
    const { args, env } = toolDockerArgs(config(), { tool: 'codex', cwd: '/', args: ['exec', 'hi'] }, 'hermes-tool-2');
    expect(env).toEqual({ CODEX_MODEL: 'gpt-6-sol', CODEX_EFFORT: 'medium' });
    expect(args).toContain(`${home}/codex:/home/pwuser/.codex`);
    expect(args).not.toContain('GEMINI_API_KEY');
    expect(args.slice(-3)).toEqual(['codex', 'exec', 'hi']);
  });

  it('refuses codex when the host has no Codex login', () => {
    rmSync(join(home, 'codex/auth.json'));
    expect(() => toolDockerArgs(config(), { tool: 'codex', cwd: '/', args: [] }, 'n')).toThrow('auth.json is missing');
  });
});

type Fake = ToolDeps & { spawned: string[][]; removed: string[]; stop: (() => void) | null; finish: (code: number) => void; proxied: number };

function fakeDeps(): Fake {
  let finish: (code: number) => void = () => undefined;
  const fake: Fake = {
    spawned: [], removed: [], stop: null, proxied: 0, finish: (code) => finish(code),
    spawn: (args) => { fake.spawned.push(args); return new Promise((done) => { finish = done; }); },
    remove: async (name) => { fake.removed.push(name); finish(137); },
    ensureProxy: async () => { fake.proxied += 1; },
    now: () => new Date('2026-10-13T10:00:00Z'),
    onStop: (stop) => { fake.stop = stop; },
    limitMs: (minutes) => minutes,
    error: () => undefined,
  };
  return fake;
}

async function settle(): Promise<void> {
  await new Promise((done) => setTimeout(done, 5));
}

describe('runHermesTool', () => {
  it('returns the exit code of the tool and counts an agy run', async () => {
    const deps = fakeDeps();
    const running = runHermesTool(config(), { tool: 'agy', cwd: '/', args: ['--help'] }, deps);
    await settle();
    deps.finish(0);
    expect(await running).toBe(0);
    expect(deps.proxied).toBe(1);
    expect(deps.spawned[0]).toContain('--help');
    expect(JSON.parse(readFileSync(join(home, 'state/hermes-agy-runs.json'), 'utf8')).runs).toBe(1);
  });

  it('starts no container once the day used AGY_MAX_RUNS', async () => {
    const deps = fakeDeps();
    countAgyRun(home, 2, deps.now());
    countAgyRun(home, 2, deps.now());
    await expect(runHermesTool(config(), { tool: 'agy', cwd: '/', args: [] }, deps)).rejects.toThrow('AGY_MAX_RUNS');
    expect(deps.spawned).toEqual([]);
  });

  it('does not count a codex run', async () => {
    const deps = fakeDeps();
    const running = runHermesTool(config(), { tool: 'codex', cwd: '/', args: [] }, deps);
    await settle();
    deps.finish(0);
    await running;
    expect(() => readFileSync(join(home, 'state/hermes-agy-runs.json'))).toThrow();
  });

  it('removes the container past FACTORY_JOB_MAX_MINUTES and fails', async () => {
    const deps = { ...fakeDeps(), limitMs: () => 1 };
    const errors: string[] = [];
    deps.error = (line) => errors.push(line);
    const code = await runHermesTool(config(), { tool: 'codex', cwd: '/', args: [] }, deps);
    expect(code).toBe(124);
    expect(deps.removed).toHaveLength(1);
    expect(errors.join('\n')).toContain('30 minute');
  });

  it('removes the container when the command is stopped', async () => {
    const deps = fakeDeps();
    const running = runHermesTool(config(), { tool: 'codex', cwd: '/', args: [] }, deps);
    await settle();
    deps.stop?.();
    await running;
    expect(deps.removed).toEqual([deps.spawned[0][deps.spawned[0].indexOf('--name') + 1]]);
  });
});
