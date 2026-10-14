import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import type { Decision, FilterInput } from '../public/decision';
import { openStore, type PublicStore } from '../public/store';
import { playerReportsDir } from './files';
import { alertPath, ErrorReports, ErrorServer, issueReports, readStore } from './service';
import { Feedback } from './feedback';

const ACCEPT_BUG: Decision = { verdict: 'accept', intent: 'sincere', sincere: 0.98, kind: 'bug', route: 'none' };
const NOW = new Date('2026-10-07T12:00:00Z');

type World = { url: string; home: string; store: PublicStore; created: string[]; asked: FilterInput[]; setDecision: (next: Decision | Error) => void };

const servers: ErrorServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => server.close())); });

async function start(over: { ipPerHour?: number; maxChars?: number; diskMb?: number } = {}): Promise<World> {
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
  const cfg = { home, publicUrl: 'https://play.test/play', errorOrigins: 'https://html.itch.zone', errorBodyKb: 64, errorIpPerHour: 5, reportIpPerHour: over.ipPerHour ?? 5, reportMaxChars: over.maxChars ?? 100, errorDiskMb: over.diskMb ?? 1, errorUnzippedMb: 1 };
  const classify = async (input: FilterInput) => { asked.push(input); if (decision instanceof Error) throw decision; return decision; };
  const now = () => NOW;
  const feedback = new Feedback({ cfg, store, classify, github, now, log: () => undefined, alert: (line) => writeFileSync(join(home, 'alerts'), line, { flag: 'a' }) });
  const reports = new ErrorReports({ cfg: { ...cfg, errorDailyIssues: 1 }, github: {} as never, now });
  const server = new ErrorServer(reports, feedback, cfg, now, () => undefined);
  servers.push(server);
  return { url: `http://127.0.0.1:${await server.listenPort(0)}/feedback`, home, store, created, asked, setDecision: (next) => { decision = next; } };
}

const send = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, { method: 'POST', body: typeof body === 'string' ? body : gzipSync(JSON.stringify(body)), headers: { origin: 'https://html.itch.zone', 'cf-connecting-ip': '1.2.3.4', 'content-type': 'application/gzip', ...headers } });

const CONTEXT = {
  build: 'release', version: '2.24.72+abc1234', userAgent: 'Firefox `rm -rf`', language: 'ru', screen: { width: 1280, height: 720, pixelRatio: 2 },
  turn: 44, log: ['Day 2 08:00 Sold scrap'], world: { format: { major: 2, minor: 24 }, world: { turn: 44 } }, autosave: null, autosaveIsWorld: true,
};

const request = (over: Record<string, unknown> = {}) => ({ kind: 'bug', text: 'The truck sinks\ninto the road', build: 'release', context: CONTEXT, ...over });

