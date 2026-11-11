import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openStore, type PublicStore, type ReportRow } from '../public/store';
import { acceptRejectedReport } from './report-accept';

const DROPPED: ReportRow = { address: '1.2.3.4', build: 'dev', version: '2.140.1+abc', kind: 'bug', text: 'Day 1 7:00 The turn failed and did not play.\n@everyone', verdict: 'reject', intent: 'troll', sincere: 0.66, issue: null, createdIssue: null, at: '2026-11-03T22:26:56.088Z' };
const ORDER = { by: 'btseytlin', reason: 'the sincere filter dropped real reports (#1331)' };

const homes: string[] = [];
const stores: PublicStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function world(): { store: PublicStore; created: string[]; github: { createIssue: (title: string, body: string, labels: string[]) => Promise<number> } } {
  mkdirSync('tmp', { recursive: true });
  const home = mkdtempSync(join('tmp', 'report-accept-'));
  homes.push(home);
  const store = openStore(home);
  stores.push(store);
  const created: string[] = [];
  const github = { createIssue: async (title: string, body: string, labels: string[]) => { created.push(`${title} [${labels.join(',')}]\n${body}`); return 900 + created.length; } };
  return { store, created, github };
}

describe('acceptRejectedReport', () => {
  it('files a dropped report as a player-report issue that says it has no world, autosave or log', async () => {
    const { store, created, github } = world();
    const id = store.addReport(DROPPED);
    expect(await acceptRejectedReport({ store, github }, { id, ...ORDER })).toBe(901);
    expect(created[0]).toMatch(/^Day 1 7:00 The turn failed and did not play\. .*\[bug,player-report\]/);
    expect(created[0]).toContain('> Day 1 7:00 The turn failed and did not play.');
    expect(created[0]).not.toContain('@everyone\n');
    expect(created[0]).toContain('- Build: dev');
    expect(created[0]).toContain('- Version: 2.140.1+abc');
    expect(created[0]).toContain('kept no world, autosave or log');
    expect(created[0]).toContain('btseytlin filed it later: the sincere filter dropped real reports (#1331)');
    expect(store.rejectedReport(id)).toBeNull();
  });

  it('labels a dropped idea feature-request', async () => {
    const { store, created, github } = world();
    const id = store.addReport({ ...DROPPED, kind: 'idea', text: 'raise car population 50% for the new map' });
    await acceptRejectedReport({ store, github }, { id, ...ORDER });
    expect(created[0]).toMatch(/\[feature-request,player-report\]/);
  });

  it('refuses a report that was accepted or already filed, and files nothing', async () => {
    const { store, created, github } = world();
    const accepted = store.addReport({ ...DROPPED, verdict: 'accept', intent: 'sincere', createdIssue: 300 });
    const dropped = store.addReport(DROPPED);
    await acceptRejectedReport({ store, github }, { id: dropped, ...ORDER });
    await expect(acceptRejectedReport({ store, github }, { id: accepted, ...ORDER })).rejects.toThrow(`Report ${accepted} is not a rejected report with no issue`);
    await expect(acceptRejectedReport({ store, github }, { id: dropped, ...ORDER })).rejects.toThrow(`Report ${dropped} is not a rejected report with no issue`);
    await expect(acceptRejectedReport({ store, github }, { id: 99, ...ORDER })).rejects.toThrow('Report 99');
    expect(created).toHaveLength(1);
  });
});
