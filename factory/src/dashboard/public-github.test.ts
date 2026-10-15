import { expect, it } from 'vitest';
import { PublicGitHub } from './snapshot';
import { EMPTY_STATE } from '../state';
import type { DashboardConfig } from './config';
import { COLUMNS, type FactoryState, type Run } from '../types';

const config = { repo: 'owner/game', projectOwner: 'owner', projectNumber: 1 } as DashboardConfig;
type BoardCard = { number: number; title: string; column: string; labels?: string[] };
type Fixture = { board?: BoardCard[] };

const DEFAULT_BOARD: BoardCard[] = [{ number: 7, title: 'Public feature', column: 'Testing' }, { number: 8, title: 'PRIVATE ad hoc request', column: 'Testing', labels: ['adhoc'] }];

function createRun(fixture: Fixture, calls: string[][]): Run {
  const columns = [...COLUMNS];
  const board = fixture.board ?? DEFAULT_BOARD;
  return async (_cmd, args) => {
    calls.push(args);
    const endpoint = args[1];
    let data: unknown;
    if (endpoint === 'repos/owner/game') return { code: 0, stdout: 'public', stderr: '' };
    if (endpoint.includes('/issues?')) return { code: 0, stdout: board.map((card) => JSON.stringify({ number: card.number, title: card.title, labels: (card.labels ?? []).map((name) => ({ name })) })).join('\n'), stderr: '' };
    if (endpoint === 'graphql') {
      const query = args.find((arg) => arg.startsWith('query='))!;
      expect(query).not.toContain('mutation');
      data = query.includes('items(first:') ? { data: { node: { items: { pageInfo: { hasNextPage: false }, nodes: board.map((card) => ({ id: String(card.number), fieldValueByName: { name: card.column }, content: { number: card.number, repository: { nameWithOwner: 'owner/game' }, labels: { nodes: (card.labels ?? []).map((name) => ({ name })) } } })) } } } } : { data: { user: { projectV2: { id: 'P', field: { id: 'S', options: columns.map((name) => ({ id: name, name })) } } } } };
    }
    if (data === undefined) throw new Error(`Unexpected read: ${args.join(' ')}`);
    return { code: 0, stdout: JSON.stringify(data), stderr: '' };
  };
}

const read = (fixture: Fixture, state: FactoryState = structuredClone(EMPTY_STATE)) => new PublicGitHub(config, createRun(fixture, [])).read(state);

it('fetches only public issue data through read calls', async () => {
  const calls: string[][] = [];
  const result = await new PublicGitHub(config, createRun({}, calls)).read(structuredClone(EMPTY_STATE));
  expect(Object.keys(result).sort()).toEqual(['cards', 'mergeQueue']);
  expect(result.cards.value?.map((card) => card.issue)).toEqual([7]);
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
  expect(calls.every((args) => args[0] === 'api')).toBe(true);
});

it('orders the merge queue by state and hides private cards', async () => {
  const board: BoardCard[] = [
    { number: 20, title: 'Waits first', column: 'Merging' },
    { number: 21, title: 'Stuck merge', column: 'Merging', labels: ['factory-stuck'] },
    { number: 22, title: 'In the batch', column: 'Merging' },
    { number: 23, title: 'Held merge', column: 'Merging' },
    { number: 24, title: 'PRIVATE merge', column: 'Merging', labels: ['adhoc'] },
    { number: 25, title: 'Release task', column: 'Merging', labels: ['release-task'] },
    { number: 26, title: 'Still testing', column: 'Testing' },
  ];
  const state: FactoryState = {
    ...structuredClone(EMPTY_STATE),
    jobs: [{ id: 'm', stage: 'merge', issue: null, pid: 1, startedAt: '2026-10-15T00:00:00Z', log: '', batch: [22] }, { id: 's', stage: 'ship', issue: 30, pid: 2, startedAt: '2026-10-15T00:00:00Z', log: '' }],
    held: { 23: { by: 'operator', reason: 'check', at: '2026-10-15T00:00:00Z', stage: null } },
  };
  const result = await read({ board }, state);
  expect(result.mergeQueue.value).toEqual([
    { issue: 22, title: 'In the batch', state: 'merging' },
    { issue: 20, title: 'Waits first', state: 'next' },
    { issue: 21, title: 'Stuck merge', state: 'stuck' },
    { issue: 23, title: 'Held merge', state: 'held' },
    { issue: 25, title: 'Release task', state: 'after-ship' },
  ]);
});
