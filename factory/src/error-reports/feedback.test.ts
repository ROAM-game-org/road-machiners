import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Decision, FilterInput } from '../public/decision';
import { openStore, type PublicStore } from '../public/store';
import { alertPath, ErrorReports, ErrorServer, readStore } from './service';
import { Feedback } from './feedback';

const ACCEPT_BUG: Decision = { verdict: 'accept', kind: 'bug', route: 'none', title: 'Truck sinks `into` the road', reason: 'A concrete bug.' };
const NOW = new Date('2026-10-07T12:00:00Z');

type World = { url: string; home: string; store: PublicStore; created: string[]; asked: FilterInput[]; setDecision: (next: Decision | Error) => void };

const servers: ErrorServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => server.close())); });

async function start(over: { dailyIssues?: number; ipPerHour?: number; maxChars?: number } = {}): Promise<World> {
  mkdirSync('tmp', { recursive: true });
  const home = mkdtempSync(join('tmp', 'factory-feedback-'));
  mkdirSync(join(home, 'state'), { recursive: true });
  writeFileSync(join(home, 'state', 'state.json'), JSON.stringify({
    approvalPosts: { '900': 12 },
    builds: { '12': 'hash12', '13': 'hash13', '40': 'rc' },
    release: { issue: 40, branch: 'release/x', day: '2026-10-07', postId: null, removed: [] },
  }));
  const store = openStore(home);
  const created: string[] = [];
  const asked: FilterInput[] = [];
  let decision: Decision | Error = ACCEPT_BUG;
  const github = { createIssue: async (title: string, body: string, labels: string[]) => { created.push(`${title} [${labels.join(',')}]\n${body}`); return 200 + created.length; } };
  const cfg = { home, publicUrl: 'https://play.test/play', errorOrigins: 'https://html.itch.zone', errorBodyKb: 64, errorIpPerHour: 5, reportIpPerHour: over.ipPerHour ?? 5, reportMaxChars: over.maxChars ?? 100, reportDailyIssues: over.dailyIssues ?? 2 };
  const classify = async (input: FilterInput) => { asked.push(input); if (decision instanceof Error) throw decision; return decision; };
  const now = () => NOW;
  const feedback = new Feedback({ cfg, store, classify, github, now, log: () => undefined, alert: (line) => writeFileSync(join(home, 'alerts'), line, { flag: 'a' }) });
  const reports = new ErrorReports({ cfg: { ...cfg, errorDailyIssues: 1, errorDiskMb: 1, errorUnzippedMb: 1 }, github: {} as never, now });
  const server = new ErrorServer(reports, feedback, cfg, now, () => undefined);
  servers.push(server);
  return { url: `http://127.0.0.1:${await server.listenPort(0)}/feedback`, home, store, created, asked, setDecision: (next) => { decision = next; } };
}

const send = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { origin: 'https://html.itch.zone', 'cf-connecting-ip': '1.2.3.4', 'content-type': 'application/json', ...headers } });

const request = (over: Record<string, unknown> = {}) => ({ kind: 'bug', text: 'The truck sinks\ninto the road', version: '2.24.72+abc1234', build: 'release', ...over });

