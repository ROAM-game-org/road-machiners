
export type Ending = 'complete' | 'death' | 'error';
export type LogSummary = { turns: number; shots: number; destroyed: number; knockouts: number; deaths: number; stalls: number; moneyIn: number; moneyOut: number; npcGoals: Record<string, number>; playerTiles: number };
export type LogFacts = { seed: number; turns: number; sha: string | null; lines: number; events: number; ending: Ending; endTurn: number; message: string | null; summary: LogSummary; quiet: string[] };

export type Finding = { id: string; severity: 'important' | 'minor'; title: string; evidence: string; cause: 'release' | 'old'; why: string; known: number | null; fixed: boolean };
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
const SEVERITIES = ['important', 'minor'];
const CAUSES = ['release', 'old'];
const LISTS = ['observations', 'suspected', 'limitations', 'findings', 'fixes'] as const;
const TEXT_LISTS = ['observations', 'suspected', 'limitations', 'fixes'] as const;
const TEXTS = ['summary', 'drama'] as const;

export class ReviewError extends Error {
  constructor(readonly errors: string[]) {
    super(`The playtest review is invalid, ${errors.length} ${errors.length === 1 ? 'error' : 'errors'}: ${errors.join('; ')}`);
    this.name = 'ReviewError';
  }
}

const isText = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';
const shown = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value) ?? 'undefined').slice(0, 60);

export function readReview(text: string | null): Review {
  if (text === null) throw new Error('The playtest agent wrote no .factory/playtest.json');
  const review = parse(text);
  const errors = reviewErrors(review);
  if (errors.length > 0) throw new ReviewError(errors);
  return { ...review, findings: review.findings.map(readFinding), explanations: explanationsOf(review.explanations), blocker: review.blocker ?? null };
}

function parse(text: string): Review {
  try {
    const review: unknown = JSON.parse(text);
    if (typeof review === 'object' && review !== null && !Array.isArray(review)) return review as Review;
  } catch (error) {
    throw new ReviewError([`.factory/playtest.json is not valid JSON: ${(error as Error).message}`]);
  }
  throw new ReviewError(['.factory/playtest.json is not a JSON object']);
}

function reviewErrors(review: Review): string[] {
  const errors: string[] = [];
  if (!VERDICTS.includes(review.verdict)) errors.push(`The playtest verdict ${shown(review.verdict)} is not clean, fixed or blocked`);
  for (const key of TEXTS) if (!isText(review[key])) errors.push(`The playtest review has no ${key} text`);
  for (const key of LISTS) if (!Array.isArray(review[key])) errors.push(`The playtest review has no ${key} list`);
  for (const key of TEXT_LISTS) {
    const list: unknown = review[key];
    if (Array.isArray(list)) list.forEach((entry, i) => { if (typeof entry !== 'string') errors.push(`The playtest review ${key}[${i}] is ${shown(entry)}, not a string`); });
  }
  if (review.blocker !== undefined && review.blocker !== null && typeof review.blocker !== 'string') errors.push(`The playtest review blocker is ${shown(review.blocker)}, not a string or null`);
  errors.push(...explanationErrors(review.explanations));
  if (Array.isArray(review.findings)) review.findings.forEach((finding, i) => errors.push(...findingErrors(finding, i)));
  return errors;
}

function explanationErrors(given: unknown): string[] {
  if (given === undefined || given === null) return [];
  if (typeof given !== 'object' || Array.isArray(given)) return ['The playtest review explanations is not an object'];
  return (['death', 'quiet'] as const).flatMap((key) => {
    const value = (given as Record<string, unknown>)[key];
    return value === undefined || value === null || typeof value === 'string' ? [] : [`The playtest review explanations.${key} is ${shown(value)}, not a string or null`];
  });
}

const FINDING_RULES: ((finding: Finding) => string | null)[] = [
  (finding) => (isText(finding.title) ? null : 'has no title'),
  (finding) => (isText(finding.evidence) ? null : 'has no evidence'),
  (finding) => (SEVERITIES.includes(finding.severity) ? null : `has severity ${shown(finding.severity)}, not important or minor`),
  (finding) => (CAUSES.includes(finding.cause) ? null : `has cause ${shown(finding.cause)}, not release or old`),
  (finding) => (isText(finding.why) ? null : 'gives no reason for its cause'),
  (finding) => (finding.known === null || Number.isInteger(finding.known) ? null : `has known ${shown(finding.known)}, not an issue number or null`),
  (finding) => (typeof finding.fixed === 'boolean' ? null : `has fixed ${shown(finding.fixed)}, not true or false`),
];

function findingErrors(given: unknown, index: number): string[] {
  if (typeof given !== 'object' || given === null || Array.isArray(given)) return [`Finding ${index + 1} is not an object`];
  const finding = normalFinding(given as Finding);
  const name = isText(finding.id) ? String(finding.id) : `#${index + 1}`;
  return FINDING_RULES.flatMap((rule) => {
    const reason = rule(finding);
    return reason === null ? [] : [`Finding ${name} ${reason}`];
  });
}

const normalFinding = (given: Finding): Finding => ({ ...given, known: given.known ?? null, fixed: given.fixed ?? false });
const readFinding = normalFinding;

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