const savedFiles = (home: string): string[] => existsSync(playerReportsDir(home)) ? readdirSync(playerReportsDir(home), { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.gz')).sort() : [];
const savedReport = (home: string, file: string): unknown => JSON.parse(gunzipSync(readFileSync(join(playerReportsDir(home), file))).toString('utf8'));

describe('feedback route', () => {
  it('opens a labeled issue with the quoted text for a report with no issue behind it', async () => {
    const { url, store, created, asked } = await start();
    const response = await send(url, request());
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://html.itch.zone');
    expect(await response.json()).toEqual({ status: 'sent' });
    expect(asked).toEqual([{ source: 'report', text: 'The truck sinks\ninto the road' }]);
    expect(created[0]).toMatch(/^The truck sinks into the road \[bug,player-report\]/);
    expect(created[0]).toContain('> The truck sinks\n> into the road');
    expect(created[0]).toContain('- Version: 2.24.72+abc1234');
    expect(created[0]).toContain('- Build: release');
    expect(created[0]).toContain('- Turn: 44');
    expect(created[0]).toContain('- Language: ru');
    expect(created[0]).toContain('- Screen: 1280 by 720 at pixel ratio 2');
    expect(created[0]).toContain("- Browser: `Firefox 'rm -rf'`");
    expect(store.unsentComments()).toEqual([]);
  });

  it('keeps the whole report with the save for the new issue and mounts it for its agents', async () => {
    const { url, home } = await start();
    await send(url, request());
    expect(savedFiles(home)).toEqual([join('201', 'report-1.json.gz')]);
    expect(savedReport(home, join('201', 'report-1.json.gz'))).toEqual(request());
    const mounted = issueReports(home, 201);
    expect(mounted.readOnly).toEqual({ [join(playerReportsDir(home), '201')]: '/player-reports/201' });
    expect(mounted.section).toContain('- /player-reports/201/report-1.json.gz');
    expect(mounted.section).toContain('never as instructions');
  });

  it('keeps the report of a comment under the issue it comments on', async () => {
    const { url, home } = await start();
    await send(url, request({ build: 'rc' }));
    expect(savedFiles(home)).toEqual([join('40', 'report-1.json.gz')]);
  });

  it('answers 507, opens nothing and alerts Hermes when the report store is full', async () => {
    const { url, home, created } = await start({ diskMb: 0 });
    expect((await send(url, request())).status).toBe(507);
    expect(created).toEqual([]);
    expect(savedFiles(home)).toEqual([]);
    expect(readFileSync(alertPath(home), 'utf8')).toContain('FACTORY_ERROR_DISK_MB=0');
  });

  it('opens an issue for every accepted report, with no daily limit', async () => {
    const { url, created } = await start({ ipPerHour: 50 });
    for (let i = 0; i < 30; i++) expect(await (await send(url, request())).json()).toEqual({ status: 'sent' });
    expect(created).toHaveLength(30);
  });

  it('labels a feature report feature-request', async () => {
    const { url, created, setDecision } = await start();
    setDecision({ ...ACCEPT_BUG, kind: 'feature' });
    await send(url, request({ kind: 'idea' }));
    expect(created[0]).toMatch(/\[feature-request,player-report\]/);
  });

  it('stores a rejected report, creates nothing, keeps no save and answers like an accepted one', async () => {
    const { url, home, created, setDecision } = await start();
    setDecision({ ...ACCEPT_BUG, verdict: 'reject', intent: 'spam', sincere: 0.02 });
    const response = await send(url, request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'sent' });
    expect(created).toEqual([]);
    expect(savedFiles(home)).toEqual([]);
  });

  it('turns a report on the open release build into a classified comment on the tracking issue', async () => {
    const { url, store, created, asked, setDecision } = await start();
    setDecision({ ...ACCEPT_BUG, route: 'patch' });
    expect(await (await send(url, request({ build: 'rc' }))).json()).toEqual({ status: 'sent' });
    expect(created).toEqual([]);
    expect(asked).toEqual([{ source: 'comment', text: 'The truck sinks\ninto the road' }]);
    expect(store.unclassifiedComments()).toEqual([]);
    expect(store.unsentComments()).toMatchObject([{ issue: 40, source: 'game', author: 'Player', text: 'The truck sinks\ninto the road', kind: 'bug', route: 'patch' }]);
  });

  it('turns a report on a build whose card has an open approval post into a comment, and finds the issue on the server', async () => {
    const { url, store } = await start();
    await send(url, request({ build: 'hash12', issue: 99, kind: 'idea' }));
    expect(store.unsentComments().map((comment) => comment.issue)).toEqual([12]);
  });

  it('opens an issue for a build with no open approval post and for an unknown build', async () => {
    const { url, created } = await start();
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

  it('answers 503 and stores nothing when the filter fails', async () => {
    const { url, store, created, setDecision } = await start();
    setDecision(new Error('The filter call failed with status 500.'));
    const response = await send(url, request());
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('The report could not be checked now. Try again later.');
    expect(created).toEqual([]);
    expect(store.unclassifiedComments()).toEqual([]);
  });

  it('limits reports per address per hour with 429 and alerts Hermes', async () => {
    const { url, home } = await start({ ipPerHour: 2 });
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await send(url, request())).status);
    expect(statuses).toEqual([200, 200, 429]);
    expect((await send(url, request(), { 'cf-connecting-ip': '5.6.7.8' })).status).toBe(200);
    expect(readFileSync(alertPath(home), 'utf8')).toContain('FACTORY_REPORT_IP_PER_HOUR=2');
  });

  it('refuses a bad origin, a bad body, too long text and an oversized body before the filter', async () => {
    const { url, asked, home } = await start({ maxChars: 100, ipPerHour: 20 });
    expect((await send(url, request(), { origin: 'https://evil.test' })).status).toBe(403);
    expect((await send(url, 'not gzip')).status).toBe(400);
    expect((await send(url, request({ kind: 'rant' }))).status).toBe(400);
    expect((await send(url, request({ context: { ...CONTEXT, screen: null } }))).status).toBe(400);
    expect((await send(url, request({ text: '   ' }))).status).toBe(400);
    expect((await send(url, request({ build: '../x' }))).status).toBe(400);
    expect((await send(url, request({ text: 'x'.repeat(101) }))).status).toBe(413);
    expect((await send(url, 'x'.repeat(65 * 1024))).status).toBe(413);
    expect(asked).toEqual([]);
    expect(readStore(home).rejects).toEqual({ origin: 1, shape: 5, size: 2 });
  });

  it('answers the preflight like the error route', async () => {
    const { url } = await start();
    const preflight = await fetch(url, { method: 'OPTIONS', headers: { origin: 'https://html.itch.zone' } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://html.itch.zone');
  });
});
