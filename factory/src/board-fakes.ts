import { COLUMNS, type Column, type FactoryConfig, type Run, type RunResult } from './types';

export const BOARD_CFG = { repo: 'o/r', projectOwner: 'o', projectNumber: 1, githubAppId: '42', githubRetries: 3, githubRetryBaseSeconds: 15, githubTimeoutSeconds: 60 } as FactoryConfig;

export type BoardItem = { issue: number; column: Column; labels?: string[]; repo?: string };

export type Fault = 'none' | 'zero-first' | 'zero-nodes-first' | 'zero-later' | 'empty-later' | 'short-later' | 'null-node';

export type BoardFake = {
  run: Run;
  calls: string[][];
  reads: () => number;
  probes: () => number;
  issueReads: () => number;
  openReads: () => number;
  moves: () => string[][];
};

type Options = {
  faults?: Fault[];
  probeLies?: boolean;
  hiddenFromIssue?: number[];
  omittedFromList?: number[];
  openIssuesShort?: boolean;
};

const ok = (data: unknown): RunResult => ({ code: 0, stdout: JSON.stringify(data), stderr: '' });

export const boardItem = (issue: number, column: Column = 'Design', labels: string[] = []): BoardItem => ({ issue, column, labels });

function node(item: BoardItem) {
  return {
    id: `I${item.issue}`, fieldValueByName: { name: item.column },
    content: { number: item.issue, title: `t${item.issue}`, repository: { nameWithOwner: item.repo ?? 'o/r' }, labels: { nodes: (item.labels ?? []).map((name) => ({ name })) } },
  };
}

export function boardFake(items: BoardItem[], options: Options = {}): BoardFake {
  const calls: string[][] = [];
  const faults = options.faults ?? [];
  const listed = items.filter((item) => !(options.omittedFromList ?? []).includes(item.issue));
  const total = listed.length;
  let openReads = 0;
  let reads = 0;
  let probes = 0;
  let issueReads = 0;
  const fault = (): Fault => faults[reads - 1] ?? 'none';
  const page = (offset: number) => {
    const nodes: unknown[] = listed.slice(offset, offset + 100).map(node);
    const next = offset + 100 < total;
    const pageInfo = { hasNextPage: next, endCursor: next ? `C${offset + 100}` : null };
    const kind = fault();
    const empty = (count: number) => ({ totalCount: count, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] });
    if (offset === 0 && kind === 'zero-first') return empty(0);
    if (offset === 0 && kind === 'zero-nodes-first') return empty(total);
    if (offset === 0 && kind === 'null-node') return { totalCount: total, pageInfo, nodes: nodes.map((row, i) => (i === 3 ? null : row)) };
    if (offset > 0 && kind === 'zero-later') return empty(0);
    if (offset > 0 && kind === 'empty-later') return empty(total);
    if (offset > 0 && kind === 'short-later') return { totalCount: total, pageInfo: { hasNextPage: false, endCursor: null }, nodes: nodes.slice(0, Math.floor(nodes.length / 2)) };
    return { totalCount: total, pageInfo, nodes };
  };
  const listRun: Run = async (_cmd, args) => {
    calls.push(args);
    const text = args.join(' ');
    if (text.includes('projectV2(number')) {
      return ok({ data: { user: { projectV2: { id: 'P1', field: { id: 'F1', options: COLUMNS.map((name) => ({ id: `id-${name}`, name })) } } } } });
    }
    if (text.includes('orderBy: {field: POSITION')) {
      probes++;
      const count = options.probeLies && fault() !== 'none' ? 0 : total;
      return ok({ data: { node: { items: { totalCount: count, nodes: count === 0 ? [] : [{ id: 'probe' }] } } } });
    }
    if (text.includes('items(first: 100')) {
      const cursor = args.find((arg) => arg.startsWith('cursor='));
      if (cursor === undefined) reads++;
      return ok({ data: { node: { items: page(cursor === undefined ? 0 : Number(cursor.slice('cursor=C'.length))) } } });
    }
    if (text.includes('projectItems(first: 20')) {
      issueReads++;
      const number = Number(args.find((arg) => arg.startsWith('number='))?.slice('number='.length));
      const found = items.find((item) => item.issue === number);
      const shown = found !== undefined && !(options.hiddenFromIssue ?? []).includes(number);
      return ok({ data: { repository: { issue: { projectItems: { nodes: shown ? [{ project: { id: 'P1' }, ...node(found) }] : [] } } } } });
    }
    return { code: 0, stdout: '', stderr: '' };
  };
  const openReply = (): RunResult => {
    openReads++;
    const open = items.filter((item) => item.column !== 'Done' && (item.repo ?? 'o/r') === 'o/r');
    const shown = options.openIssuesShort ? open.slice(0, open.length - 1) : open;
    const nodes = shown.map((item) => ({ number: item.issue, title: `t${item.issue}`, labels: { nodes: (item.labels ?? []).map((name) => ({ name })) }, projectItems: { nodes: [{ id: `I${item.issue}`, project: { id: 'P1' }, fieldValueByName: { name: item.column } }] } }));
    return ok({ data: { repository: { issues: { totalCount: open.length, pageInfo: { hasNextPage: false, endCursor: null }, nodes } } } });
  };
  const run: Run = async (cmd, args, opts) => {
    if (!args.join(' ').includes('issues(states: OPEN')) return listRun(cmd, args, opts);
    calls.push(args);
    return openReply();
  };
  const moves = () => calls.filter((args) => args.join(' ').includes('updateProjectV2ItemFieldValue'));
  return { run, calls, reads: () => reads, probes: () => probes, issueReads: () => issueReads, openReads: () => openReads, moves };
}
