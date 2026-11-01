
export type Ending = 'complete' | 'death' | 'error';
export type LogSummary = { turns: number; shots: number; destroyed: number; knockouts: number; deaths: number; stalls: number; moneyIn: number; moneyOut: number; npcGoals: Record<string, number>; playerTiles: number };
export type LogFacts = { seed: number; turns: number; sha: string | null; lines: number; events: number; ending: Ending; endTurn: number; message: string | null; summary: LogSummary; quiet: string[] };

export type BalanceNumbers = { head: string; baseline: string };
export type Finding = { id: string; severity: 'important' | 'minor' | 'balance'; title: string; evidence: string; cause: 'release' | 'old'; why: string; known: number | null; fixed: boolean; numbers: BalanceNumbers | null };
export type Review = {
  verdict: 'clean' | 'fixed' | 'blocked';
  summary: string;
  drama: string;
  observations: string[];
  suspected: string[];
  limitations: string[];
  findings: Finding[];
  fixes: string[];
  explanations: { death: string | null; quiet: string | null };
  blocker: string | null;
};
export type Outcome = { outcome: 'clean' | 'replay' | 'blocked'; reason: string };
export type PlayState = { moved: boolean; last: boolean; fixedEarlier: boolean };

type Line = Record<string, unknown> & { k?: string };

export function logFacts(text: string, want: { seed: number; turns: number; sha: string }): LogFacts {
  const lines = text.split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line) as Line);
  const header = only(lines, 'run');
  const end = only(lines, 'end');
  const summary = only(lines, 'summary') as unknown as LogSummary;
  if (header.seed !== want.seed || header.turns !== want.turns || header.sha !== want.sha) {
    throw new Error(`The playtest log is of seed ${String(header.seed)}, ${String(header.turns)} turns at ${String(header.sha)}, not seed ${want.seed}, ${want.turns} turns at ${want.sha}`);
  }
  const events = lines.filter((line) => line.k === 'event').length;
  return { seed: want.seed, turns: want.turns, sha: want.sha, lines: lines.length, events, ending: end.reason as Ending, endTurn: end.turn as number, message: (end.message as string | null) ?? null, summary, quiet: quietParts(summary) };
}

function only(lines: Line[], kind: string): Line {
  const found = lines.filter((line) => line.k === kind);
  if (found.length !== 1) throw new Error(`The playtest log has ${found.length} ${kind} lines, not one`);
  return found[0];
}

export function quietParts(summary: LogSummary): string[] {
  const parts: string[] = [];
  if (summary.shots === 0) parts.push('no shots were fired');
  if (summary.moneyIn + summary.moneyOut === 0) parts.push("the player's money never changed");
  if (Object.keys(summary.npcGoals).length === 0) parts.push('no NPC took up a goal');
  if (summary.playerTiles === 0) parts.push('the player truck never moved');
  return parts;
}

const VERDICTS = ['clean', 'fixed', 'blocked'];
const SEVERITIES = ['important', 'minor', 'balance'];
const CAUSES = ['release', 'old'];
const LISTS = ['observations', 'suspected', 'limitations', 'findings', 'fixes'] as const;
const TEXT_LISTS = ['observations', 'suspected', 'limitations', 'fixes'] as const;

export type ReviewRead = { review: Review } | { errors: string[] };

export function readReview(text: string | null): Review {
  const read = parseReview(text);
  if ('errors' in read) throw new Error(read.errors.join('\n'));
  return read.review;
}

export function parseReview(text: string | null): ReviewRead {
  if (text === null) return { errors: ['The playtest agent wrote no .factory/playtest.json'] };
  const json = jsonOf(text);
  if ('error' in json) return { errors: [json.error] };
  const review = json.value as Review;
  const errors = reviewErrors(review);
  if (errors.length > 0) return { errors };
  return { review: { ...review, findings: review.findings.map(withDefaults), explanations: explanationsOf(review.explanations), blocker: review.blocker ?? null } };
}

function jsonOf(text: string): { value: object } | { error: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { error: `.factory/playtest.json is not valid JSON: ${(error as Error).message}` };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { error: '.factory/playtest.json is not one JSON object' };
  return { value };
}

