import { spawn, type ChildProcess } from 'node:child_process';
import { constants } from 'node:os';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { randomUUID } from 'node:crypto';
import { codexMount, ensureProxy, FACTORY_LABEL, networkArgs } from './container';
import { must } from './exec';
import { withLockSync } from './lock';
import type { FactoryConfig, Run } from './types';

export const HERMES_TOOL_LABEL = 'factory-hermes-tool=1';
export const HERMES_TOOLS_SHARED = '/factory/home/hermes-tools';
const TOOLS_DIR = 'hermes-tools';
const WORK = '/work';
const TIMED_OUT_CODE = 124;
const LOCK_MS = 30_000;

export type HermesTool = 'agy' | 'codex';
export type ToolCall = { tool: HermesTool; cwd: string; args: string[] };

export type ToolDeps = {
  spawn: (args: string[], env: Record<string, string>) => Promise<number>;
  remove: (name: string) => Promise<void>;
  kill: () => void;
  ensureProxy: () => Promise<void>;
  now: () => Date;
  onStop: (stop: () => Promise<void> | void) => void;
  limitMs: (minutes: number) => number;
  error: (line: string) => void;
};

export function decodeToolCall(tool: string | undefined, payload: string | undefined): ToolCall {
  if (tool !== 'agy' && tool !== 'codex') throw new Error(`factory tool runs agy or codex, got "${tool}".`);
  if (payload === undefined || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) throw new Error('factory tool needs a base64 payload of NUL-ended parts.');
  const text = Buffer.from(payload, 'base64').toString('utf8');
  if (!text.endsWith('\0')) throw new Error('factory tool needs a base64 payload of NUL-ended parts.');
  const [cwd, ...args] = text.slice(0, -1).split('\0');
  return { tool, cwd, args };
}

export function toolWorkdir(cwd: string): string {
  const folder = posix.normalize(cwd);
  if (folder === HERMES_TOOLS_SHARED) return WORK;
  if (!folder.startsWith(`${HERMES_TOOLS_SHARED}/`)) return WORK;
  return posix.join(WORK, folder.slice(HERMES_TOOLS_SHARED.length));
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function countAgyRun(home: string, maxRuns: number, now: Date): number {
  const file = join(home, 'state', 'hermes-agy-runs.json');
  return withLockSync(join(home, 'locks', 'hermes-agy-runs'), LOCK_MS, () => {
    const day = utcDay(now);
    const last = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { day: string; runs: number }) : null;
    const runs = (last?.day === day ? last.runs : 0) + 1;
    if (runs > maxRuns) throw new Error(`agy: Hermes made ${maxRuns} agy runs on ${day} UTC, the AGY_MAX_RUNS=${maxRuns} of a day. It runs again after midnight UTC.`);
    mkdirSync(join(home, 'state'), { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify({ day, runs }));
    renameSync(`${file}.tmp`, file);
    return runs;
  });
}

function toolEnv(cfg: FactoryConfig, tool: HermesTool): Record<string, string> {
  if (tool === 'agy') return { GEMINI_API_KEY: cfg.geminiKey, AGY_MODEL: cfg.agyModel, AGY_MAX_RUNS: String(cfg.agyMaxRuns) };
  return { CODEX_MODEL: cfg.codexModel, CODEX_EFFORT: cfg.codexEffort };
}

function toolMounts(cfg: FactoryConfig, tool: HermesTool): string[] {
  return tool === 'codex' ? codexMount(cfg.home) : [];
}

export function toolDockerArgs(cfg: FactoryConfig, call: ToolCall, name: string): { args: string[]; env: Record<string, string> } {
  const shared = join(cfg.home, TOOLS_DIR);
  mkdirSync(shared, { recursive: true });
  const env = toolEnv(cfg, call.tool);
  const args = [
    'run', '--rm', '-i', '--name', name, '--label', FACTORY_LABEL, '--label', HERMES_TOOL_LABEL, '--cpus', '1', '--memory', '2g', '--pids-limit', '512',
    '-v', `${shared}:${WORK}`, '-w', toolWorkdir(call.cwd), ...toolMounts(cfg, call.tool), ...networkArgs(false),
    ...Object.keys(env).flatMap((key) => ['-e', key]), cfg.image, call.tool, ...call.args,
  ];
  return { args, env };
}

const FREE_CALLS = new Set(['--help', '-h', '--version']);

async function stopContainer(deps: ToolDeps, name: string): Promise<void> {
  try {
    await deps.remove(name);
  } catch (error) {
    deps.error(`removing container ${name} failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    deps.kill();
  }
}

export async function runHermesTool(cfg: FactoryConfig, call: ToolCall, deps: ToolDeps): Promise<number> {
  const name = `factory-hermes-${call.tool}-${randomUUID()}`;
  const { args, env } = toolDockerArgs(cfg, call, name);
  await deps.ensureProxy();
  if (call.tool === 'agy' && !FREE_CALLS.has(call.args.join(' '))) countAgyRun(cfg.home, cfg.agyMaxRuns, deps.now());
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void stopContainer(deps, name); }, deps.limitMs(cfg.agentJobMaxMinutes));
  deps.onStop(() => stopContainer(deps, name));
  try {
    const code = await deps.spawn(args, env);
    if (!timedOut) return code;
    deps.error(`${call.tool}: the call ran past the ${cfg.agentJobMaxMinutes} minute limit of FACTORY_JOB_MAX_MINUTES, and the factory removed its container.`);
    return TIMED_OUT_CODE;
  } finally {
    clearTimeout(timer);
  }
}

const STOP_SIGNALS = ['SIGHUP', 'SIGINT', 'SIGTERM'] as const;
const SIGNAL_EXIT = 128;

export function realToolDeps(run: Run, cfg: FactoryConfig): ToolDeps {
  let child: ChildProcess | null = null;
  return {
    spawn: (args, env) => new Promise((done, fail) => {
      child = spawn('docker', args, { stdio: 'inherit', env: { ...process.env, ...env } });
      child.on('error', fail);
      child.on('close', (code) => done(code ?? 1));
    }),
    remove: async (name) => { must(await run('docker', ['rm', '-f', name], { activity: 'command', timeoutMs: 60_000 }), `docker rm ${name}`); },
    kill: () => { child?.kill('SIGKILL'); },
    ensureProxy: () => ensureProxy(run, cfg),
    now: () => new Date(),
    onStop: (stop) => {
      for (const signal of STOP_SIGNALS) process.once(signal, () => void Promise.resolve(stop()).finally(() => process.exit(SIGNAL_EXIT + constants.signals[signal])));
    },
    limitMs: (minutes) => minutes * 60_000,
    error: (line) => console.error(line),
  };
}
