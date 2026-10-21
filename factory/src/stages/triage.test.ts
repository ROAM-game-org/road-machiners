import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_STATE, readState, writeState } from '../state';
import { openStore } from '../public/store';
import { runStage } from './triage';
import type { AgentRun, Card, Ctx } from '../types';

let home = '';
let calls: string[] = [];
let prompt = '';
let effort: string | undefined;
let related = '';
let inWork = '';
let releaseInput = '';
let cards: Card[] = [];

beforeEach(() => {
  mkdirSync('tmp', { recursive: true });
  home = mkdtempSync('tmp/factory-triage-');
  calls = [];
  prompt = '';
  groomPrompt = '';
  groomEffort = undefined;
  related = '';
  inWork = '';
  cards = [card(7, 'Triage')];
  writeState(`${home}/state.json`, structuredClone(EMPTY_STATE));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const RU_PITCH = { title: 'Ночная езда', summary: 'Езжай после заката с фарами.', how: 'Включи фары.', when: 'Ночью, пара ходов.', changed: [], pros: ['Больше времени в пути.'], cons: ['Фары видно издалека.'] };
const RU_TEXT = 'Езжай после заката с фарами.\n\nКак это работает:\nВключи фары.\n\nКогда это выгодно:\nНочью, пара ходов.\n\nПлюсы:\n- Больше времени в пути.\n\nМинусы:\n- Фары видно издалека.';

function groomOf(verdict: string | null, over: Record<string, unknown>): string | null {
  if (verdict === null) return null;
  const haiku = JSON.parse(verdict) as Record<string, unknown>;
  const story = { points: ['Drive at night: headlights light the road.'], changed: [], need: 'Wants to drive at night.', existing: 'Day and night cycle.', version: 'Headlights light the road.', fit: 'Fits all five tests.' };
  return JSON.stringify({ verdict: haiku.verdict, reason: haiku.reason, complexity: haiku.complexity, complexityReason: haiku.complexityReason, bundle: haiku.bundle, releaseFix: haiku.releaseFix, ...story, pitch: RU_PITCH, ...over });
}

let groomPrompt = '';
let groomEffort: string | undefined;
let issueList = '';

function fakeCtx(verdict: string | null, labels: string[] = [], earlier: string[] = [], groomOver: Record<string, unknown> | null = {}): Ctx {
  const record = (name: string) => async (...args: unknown[]) => { calls.push(`${name} ${args.join(' ')}`); };
  const fake = {
    cfg: { home, designModel: 'opus', buildModel: 'sonnet', triageModel: 'haiku', triageEffort: 'low', designEffort: 'medium', repo: 'o/r', committeeChat: 'chat', minVotes: 10 },
    statePath: `${home}/state.json`,
    now: () => new Date('2026-09-30T10:00:00Z'),
    telegram: { sendMessage: async (...args: unknown[]) => { calls.push(`message ${args.join(' ')}`); return 501; } },
    log: () => undefined,
    github: {
      issue: async (number: number) => ({ number, title: number === 7 ? 'Big horn' : `Horn idea ${number}`, body: number === 7 ? 'Add a horn' : `Body of ${number}`, labels: number === 7 ? labels : [], createdAt: '', state: 'OPEN', author: 'anna' }),
      comments: async () => earlier.map((body) => ({ login: 'anna', body, createdAt: '2026-09-30T09:30:00Z', byFactory: body.includes('<!-- roam-factory -->') })),
      cards: async () => cards,
      allIssues: async () => [7, 670].map((number) => ({ number, title: number === 7 ? 'Big horn' : 'Hireable merc guards', body: number === 7 ? 'Add a horn' : 'Hire a merc', labels: number === 7 ? [] : ['release-candidate'], createdAt: '', state: 'OPEN', author: 'anna' })),
      comment: record('comment'), addLabel: record('addLabel'), close: record('close'), move: record('move'),
    },
    container: {
      agent: async (run: AgentRun) => {
        calls.push(`agent ${run.model}`);
        if (run.prompt.startsWith('This is the grooming step')) {
          groomPrompt = run.prompt;
          issueList = readFileSync(`${run.clone}/${run.dir}/.factory/issues.md`, 'utf8');
          groomEffort = run.effort;
          const groomed = groomOver === null ? null : groomOf(verdict, groomOver);
          if (groomed !== null) writeFileSync(`${run.clone}/${run.dir}/.factory/groom.json`, groomed);
          return;
        }
        effort = run.effort;
        related = readFileSync(`${run.clone}/${run.dir}/.factory/related.md`, 'utf8');
        inWork = readFileSync(`${run.clone}/${run.dir}/.factory/in-work.md`, 'utf8');
        releaseInput = readFileSync(`${run.clone}/${run.dir}/.factory/release.md`, 'utf8');
        prompt = run.prompt;
        if (verdict !== null) writeFileSync(`${run.clone}/${run.dir}/.factory/triage.json`, verdict);
      },
    },
    repo: {
      fetch: record('fetch'), push: record('push'), fetchFromWork: record('fetchFromWork'),
      prepareWorkClone: async (_b: string, _base: string, dir: string) => { mkdirSync(dir, { recursive: true }); },
    },
  };
  return fake as unknown as Ctx;
}

const verdict = (over: Record<string, unknown>): string => JSON.stringify({ verdict: 'ready', reason: 'Clear goal', hotfix: false, releaseFix: false, complexity: 'intermediate', complexityReason: 'Touches the horn code and the audio module.', bundle: [], ...over });
const unclear = (questions: string[], earlier: string[] = []): Ctx => fakeCtx(verdict({}), [], earlier, { verdict: 'unclear', reason: 'It asks for a horn, but not which one.', questions });
const card = (issue: number, column: Card['column'], labels: string[] = []): Card => ({ itemId: `i${issue}`, issue, column, labels });

describe('triage stage', () => {
  it('comments and moves to Design when ready', async () => {
    await runStage(fakeCtx(verdict({})), 7);
    expect(calls).toContain('agent haiku');
    expect(effort).toBe('low');
    expect(calls.find((call) => call.startsWith('comment 7 Triage passed: Clear goal'))).toContain('Model routing from triage: intermediate, default models');
    expect(calls.at(-1)).toBe('move 7 Design');
    expect(prompt).not.toContain('{{');
    expect(calls.filter((call) => call.startsWith('push') || call.startsWith('message') || call.startsWith('addLabel'))).toEqual([]);
  });

  it('explains the 20/80 model target and the routing effects without replacing the complexity rubric', async () => {
    await runStage(fakeCtx(verdict({})), 7);
    expect(prompt).toContain('20% Opus and 80% Sonnet');
    expect(prompt).toContain('`trivial` moves design to Sonnet');
    expect(prompt).toContain('`hard` moves implementation to Opus');
    expect(prompt).toContain('Do not change a complexity rating to chase the target');
  });

  it('labels a hotfix, warns the committee and moves to Design', async () => {
    await runStage(fakeCtx(verdict({ hotfix: true, reason: 'Saves from 0.3 fail to load.' }), ['bug']), 7);
    expect(calls.slice(-4)).toEqual([
      'addLabel 7 hotfix',
      expect.stringContaining('comment 7 Triage passed as a hotfix: Saves from 0.3 fail to load.\n\nIt branches from main, and its approval ships it to main and itch.io at once.\n\nModel routing from triage:'),
      'message chat ⚠️ Triage marked #7 Big horn as a hotfix.\nSaves from 0.3 fail to load.\nIt skips dev. Its approval will merge into main and ship to itch.io at once. Remove the label hotfix on GitHub if it can wait for a release.',
      'move 7 Design',
    ]);
  });

  it('adds design-sonnet for a trivial task and records the rationale', async () => {
    await runStage(fakeCtx(verdict({ complexity: 'trivial', complexityReason: 'One constant in one file.' })), 7);
    expect(calls).toContain('addLabel 7 design-sonnet');
    expect(calls.find((call) => call.startsWith('comment 7 Triage passed'))).toContain('Model routing from triage: trivial, label design-sonnet. One constant in one file.');
  });

  it('adds implementation-opus for a hard task', async () => {
    await runStage(fakeCtx(verdict({ complexity: 'hard', complexityReason: 'Pathing, combat and saves interact.' })), 7);
    expect(calls).toContain('addLabel 7 implementation-opus');
    expect(calls).not.toContain('addLabel 7 design-sonnet');
  });

  it('adds no label for an intermediate task, and triage itself runs on the build model', async () => {
    await runStage(fakeCtx(verdict({})), 7);
    expect(calls.filter((call) => call.startsWith('addLabel'))).toEqual([]);
    expect(calls).toContain('agent haiku');
  });

  it('leaves labels a member set, even against its own rating', async () => {
    await runStage(fakeCtx(verdict({ complexity: 'hard' }), ['design-sonnet']), 7);
    expect(calls.filter((call) => call.startsWith('addLabel'))).toEqual([]);
    expect(calls.find((call) => call.startsWith('comment 7 Triage passed'))).toContain('left as set on the issue (design-sonnet)');
  });

  it('does not relabel on a later run after a member removed the label', async () => {
    writeState(`${home}/state.json`, { ...structuredClone(EMPTY_STATE), routed: [7] });
    await runStage(fakeCtx(verdict({ complexity: 'trivial' }), [], ['Triage passed: x\n\nModel routing from triage: trivial, label design-sonnet. y\n\n<!-- roam-factory -->']), 7);
    expect(calls.filter((call) => call.startsWith('addLabel'))).toEqual([]);
    expect(calls.find((call) => call.startsWith('comment 7 Triage passed'))).toContain('kept as the committee left the labels');
  });

  it('routes by the state record, not by routing lines in the comments, and records the routing', async () => {
    await runStage(fakeCtx(verdict({ complexity: 'trivial' }), [], ['Triage passed: x\n\nModel routing from triage: hard, default models.\n\n<!-- roam-factory -->']), 7);
    expect(calls.filter((call) => call.startsWith('addLabel'))).toEqual(['addLabel 7 design-sonnet']);
    expect(readState(`${home}/state.json`).routed).toEqual([7]);
  });

  it.each([
    [{ complexity: 'huge' }, 'complexity as trivial'],
    [{ complexityReason: ' ' }, 'complexityReason'],
  ])('throws on bad complexity %#', async (over, message) => {
    await expect(runStage(fakeCtx(verdict(over)), 7)).rejects.toThrow(message);
  });

  it('refuses, labels, closes and moves to Done on wont-do', async () => {
    await runStage(fakeCtx(verdict({ verdict: 'wont-do', reason: 'Against the design.' })), 7);
    expect(calls).toContain('comment 7 Against the design.');
    expect(calls).toContain('addLabel 7 wont-do');
    expect(calls).toContain('close 7 not planned');
    expect(calls.at(-1)).toBe('move 7 Done');
  });

  it.each(['vote', 'unclear'])('sends a feature that Haiku marked %s to grooming, with no questions from Haiku', async (kind) => {
    await runStage(fakeCtx(verdict({ verdict: kind, questions: ['Which horn?'] }), [], [], { verdict: 'ready' }), 7);
    expect(calls).toContain('agent opus');
    expect(calls).not.toContain('addLabel 7 needs-info');
    expect(calls.at(-1)).toBe('move 7 Design');
  });

  it.each(['vote', 'unclear'])('never lets Haiku pick %s for a bug', async (kind) => {
    await expect(runStage(fakeCtx(verdict({ verdict: kind, questions: ['Which horn?'] }), ['bug']), 7)).rejects.toThrow(`unknown verdict: ${kind}`);
    expect(calls.filter((call) => /^(comment|addLabel|message)/.test(call))).toEqual([]);
  });

  it('asks every groomed question in one set with an @mention, and leaves the card', async () => {
    await runStage(unclear(['Which horn?', 'How loud?']), 7);
    const posts = calls.filter((call) => call.startsWith('comment 7'));
    expect(posts).toHaveLength(1);
    expect(posts[0]).toContain('## Questions from the factory');
    expect(posts[0]).toContain('@anna');
    expect(posts[0]).toContain('1. Which horn?\n2. How loud?');
    expect(calls).toContain('addLabel 7 needs-info');
    expect(calls.filter((call) => call.startsWith('move'))).toEqual([]);
    expect(existsSync(`${home}/groomed/issue-7.md`)).toBe(false);
  });

  it('sends the committee the title, link, reason and questions, and records the post for replies', async () => {
    await runStage(unclear(['Which horn?', 'How loud?']), 7);
    const messages = calls.filter((call) => call.startsWith('message'));
    expect(messages).toEqual(['message chat ❓ Triage asks on #7 Big horn\nhttps://github.com/o/r/issues/7\n\nIt asks for a horn, but not which one.\n\n1. Which horn?\n2. How loud?\n\nReply to this message to answer, or answer on GitHub.']);
    expect(readState(`${home}/state.json`).questionPosts).toEqual({ 501: 7 });
  });

  it('cuts a long notice to one Telegram message', async () => {
    await runStage(unclear(['x'.repeat(5000)]), 7);
    const message = calls.find((call) => call.startsWith('message chat ')) ?? '';
    expect(message.length - 'message chat '.length).toBeLessThanOrEqual(4096);
    expect(message).toMatch(/…\n\nReply to this message to answer, or answer on GitHub\.$/);
  });

  it('adds no second notice while the earlier question set is unanswered', async () => {
    writeState(`${home}/state.json`, { ...structuredClone(EMPTY_STATE), asked: { 7: '2026-09-30T09:00:00Z' } });
    await runStage(unclear(['Which horn?']), 7);
    expect(calls).toContain('addLabel 7 needs-info');
    expect(calls.filter((call) => call.startsWith('message'))).toEqual([]);
  });

  it('notifies again for a new set after the author answered', async () => {
    writeState(`${home}/state.json`, { ...structuredClone(EMPTY_STATE), asked: { 7: '2026-09-30T09:00:00Z' } });
    await runStage(unclear(['Which horn?'], ['This one']), 7);
    expect(calls.filter((call) => call.startsWith('message'))).toHaveLength(1);
    expect(readState(`${home}/state.json`).asked).toEqual({ 7: '2026-09-30T10:00:00.000Z' });
  });

  it('records the time of the questions it asked', async () => {
    await runStage(unclear(['Which horn?']), 7);
    expect(readState(`${home}/state.json`).asked).toEqual({ 7: '2026-09-30T10:00:00.000Z' });
  });

  it('keeps the questions and label when Telegram fails, and records no post', async () => {
    const ctx = unclear(['Which horn?']);
    (ctx.telegram as { sendMessage: unknown }).sendMessage = async () => { throw new Error('down'); };
    await runStage(ctx, 7);
    expect(calls).toContain('addLabel 7 needs-info');
    expect(readState(`${home}/state.json`).questionPosts).toEqual({});
  });

  it.each([
    [{ questions: [] }, 'questions as a non-empty list'],
    [{ questions: [3] }, 'questions as a non-empty string'],
    [{ reason: ' ' }, 'reason'],
  ])('throws on a bad unclear groom.json %#', async (over, message) => {
    await expect(runStage(fakeCtx(verdict({}), [], [], { verdict: 'unclear', questions: ['Which horn?'], ...over }), 7)).rejects.toThrow(message);
    expect(calls.filter((call) => /^(comment|addLabel|message)/.test(call))).toEqual([]);
  });

  it('throws when triage.json is missing', async () => {
    await expect(runStage(fakeCtx(null), 7)).rejects.toThrow('no .factory/triage.json');
  });

  it.each([
    ['not json', 'Unexpected'],
    ['[]', 'unknown verdict'],
    [verdict({ verdict: 'maybe' }), 'unknown verdict: maybe'],
    [verdict({ reason: '' }), 'reason'],
    [JSON.stringify({ verdict: 'ready', reason: 'x' }), 'hotfix as true or false'],
    [verdict({ hotfix: 'yes' }), 'hotfix as true or false'],
    [JSON.stringify({ verdict: 'ready', reason: 'x', hotfix: false, releaseFix: false, complexity: 'intermediate', complexityReason: 'y' }), 'bundle as a list of issue numbers'],
    [verdict({ bundle: ['9'] }), 'bundle as a list of issue numbers'],
    [verdict({ bundle: [11] }), 'bundles #11, which is not an offered Triage card'],
    [verdict({ bundle: [9, 9] }), 'bundles an issue twice'],
    [JSON.stringify({ verdict: 'duplicate', reason: 'Same failure.' }), 'duplicateOf as an issue number'],
    [JSON.stringify({ verdict: 'duplicate', reason: 'Same failure.', duplicateOf: 9 }), "names #9 as the duplicate's card, which is not an offered card in work"],
    [JSON.stringify({ verdict: 'duplicate', reason: '', duplicateOf: 20 }), 'reason'],
    [verdict({ releaseFix: 'yes' }), 'releaseFix as true or false'],
    [verdict({ releaseFix: true }), 'no release takes fixes now'],
  ])('throws on a bad triage.json of a bug %#', async (text, message) => {
    cards = [card(7, 'Triage'), card(9, 'Triage'), card(20, 'Testing')];
    await expect(runStage(fakeCtx(text, ['bug']), 7)).rejects.toThrow(message);
    expect(calls.filter((call) => /^(comment|move|close|addLabel)/.test(call))).toEqual([]);
    expect(readState(`${home}/state.json`).bundles).toEqual({});
  });

  it('passes a non-bug to grooming on the verdict and reason alone', async () => {
    await runStage(fakeCtx(JSON.stringify({ verdict: 'ready', reason: 'Asks for a horn.' }), [], [], { complexity: 'intermediate', complexityReason: 'Horn code.', bundle: [], releaseFix: false }), 7);
    expect(calls).toContain('agent opus');
    expect(calls.at(-1)).toBe('move 7 Design');
  });

  it('tells Haiku whether the issue is labeled a bug', async () => {
    await runStage(fakeCtx(verdict({})), 7);
    expect(prompt).toContain('It is not labeled as a bug, so it is a request for a feature or a change.');
    await runStage(fakeCtx(verdict({}), ['bug']), 7);
    expect(prompt).toContain('It is labeled as a bug report.');
  });
});

describe('triage release fixes', () => {
  const release = { issue: 40, branch: 'release/2026-09-29', day: '2026-09-29', postId: null, removed: [], tasks: [], merges: [{ issue: 5, title: 'Night driving', sha: 'a'.repeat(40), into: 'dev', reverted: [] }], candidateSha: null, playtest: { seed: 1, runs: 0, passed: null, blocked: null, notes: [] } };
  const openRelease = (postId: number | null) => writeState(`${home}/state.json`, { ...structuredClone(EMPTY_STATE), release: { ...release, postId } });

  it('tells the agent that no release takes fixes when none is open', async () => {
    await runStage(fakeCtx(verdict({})), 7);
    expect(releaseInput).toContain('No release takes fixes now.');
  });

  it('lists the features of a release that has no candidate post yet', async () => {
    openRelease(null);
    await runStage(fakeCtx(verdict({})), 7);
    expect(releaseInput).toContain('Release 2026-09-29 takes fixes.');
    expect(releaseInput).toContain('- #5 Night driving');
    expect(releaseInput).not.toContain('Merge main');
  });

  it('takes no fixes once the candidate is posted', async () => {
    openRelease(123);
    await expect(runStage(fakeCtx(verdict({ releaseFix: true })), 7)).rejects.toThrow('no release takes fixes now');
    expect(releaseInput).toContain('No release takes fixes now.');
  });

  it('labels a release fix as a release task, names the release and drops the dev clone', async () => {
    openRelease(null);
    await runStage(fakeCtx(verdict({ releaseFix: true, reason: 'Fixes the headlights of #5.' })), 7);
    expect(calls).toContain('addLabel 7 release-task');
    expect(readState(`${home}/state.json`).release?.tasks).toEqual([7]);
    expect(calls.find((call) => call.startsWith('comment 7 Triage passed as a fix for release 2026-09-29: Fixes the headlights of #5.'))).toContain('It branches from release/2026-09-29');
    expect(calls.at(-1)).toBe('move 7 Design');
    expect(existsSync(`${home}/work/issue-7`)).toBe(false);
  });

  it('keeps the dev clone of a normal card for Design', async () => {
    openRelease(null);
    await runStage(fakeCtx(verdict({})), 7);
    expect(calls).not.toContain('addLabel 7 release-task');
    expect(existsSync(`${home}/work/issue-7`)).toBe(true);
  });

  it('drops the dev clone of a hotfix, so Design branches it from main', async () => {
    await runStage(fakeCtx(verdict({ hotfix: true }), ['bug']), 7);
    expect(existsSync(`${home}/work/issue-7`)).toBe(false);
  });

  it('refuses a hotfix that is also a release fix', async () => {
    openRelease(null);
    await expect(runStage(fakeCtx(verdict({ hotfix: true, releaseFix: true }), ['bug']), 7)).rejects.toThrow('marks a hotfix as a release fix');
  });
});

const triageComments = (): string[] => calls.filter((call) => call.startsWith('comment 7') && !call.startsWith('comment 7 ## Groomed request'));

describe('triage vote', () => {
  const vote = (over: Record<string, unknown> = {}): Ctx => fakeCtx(verdict({}), [], [], { verdict: 'vote', reason: 'A new system that players should choose.', ...over });

  it('labels the card, stores the composed Russian pitch, comments once and leaves the card in Triage', async () => {
    await runStage(vote({ complexity: 'trivial', complexityReason: 'One constant.' }), 7);
    expect(calls).toContain('addLabel 7 design-sonnet');
    expect(calls).toContain('addLabel 7 voting');
    const comments = triageComments();
    expect(comments).toHaveLength(1);
    expect(comments[0]).toContain('player vote');
    expect(comments[0]).toContain('A new system that players should choose.');
    expect(calls.filter((call) => call.startsWith('move'))).toEqual([]);
    const store = openStore(home);
    expect(store.proposal(7)?.pitch).toBe(`${RU_PITCH.title}\n\n${RU_TEXT}`);
    store.close();
  });

  it('adds the voting label before it writes the proposal row, and comments after both', async () => {
    const ctx = vote();
    const seen: string[] = [];
    const add = ctx.github.addLabel;
    ctx.github.addLabel = async (number: number, label: string) => {
      const store = openStore(home);
      seen.push(`${label} row ${store.proposal(number) === null ? 'absent' : 'present'}`);
      store.close();
      return add(number, label);
    };
    const comment = ctx.github.comment;
    ctx.github.comment = async (number: number, body: string) => {
      const store = openStore(home);
      seen.push(`comment row ${store.proposal(number) === null ? 'absent' : 'present'}`);
      store.close();
      return comment(number, body);
    };
    await runStage(ctx, 7);
    expect(seen).toContain('voting row absent');
    expect(seen.at(-1)).toBe('comment row present');
    expect(triageComments()).toHaveLength(1);
  });

  it('writes no row and no triage comment when adding the voting label fails, so a rerun starts clean', async () => {
    const ctx = vote();
    ctx.github.addLabel = async () => { throw new Error('GitHub down'); };
    await expect(runStage(ctx, 7)).rejects.toThrow('GitHub down');
    const store = openStore(home);
    expect(store.proposal(7)).toBeNull();
    store.close();
    expect(triageComments()).toEqual([]);
  });

  it('adds the bundle like ready', async () => {
    cards = [card(7, 'Triage'), card(9, 'Triage')];
    await runStage(vote({ bundle: [9] }), 7);
    expect(calls).toContain('addLabel 9 bundled');
    expect(calls).toContain('move 9 Done');
    expect(readState(`${home}/state.json`).bundles['7']).toEqual([9]);
  });

  it('makes a voted feature no hotfix, whatever Haiku wrote', async () => {
    await runStage(fakeCtx(verdict({ hotfix: true }), [], [], { verdict: 'vote', reason: 'New.' }), 7);
    expect(calls).not.toContain('addLabel 7 hotfix');
    expect(calls).toContain('addLabel 7 voting');
  });

  it.each([
    [{ bundle: [11] }, 'bundles #11, which is not an offered Triage card'],
    [{ bundle: undefined }, 'bundle as a list of issue numbers'],
    [{ releaseFix: undefined }, 'releaseFix as true or false'],
    [{ releaseFix: true }, 'no release takes fixes now'],
  ])('refuses a bad groom.json bundle or release fix %#', async (over, message) => {
    await expect(runStage(vote(over), 7)).rejects.toThrow(message);
  });

  it.each([
    [{ pitch: undefined }, 'needs a pitch'],
    [{ pitch: { ...RU_PITCH, title: ' ' } }, 'pitch.title'],
    [{ pitch: { ...RU_PITCH, when: '' } }, 'pitch.when'],
    [{ pitch: { ...RU_PITCH, cons: [] } }, 'pitch.cons'],
    [{ need: '' }, 'need'],
    [{ verdict: 'maybe' }, 'unknown verdict: maybe'],
    [{ complexity: 'huge' }, 'complexity as trivial'],
  ])('refuses a bad groom.json %#', async (over, message) => {
    await expect(runStage(vote(over), 7)).rejects.toThrow(message);
    expect(calls.filter((call) => /^(comment|move|close|addLabel)/.test(call))).toEqual([]);
    const store = openStore(home);
    expect(store.proposal(7)).toBeNull();
    store.close();
  });
});

describe('triage grooming', () => {
  it('gives the groom run every other issue with its state, board column and labels', async () => {
    cards = [card(7, 'Triage'), card(670, 'Merging')];
    await runStage(fakeCtx(verdict({})), 7);
    expect(issueList).toContain('UNTRUSTED USER TEXT');
    expect(issueList).toContain('# #670 Hireable merc guards\n\nState: OPEN. Board: Merging. Labels: release-candidate.\n\nHire a merc');
    expect(issueList).not.toContain('# #7 ');
  });

  it('shows dropped or changed points on the issue and in the pitch', async () => {
    const changed = ['Rest: the game has no rest action.'];
    await runStage(fakeCtx(verdict({}), [], [], { verdict: 'vote', reason: 'New.', changed, pitch: { ...RU_PITCH, changed: ['Отдыха в игре нет.'] } }), 7);
    expect(calls.find((call) => call.startsWith('comment 7 ## Groomed request'))).toContain('Dropped or changed: \n- Rest: the game has no rest action.');
    const store = openStore(home);
    expect(store.proposal(7)?.pitch).toContain('Что изменено в запросе:\n- Отдыха в игре нет.');
    store.close();
  });

  it('grooms a non-bug on the design model and effort, after the Haiku run', async () => {
    await runStage(fakeCtx(verdict({})), 7);
    expect(calls.filter((call) => call.startsWith('agent'))).toEqual(['agent haiku', 'agent opus']);
    expect(effort).toBe('low');
    expect(groomEffort).toBe('medium');
    expect(groomPrompt).toContain('Issue 7 is the request.');
    expect(groomPrompt).not.toContain('{{');
  });

  it('skips grooming for a bug and a hotfix label', async () => {
    await runStage(fakeCtx(verdict({}), ['bug']), 7);
    await runStage(fakeCtx(verdict({}), ['hotfix']), 7);
    expect(calls.filter((call) => call.startsWith('agent'))).toEqual(['agent haiku', 'agent haiku']);
    expect(calls.some((call) => call.includes('## Groomed request'))).toBe(false);
  });

  it('comments the groomed request and saves it for design', async () => {
    await runStage(fakeCtx(verdict({})), 7);
    const groomed = calls.find((call) => call.startsWith('comment 7 ## Groomed request')) ?? '';
    expect(groomed).toContain('Player need: Wants to drive at night.');
    expect(groomed).toContain('Groomed version: Headlights light the road.');
    expect(readFileSync(`${home}/groomed/issue-7.md`, 'utf8')).toBe(`${groomed.slice('comment 7 '.length)}\n`);
  });

  it('drops an old groomed request when the new run refuses or skips grooming', async () => {
    mkdirSync(`${home}/groomed`, { recursive: true });
    writeFileSync(`${home}/groomed/issue-7.md`, 'old\n');
    await runStage(fakeCtx(verdict({}), ['bug']), 7);
    expect(existsSync(`${home}/groomed/issue-7.md`)).toBe(false);
  });

  it('lets grooming turn a ready request into a vote, with its own routing', async () => {
    await runStage(fakeCtx(verdict({}), [], [], { verdict: 'vote', reason: 'A new mechanic.', complexity: 'hard', complexityReason: 'Saves change.' }), 7);
    expect(calls).toContain('addLabel 7 voting');
    expect(calls).toContain('addLabel 7 implementation-opus');
    expect(calls.filter((call) => call.startsWith('move'))).toEqual([]);
    const store = openStore(home);
    expect(store.proposal(7)?.pitch).toBe(`${RU_PITCH.title}\n\n${RU_TEXT}`);
    store.close();
  });

  it('takes the reason of a ready request from grooming', async () => {
    await runStage(fakeCtx(verdict({}), [], [], { verdict: 'ready', reason: 'A fairer value.' }), 7);
    expect(calls.find((call) => call.startsWith('comment 7 Triage passed:'))).toContain('A fairer value.');
    expect(calls.at(-1)).toBe('move 7 Design');
  });

  it('refuses a request the game already covers, and saves nothing for design', async () => {
    await runStage(fakeCtx(verdict({}), [], [], { verdict: 'wont-do', reason: 'Scavenging already pays early money.' }), 7);
    expect(calls).toContain('comment 7 Scavenging already pays early money.');
    expect(calls).toContain('close 7 not planned');
    expect(calls.at(-1)).toBe('move 7 Done');
    expect(existsSync(`${home}/groomed/issue-7.md`)).toBe(false);
  });

  it('keeps a release fix out of a vote', async () => {
    writeState(`${home}/state.json`, { ...structuredClone(EMPTY_STATE), release: { issue: 40, branch: 'release/x', day: 'x', postId: null, removed: [], tasks: [], merges: [], candidateSha: null, playtest: { seed: 1, runs: 0, passed: null, blocked: null, notes: [] } } });
    await expect(runStage(fakeCtx(verdict({ releaseFix: true }), [], [], { verdict: 'vote' }), 7)).rejects.toThrow('puts a release fix to a vote');
  });

  it('throws when groom.json is missing', async () => {
    await expect(runStage(fakeCtx(verdict({}), [], [], null), 7)).rejects.toThrow('no .factory/groom.json');
  });

  it('tells Haiku to only filter, and the groomer to decide and ask in one set', async () => {
    await runStage(fakeCtx(verdict({})), 7);
    expect(prompt).toContain('Never refuse a request that is not a bug because it does not fit the game as written.');
    expect(prompt).toContain('You never ask the author questions.');
    expect(groomPrompt).toContain('You decide everything else: the verdict, the bundle, the release fix and the complexity.');
    expect(groomPrompt).toContain('Put every open question in this one set');
  });

  it('bundles what grooming picks, not what Haiku wrote', async () => {
    cards = [card(7, 'Triage'), card(9, 'Triage')];
    await runStage(fakeCtx(verdict({ bundle: [9] }), [], [], { bundle: [] }), 7);
    expect(calls).not.toContain('addLabel 9 bundled');
    expect(readState(`${home}/state.json`).bundles).toEqual({});
  });
});

describe('triage bundles', () => {
  it('offers only free Triage cards: not itself, not stuck, waiting, voting, hotfix, bundled, a lead or busy', async () => {
    cards = [
      card(7, 'Triage'), card(9, 'Triage'), card(10, 'Triage', ['needs-info']), card(11, 'Design'), card(12, 'Triage', ['factory-stuck']),
      card(13, 'Triage', ['hotfix']), card(14, 'Triage'), card(15, 'Triage'), card(16, 'Done', ['bundled']), card(17, 'Triage', ['voting']),
    ];
    writeState(`${home}/state.json`, { ...structuredClone(EMPTY_STATE), bundles: { '14': [16] }, jobs: [{ id: 'triage-15', stage: 'triage', issue: 15, pid: 1, startedAt: '', log: '' }] });
    await runStage(fakeCtx(verdict({})), 7);
    expect(related).toContain('# #9 Horn idea 9\n\nBody of 9');
    expect(related.match(/^# #/gm)).toHaveLength(1);
    expect(related).toContain('UNTRUSTED USER TEXT');
  });

  it('says so when no other request waits in Triage', async () => {
    await runStage(fakeCtx(verdict({})), 7);
    expect(related).toContain('No other request waits in Triage.');
  });

  it('folds the chosen cards into the lead, records the bundle and names it on the lead', async () => {
    cards = [card(7, 'Triage'), card(9, 'Triage'), card(10, 'Triage')];
    await runStage(fakeCtx(verdict({ bundle: [9, 10], reason: 'Both ask for a horn.' })), 7);
    expect(calls).toContain('comment 9 Triage bundled this into #7, which carries it from here: Both ask for a horn.\n\nIt closes when #7 ships.');
    expect(calls).toContain('addLabel 9 bundled');
    expect(calls).toContain('move 9 Done');
    expect(calls).toContain('move 10 Done');
    expect(calls.find((call) => call.startsWith('comment 7 Triage passed:'))).toMatch(/^comment 7 Triage passed: Both ask for a horn\.\n\nThis card also carries #9, #10\.\n\n/);
    expect(calls.at(-1)).toBe('move 7 Design');
    expect(readState(`${home}/state.json`).bundles).toEqual({ '7': [9, 10] });
  });

  describe('reference image for a new location', () => {
    it('tells the groomer to ask for an image when a new location has none, without wont-do', async () => {
      await runStage(fakeCtx(verdict({})), 7);
      expect(groomPrompt).toContain('A request for a NEW authored gameplay location or landmark needs a reference image of the place.');
      expect(groomPrompt).toContain('This does not apply to a change to an existing location, a generic biome or procedural-system change, or any other request.');
      expect(groomPrompt).toContain('Never ask for one again after an earlier set asked for it.');
      expect(groomPrompt).toContain('Never pick `wont-do` only because the image is missing.');
      expect(groomPrompt).toContain('upload it again');
      expect(prompt).not.toContain('reference image of');
    });

    it('comments the question, labels needs-info and keeps the card in Triage', async () => {
      await runStage(unclear(['Can you upload a reference image of the junkyard on this issue?']), 7);
      expect(calls.find((call) => call.startsWith('comment 7 ## Questions from the factory'))).toContain('1. Can you upload a reference image of the junkyard on this issue?');
      expect(calls).toContain('addLabel 7 needs-info');
      expect(calls.filter((call) => /^(move|close)/.test(call))).toEqual([]);
    });
  });
});

describe('triage duplicates', () => {
  const duplicate = (duplicateOf: number): string => JSON.stringify({ verdict: 'duplicate', reason: 'Same sound decode failure as #20.', duplicateOf });

  it('offers every card from Design to Merging, hotfixes included, and no Triage, Done or bundled card', async () => {
    cards = [card(7, 'Triage'), card(9, 'Triage'), card(20, 'Merging'), card(21, 'Testing', ['hotfix']), card(22, 'Done'), card(23, 'Design', ['bundled'])];
    await runStage(fakeCtx(verdict({}), ['bug']), 7);
    expect(inWork).toContain('UNTRUSTED USER TEXT');
    expect(inWork).toContain('# #20 Horn idea 20\n\nBody of 20');
    expect(inWork).toContain('# #21 Horn idea 21');
    expect(inWork).not.toMatch(/# #(7|9|22|23) /);
  });

  it('says when no card is in work', async () => {
    await runStage(fakeCtx(verdict({}), ['bug']), 7);
    expect(inWork).toContain('No card is in work.');
  });

  it.each([[['bug']], [[]]])('folds a duplicate into its card in work with no card of its own, and skips grooming %#', async (labels) => {
    cards = [card(7, 'Triage'), card(20, 'Testing', ['hotfix'])];
    await runStage(fakeCtx(duplicate(20), labels), 7);
    expect(calls.find((call) => call.startsWith('comment 7'))).toContain('Triage bundled this into #20');
    expect(calls).toContain('addLabel 7 bundled');
    expect(calls.at(-1)).toBe('move 7 Done');
    expect(calls.filter((call) => call.startsWith('agent'))).toEqual(['agent haiku']);
    expect(readState(`${home}/state.json`).bundles['20']).toEqual([7]);
  });

  it('fails when the card left the work columns while triage ran, so the retry sees the board again', async () => {
    cards = [card(7, 'Triage'), card(20, 'Merging')];
    const ctx = fakeCtx(duplicate(20), ['bug']);
    let reads = 0;
    ctx.github.cards = async () => (reads++ === 0 ? cards : [card(7, 'Triage'), card(20, 'Done')]);
    await expect(runStage(ctx, 7)).rejects.toThrow('#20 left the work columns while triage ran');
    expect(readState(`${home}/state.json`).bundles).toEqual({});
  });

  it('lets a hotfix bundle a duplicate waiting in Triage', async () => {
    cards = [card(7, 'Triage'), card(9, 'Triage')];
    await runStage(fakeCtx(verdict({ hotfix: true, bundle: [9] }), ['bug']), 7);
    expect(calls).toContain('addLabel 7 hotfix');
    expect(readState(`${home}/state.json`).bundles['7']).toEqual([9]);
  });
});
