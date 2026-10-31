import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { outputsNote } from './container';

it('ships factory-job in the agent image and tells every agent to use it', () => {
  expect(readFileSync('docker/Dockerfile', 'utf8')).toContain('COPY --chmod=755 factory-job /usr/local/bin/factory-job');
  expect(outputsNote('game', 30)).toContain('factory-job start <name> <activity> <minutes>');
  expect(outputsNote('game', 30)).toContain('The limit is at most 30 minutes.');
  expect(outputsNote('game', 30)).toContain('Never end your run while a job is running');
  expect(outputsNote('game', 30)).toContain('factory-job wait <name>, with a Bash timeout of 10 minutes');
  expect(outputsNote('game', 30)).toContain('After 3 waits on one job that did not end, stop it');
  expect(outputsNote('game', 30)).not.toMatch(/sleep \d/);
});

function jobEnv(waitSeconds: string): NodeJS.ProcessEnv {
  const bin = mkdtempSync(join(tmpdir(), 'factory-job-bin-'));
  writeFileSync(join(bin, 'factory-status'), '#!/bin/sh\nexit 0\n');
  chmodSync(join(bin, 'factory-status'), 0o755);
  return { ...process.env, PATH: `${bin}:${process.env.PATH}`, FACTORY_JOB_MAX_MINUTES: '30', FACTORY_JOB_WAIT_SECONDS: waitSeconds };
}

function job(env: NodeJS.ProcessEnv, ...args: string[]) {
  return spawnSync('sh', ['docker/factory-job', ...args], { encoding: 'utf8', env });
}

const linuxJobTools = spawnSync('sh', ['-c', 'command -v setsid && command -v timeout']).status === 0;

it.skipIf(!linuxJobTools)('waits until a job ends and prints its check', () => {
  const env = jobEnv('60');
  const name = `wait-ends-${process.pid}`;
  expect(job(env, 'start', name, 'tests', '5', 'sleep 1; echo done-line').status).toBe(0);
  const started = Date.now();
  const waited = job(env, 'wait', name);
  expect(Date.now() - started).toBeLessThan(30_000);
  expect(waited.status).toBe(0);
  expect(waited.stdout).toContain(`Job ${name} finished after 0 minutes.`);
  expect(waited.stdout).toContain('done-line');
  expect(waited.stdout).toBe(job(env, 'check', name).stdout);
});

it.skipIf(!linuxJobTools)('returns at the wait limit while the job still runs', () => {
  const env = jobEnv('1');
  const name = `wait-limit-${process.pid}`;
  expect(job(env, 'start', name, 'tests', '5', 'sleep 60').status).toBe(0);
  try {
    const waited = job(env, 'wait', name);
    expect(waited.status).toBe(0);
    expect(waited.stdout).toContain(`Job ${name} is running: 0 of 5 minutes used`);
  } finally {
    job(env, 'stop', name);
  }
});

it('refuses to wait on a job it does not know', () => {
  const waited = job(jobEnv('1'), 'wait', `no-such-job-${process.pid}`);
  expect(waited.status).toBe(2);
  expect(waited.stderr).toContain('No job');
  expect(waited.stdout).toBe('');
});

it('refuses a time limit above the factory cap, or no cap at all', () => {
  const start = ['docker/factory-job', 'start', 'ok', 'tests', '31', 'true'];
  const over = spawnSync('sh', start, { encoding: 'utf8', env: { ...process.env, FACTORY_JOB_MAX_MINUTES: '30' } });
  expect(over.status).toBe(2);
  expect(over.stderr).toContain('at most 30 minutes');
  const unset = spawnSync('sh', start, { encoding: 'utf8', env: { ...process.env, FACTORY_JOB_MAX_MINUTES: '' } });
  expect(unset.status).not.toBe(0);
  expect(unset.stderr).toContain('FACTORY_JOB_MAX_MINUTES is not set');
});

it('rejects bad arguments before it starts anything', () => {
  for (const args of [[], ['start', 'bad name', 'tests', '5', 'true'], ['start', 'ok', 'tests', '0', 'true'], ['start', 'ok', 'tests', 'soon', 'true'], ['start', 'ok', 'tests', '5'], ['check'], ['wait'], ['wait', 'a', 'b'], ['nope', 'ok']]) {
    const result = spawnSync('sh', ['docker/factory-job', ...args], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
  }
});

function running(pidFile: string): boolean {
  const state = spawnSync('ps', ['-o', 'stat=', '-p', readFileSync(pidFile, 'utf8').trim()], { encoding: 'utf8' }).stdout.trim();
  return state !== '' && !state.startsWith('Z');
}

function pidFileIn(name: string): string {
  return join(mkdtempSync(join(tmpdir(), `${name}-`)), 'pid');
}

it.skipIf(!linuxJobTools)('stops a job whose processes ignore TERM, and returns once none is left', () => {
  const env = jobEnv('1');
  const name = `stop-deaf-${process.pid}`;
  const pidFile = pidFileIn(name);
  expect(job(env, 'start', name, 'tests', '5', `sh -c 'trap "" TERM; echo $$ > ${pidFile}; while :; do :; done' & wait`).status).toBe(0);
  for (let tries = 0; tries < 50 && !running(pidFile); tries++) spawnSync('sleep', ['0.1']);
  expect(running(pidFile)).toBe(true);
  const stopped = job(env, 'stop', name);
  expect(stopped.stdout).toContain(`Stopped job ${name}.`);
  expect(stopped.status).toBe(0);
  expect(running(pidFile)).toBe(false);
});

it.skipIf(!linuxJobTools)('kills a process the command left behind when the command ends', () => {
  const env = jobEnv('60');
  const name = `leftover-${process.pid}`;
  const pidFile = pidFileIn(name);
  expect(job(env, 'start', name, 'tests', '5', `sh -c 'trap "" TERM; echo $$ > ${pidFile}; while :; do sleep 1; done' > /dev/null 2>&1 & sleep 1`).status).toBe(0);
  expect(job(env, 'wait', name).stdout).toContain(`Job ${name} finished`);
  expect(running(pidFile)).toBe(false);
});