describe('feedback route', () => {
  it('opens a labeled issue with the quoted text for a report with no issue behind it', async () => {
    const { url, store, created, asked } = await start();
    const response = await send(url, request());
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://html.itch.zone');
    expect(await response.json()).toEqual({ status: 'sent', message: 'Thank you. Your report is issue #201.' });
    expect(asked).toEqual([{ source: 'report', text: 'The truck sinks\ninto the road', kind: 'bug' }]);
    expect(created[0]).toMatch(/^Truck sinks 'into' the road \[bug,player-report\]/);
    expect(created[0]).toContain('> The truck sinks\n> into the road');
    expect(created[0]).toContain('- Version: 2.24.72+abc1234');
    expect(created[0]).toContain('- Build: release');
    expect(store.issuesCreatedSince(new Date('2026-10-07T00:00:00Z'))).toBe(1);
  });

  it('labels a feature report feature-request', async () => {
    const { url, created, setDecision } = await start();
    setDecision({ ...ACCEPT_BUG, kind: 'feature' });
    await send(url, request({ kind: 'idea' }));
    expect(created[0]).toMatch(/\[feature-request,player-report\]/);
  });

  it('stores a rejected report with its reason and creates nothing', async () => {
    const { url, store, created, setDecision } = await start();
    setDecision({ ...ACCEPT_BUG, verdict: 'reject', reason: 'This is an ad.' });
    expect(await (await send(url, request())).json()).toEqual({ status: 'refused', message: 'This is an ad.' });
    expect(created).toEqual([]);
    expect(store.issuesCreatedSince(new Date(0))).toBe(0);
  });

  it('turns a report on the open release build into a classified comment on the tracking issue', async () => {
    const { url, store, created } = await start();
    expect(await (await send(url, request({ build: 'rc' }))).json()).toEqual({ status: 'sent', message: 'Thank you. Your report went to issue #40.' });
    expect(created).toEqual([]);
    expect(store.unclassifiedComments()).toEqual([]);
    expect(store.unsentComments()).toMatchObject([{ issue: 40, source: 'game', author: 'Player', text: 'The truck sinks\ninto the road', kind: 'bug', route: 'patch' }]);
  });

  it('turns a report on a build whose card has an open approval post into a comment, and finds the issue on the server', async () => {
    const { url, store } = await start();
    await send(url, request({ build: 'hash12', issue: 99, kind: 'idea' }));
    expect(store.unsentComments().map((comment) => comment.issue)).toEqual([12]);
  });

  it('opens an issue for a build with no open approval post and for an unknown build', async () => {
    const { url, created } = await start({ dailyIssues: 5 });
    await send(url, request({ build: 'hash13' }));
    await send(url, request({ build: 'ffffffff' }));
    expect(created).toHaveLength(2);
  });

  it('keeps the route none for a feedback comment', async () => {
    const { url, store, setDecision } = await start();
    setDecision({ ...ACCEPT_BUG, kind: 'feedback' });
    await send(url, request({ build: 'rc' }));
    expect(store.unsentComments()).toMatchObject([{ kind: 'feedback', route: 'none' }]);
  });

  it('refuses past the daily issue cap, keeps the report and alerts', async () => {
    const { url, home, store, created } = await start({ dailyIssues: 1 });
    await send(url, request());
    const second = await (await send(url, request())).json() as { status: string; message: string };
    expect(second).toEqual({ status: 'refused', message: 'No more reports are taken today. Try again tomorrow.' });
    expect(created).toHaveLength(1);
    expect(store.issuesCreatedSince(new Date('2026-10-07T00:00:00Z'))).toBe(1);
    expect(readFileSync(join(home, 'alerts'), 'utf8')).toBe('feedback: the daily cap of 1 new issues was hit on 2026-10-07');
  });

  it('answers 503 and stores nothing when the filter fails', async () => {
    const { url, store, created, setDecision } = await start();
    setDecision(new Error('The filter call failed with status 500.'));
    const response = await send(url, request());
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('The report could not be checked now. Try again later.');
    expect(created).toEqual([]);
    expect(store.issuesCreatedSince(new Date(0))).toBe(0);
    expect(store.unclassifiedComments()).toEqual([]);
  });

  it('limits reports per address per hour with 429 and alerts Hermes', async () => {
    const { url, home } = await start({ ipPerHour: 2, dailyIssues: 9 });
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await send(url, request())).status);
    expect(statuses).toEqual([200, 200, 429]);
    expect((await send(url, request(), { 'cf-connecting-ip': '5.6.7.8' })).status).toBe(200);
    expect(readFileSync(alertPath(home), 'utf8')).toContain('FACTORY_REPORT_IP_PER_HOUR=2');
  });

  it('refuses a bad origin, a bad body, too long text and an oversized body before the filter', async () => {
    const { url, asked, home } = await start({ maxChars: 100 });
    expect((await send(url, request(), { origin: 'https://evil.test' })).status).toBe(403);
    expect((await send(url, 'not json')).status).toBe(400);
    expect((await send(url, request({ kind: 'rant' }))).status).toBe(400);
    expect((await send(url, request({ text: '   ' }))).status).toBe(400);
    expect((await send(url, request({ build: '../x' }))).status).toBe(400);
    expect((await send(url, request({ text: 'x'.repeat(101) }))).status).toBe(413);
    expect((await send(url, request({ text: 'x'.repeat(2000) }))).status).toBe(413);
    expect(asked).toEqual([]);
    expect(readStore(home).rejects).toEqual({ origin: 1, shape: 4, size: 2 });
  });

  it('answers the preflight like the error route', async () => {
    const { url } = await start();
    const preflight = await fetch(url, { method: 'OPTIONS', headers: { origin: 'https://html.itch.zone' } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://html.itch.zone');
  });
});
