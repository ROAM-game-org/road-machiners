import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import * as activity from './activity';
import { parseAgentStatus, readObservation, scriptStatusRecord } from './observability';
import { CACHED_SUITE, buildScript, checkScript, previewScript } from './stages/checks';
import type { Run } from './types';
const homes: string[] = [];
function createHome() { mkdirSync('tmp', { recursive: true }); const home = mkdtempSync('tmp/activity-'); homes.push(home); return home; }
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }); });
it('reports structured tool activity across chunk boundaries without publishing arguments', async () => {
  expect(activity).toHaveProperty('createObservedRun');
  const home = createHome();
  const run: Run = async (_cmd, _args, opts) => {
    const event = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test -- PRIVATE_TOKEN' } }] } }) + '\n';
    opts?.onStdout?.(event.slice(0, 25));
    opts?.onStdout?.(event.slice(25));
    const current = readObservation(home, 'job-1');
    expect(current?.data).toMatchObject({ type: 'activity', activity: 'tests', phase: 'running' });
    expect(JSON.stringify(current)).not.toContain('PRIVATE');
    return { code: 0, stdout: 'original output', stderr: '' };
  };
  const observed = activity.createObservedRun(run, home, 'job-1', 10000, 1024 * 1024);
  expect(await observed('docker', ['run', 'factory-agent'], { activity: 'model' })).toEqual({ code: 0, stdout: 'original output', stderr: '' });
  expect(readObservation(home, 'job-1')?.data).toMatchObject({ phase: 'completed' });
});
it('keeps an agent milestone while runner events change the current operation', async () => {
  const home = createHome();
  const observed = activity.createObservedRun(async (_command, _args, opts) => {
    opts?.onStdout?.('{"type":"factory_status","milestone":"validating"}\n');
    opts?.onStdout?.(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npm test PRIVATE_TOKEN' } }] } }) + '\n');
    const current = readObservation(home, 'job-milestone');
    expect(current?.data).toMatchObject({ activity: 'tests', milestone: 'validating', source: 'runner', phase: 'running' });
    expect(JSON.stringify(current)).not.toContain('PRIVATE_TOKEN');
    return { code: 0, stdout: '', stderr: '' };
  }, home, 'job-milestone', 10000, 1024 * 1024);
  await observed('docker', ['run', 'factory-agent'], { activity: 'model' });
  expect(readObservation(home, 'job-milestone')?.data).toMatchObject({ milestone: 'validating', phase: 'completed' });
});
it('clears the active operation on command failure without replacing its result', async () => {
  expect(activity).toHaveProperty('createObservedRun');
  const home = createHome();
  const observed = activity.createObservedRun(async () => ({ code: 1, stdout: '', stderr: 'PRIVATE error' }), home, 'job-2', 10000, 1024 * 1024);
  expect((await observed('git', ['fetch'], { activity: 'git' })).code).toBe(1);
  expect(readObservation(home, 'job-2')?.data).toMatchObject({ activity: 'git', phase: 'failed' });
  expect(JSON.stringify(readObservation(home, 'job-2'))).not.toContain('PRIVATE');
});
it('recognizes machine check steps and rejects arbitrary status text', () => {
  expect(activity).toHaveProperty('readActivityLine');
  expect(activity.readActivityLine('[checks] 12:10:00 playtest')).toBeNull();
  expect(activity.readActivityLine('{"type":"factory_status","activity":"install"}')).toEqual({ activity: 'install', source: 'agent' });
  expect(activity.readActivityLine('{"type":"factory_status","milestone":"validating"}')).toEqual({ milestone: 'validating', source: 'agent' });
  const toolResult = { type: 'user', message: { content: [{ type: 'tool_result', content: [{ type: 'text', text: '{"type":"factory_status","milestone":"reviewing"}\n' }] }] } };
  expect(activity.readActivityLine(JSON.stringify(toolResult))).toEqual({ milestone: 'reviewing', source: 'agent' });
  expect(activity.readActivityLine('PRIVATE prompt and secrets')).toBeNull();
});

it('finds a milestone in chained command output, as agents send it in the factory', () => {
  const text = '{"type":"factory_status","activity":"reading"}\n{"type":"factory_status","milestone":"understanding"}\n  120 .factory-tasks/issue-157.md\nPRIVATE {"type":"factory_status","milestone":"planning"}\n';
  const chained = { type: 'user', message: { content: [{ type: 'tool_result', content: text }] } };
  expect(activity.readActivityLine(JSON.stringify(chained))).toEqual({ milestone: 'understanding', source: 'agent' });
  const activityOnly = { type: 'user', message: { content: [{ type: 'tool_result', content: '{"type":"factory_status","activity":"investigate"}\n ✓ src/fog.test.ts (3 tests)' }] } };
  expect(activity.readActivityLine(JSON.stringify(activityOnly))).toEqual({ activity: 'investigate', source: 'agent' });
  const plain = { type: 'user', message: { content: [{ type: 'tool_result', content: 'tests passed' }] } };
  expect(activity.readActivityLine(JSON.stringify(plain))).toEqual({ activity: 'model', source: 'runner' });
});

it('reads factory script records, and ignores the log text and records that claim more than a step or phase', () => {
  expect(activity.readActivityLine(scriptStatusRecord({ activity: 'install' }))).toEqual({ activity: 'install', step: true, source: 'runner' });
  expect(activity.readActivityLine(scriptStatusRecord({ milestone: 'Playing the release seed' }))).toEqual({ milestone: 'Playing the release seed', source: 'runner' });
  expect(activity.readActivityLine('[step] 12:10:00 npm ci')).toBeNull();
  expect(activity.readActivityLine('[phase] Playing the release seed')).toBeNull();
  expect(activity.readActivityLine('{"type":"factory_status","source":"runner","activity":"install","note":"x"}')).toBeNull();
  expect(activity.readActivityLine('{"type":"factory_status","source":"runner","milestone":"see /opt/secret"}')).toBeNull();
  expect(activity.readActivityLine('{"type":"factory_status","source":"runner","activity":"toString"}')).toBeNull();
  expect(parseAgentStatus(scriptStatusRecord({ activity: 'install' }))).toBeNull();
});

it('builds a script that records each step before it runs', () => {
  const script = activity.stepScript('Release full suite', [['npm ci', 'npm ci'], ['tests', 'npm test']]);
  expect(script.split('\n')).toEqual(['set -e', activity.STEP_FUNCTION, activity.phaseLine('Release full suite'), activity.stepCall('npm ci'), 'npm ci', activity.stepCall('tests'), 'npm test', activity.stepCall('done'), '']);
  expect(() => activity.stepScript('rm $HOME', [])).toThrow('Invalid script milestone');
});

it('prints records that real bash runs and the reader accepts, with a quote in the phase', () => {
  const script = activity.stepScript("Fixing the driver's tow fee", [['npm ci', 'true'], ['playtest', 'true']]);
  const lines = execFileSync('bash', ['-c', script], { encoding: 'utf8' }).split('\n').filter((line) => line.startsWith('{'));
  expect(lines.map((line) => activity.readActivityLine(line))).toEqual([
    { milestone: "Fixing the driver's tow fee", source: 'runner' },
    { activity: 'install', step: true, source: 'runner' },
    { activity: 'playtest', step: true, source: 'runner' },
    { activity: 'finished', step: true, source: 'runner' },
  ]);
});

it('moves a factory script past npm ci, shows its phase only while it runs, and counts each step as progress', async () => {
  const home = createHome();
  const seen: unknown[] = [];
  const observed = activity.createObservedRun(async (_command, args, opts) => {
    if (args.includes('factory-agent')) { opts?.onStdout?.('{"type":"factory_status","milestone":"Reviewing the play"}\n'); return { code: 0, stdout: '', stderr: '' }; }
    for (const record of [scriptStatusRecord({ milestone: 'Playing the release seed' }), scriptStatusRecord({ activity: 'install' })]) opts?.onStdout?.(`${record}\n`);
    seen.push(readObservation(home, 'job-script')?.data);
    await new Promise((resolve) => setTimeout(resolve, 5));
    opts?.onStdout?.(`added 300 packages in 4s\n${scriptStatusRecord({ activity: 'playtest' })}\n`);
    seen.push(readObservation(home, 'job-script')?.data);
    return { code: 0, stdout: '', stderr: '' };
  }, home, 'job-script', 10000, 1024 * 1024);
  await observed('docker', ['run', 'factory-agent'], { activity: 'model' });
  await observed('docker', ['run', 'image', 'bash', '-lc', 'script'], { activity: 'starting' });
  const [installing, playing] = seen as { progressAt: string }[];
  expect(installing).toMatchObject({ activity: 'install', milestone: 'Playing the release seed', phase: 'running' });
  expect(playing).toMatchObject({ activity: 'playtest', milestone: 'Playing the release seed', phase: 'running' });
  expect(Date.parse(playing.progressAt)).toBeGreaterThan(Date.parse(installing.progressAt));
  expect(readObservation(home, 'job-script')?.data).toMatchObject({ milestone: 'Reviewing the play', phase: 'completed' });
});

it('starts an operation on the activity its caller names, whatever the command text says', async () => {
  const home = createHome();
  const observed = activity.createObservedRun(async () => {
    expect(readObservation(home, 'job-caller')?.data).toMatchObject({ activity: 'publish', phase: 'running' });
    return { code: 0, stdout: '', stderr: '' };
  }, home, 'job-caller', 10000, 1024 * 1024);
  await observed('git', ['npm', 'test', 'factory-agent'], { activity: 'publish' });
});

it('has every step of the check, preview, build and candidate scripts record an activity the reader accepts', () => {
  const scripts = [checkScript('npm run playtest'), previewScript('npm run playtest'), buildScript, CACHED_SUITE];
  const records = scripts.flatMap((script) => [...script.matchAll(/^\s*step '(\{.*\})' "/gm)].map((match) => activity.readActivityLine(match[1])));
  expect(records.length).toBeGreaterThan(10);
  expect(records.every((record) => record !== null && 'activity' in record && record.step === true)).toBe(true);
  expect(checkScript('x')).not.toMatch(/^\s*step "/m);
});