function reviewErrors(review: Review): string[] {
  const verdict = VERDICTS.includes(review.verdict) ? [] : [`The playtest verdict ${String(review.verdict)} is not clean, fixed or blocked`];
  const missing = LISTS.filter((key) => !Array.isArray(review[key])).map((key) => `The playtest review has no ${key} list`);
  const notText = TEXT_LISTS.filter((key) => Array.isArray(review[key]) && !review[key].every((item) => typeof item === 'string')).map((key) => `The ${key} list holds an item that is not a string`);
  const findings = Array.isArray(review.findings) ? review.findings.flatMap(findingErrors) : [];
  return [...verdict, ...missing, ...notText, ...findings];
}

function findingErrors(given: Finding, index: number): string[] {
  if (typeof given !== 'object' || given === null) return [`Finding ${index + 1} is not an object`];
  const finding = withDefaults(given);
  return FINDING_RULES.map((rule) => rule(finding)).filter((reason) => reason !== null).map((reason) => `Finding ${finding.id} ${reason}`);
}

function withDefaults(given: Finding): Finding {
  return { ...given, known: given.known ?? null, fixed: given.fixed ?? false, numbers: given.numbers ?? null };
}

function hasNumbers(numbers: Finding['numbers']): boolean {
  return numbers !== null && [numbers.head, numbers.baseline].every((side) => typeof side === 'string' && /\d/.test(side));
}

const FINDING_RULES: ((finding: Finding) => string | null)[] = [
  (finding) => (SEVERITIES.includes(finding.severity) ? null : `has severity ${String(finding.severity)}, not important, minor or balance`),
  (finding) => (finding.severity === 'balance' && !hasNumbers(finding.numbers) ? 'is balance and needs numbers: {"head": "...", "baseline": "..."}, each text holding the measured numbers' : null),
  (finding) => (finding.severity === 'balance' && finding.fixed ? 'is balance, which is never fixed in the playtest, so fixed must be false' : null),
  (finding) => (CAUSES.includes(finding.cause) ? null : `has cause ${String(finding.cause)}, not release or old`),
  (finding) => (typeof finding.why === 'string' && finding.why.trim() !== '' ? null : 'gives no reason for its cause'),
  (finding) => (finding.known === null || Number.isInteger(finding.known) ? null : `has known ${String(finding.known)}, not an issue number or null`),
  (finding) => (typeof finding.fixed === 'boolean' ? null : `has fixed ${String(finding.fixed)}, not true or false`),
];

function explanationsOf(given: Partial<Review['explanations']> | undefined): Review['explanations'] {
  return { death: given?.death ?? null, quiet: given?.quiet ?? null };
}

export function judge(facts: LogFacts, review: Review, play: PlayState): Outcome {
  if (review.verdict === 'blocked') return { outcome: 'blocked', reason: review.blocker ?? review.summary };
  if (review.verdict === 'fixed' && !play.moved) return { outcome: 'blocked', reason: 'The review says it fixed findings but committed nothing.' };
  if (play.moved) return replay(review, play.last);
  return judgeClean(facts, review, play);
}

function replay(review: Review, last: boolean): Outcome {
  const fixes = review.fixes.length ? review.fixes.join('; ') : 'commits with no fix named';
  if (last) return { outcome: 'blocked', reason: `The last play left fixes that no play checked: ${fixes}.` };
  return { outcome: 'replay', reason: `${review.fixes.length} fixes to replay` };
}

const CLEAN_RULES: ((facts: LogFacts, review: Review, play: PlayState) => string | null)[] = [
  (facts) => (facts.ending === 'error' ? `The run ended in an error at turn ${facts.endTurn}, so it cannot be clean: ${facts.message ?? 'no message'}` : null),
  (_facts, review) => {
    const important = review.findings.filter((finding) => finding.severity === 'important' && finding.cause === 'release' && finding.fixed === false).length;
    return important > 0 ? `The review called the run clean with ${important} important findings the release caused.` : null;
  },
  (_facts, review, play) => (review.findings.some((finding) => finding.fixed) && !play.fixedEarlier ? 'The review marks findings fixed, but no earlier round of this job committed a fix.' : null),
  (facts, review) => ((facts.ending === 'death' || facts.summary.deaths > 0) && !review.explanations.death ? 'The player died in the run, and the clean review does not explain the death.' : null),
  (facts, review) => (facts.quiet.length > 0 && !review.explanations.quiet ? `The run was quiet (${facts.quiet.join(', ')}), and the clean review does not explain it.` : null),
];

function judgeClean(facts: LogFacts, review: Review, play: PlayState): Outcome {
  for (const rule of CLEAN_RULES) {
    const reason = rule(facts, review, play);
    if (reason !== null) return { outcome: 'blocked', reason };
  }
  return { outcome: 'clean', reason: 'clean' };
}
