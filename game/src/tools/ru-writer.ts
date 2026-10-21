// Picks who writes Russian: agy, then Codex when agy is unavailable, then Claude Sonnet when Codex is too.
// It only returns text. It never writes a catalog file, so the catalog test, the scan and the style review still judge what it returns.

export type Writer = 'agy' | 'codex' | 'sonnet';
export const WRITERS: readonly Writer[] = ['agy', 'codex', 'sonnet'];

export type Run = { status: number | null; stdout: string; stderr: string; missing?: boolean };
export type Runner = (writer: Writer, prompt: string) => Run;

// Failures that mean the writer cannot be used now, as opposed to a run that went wrong on this request.
// Depleted prepaid credits show as HTTP 402, a spent quota as 429 or RESOURCE_EXHAUSTED, and the factory's own agy wrapper
// refuses a run past AGY_MAX_RUNS or without AGY_MODEL. Neither agy nor Codex gives a typed error, so the message is all there is.
const UNAVAILABLE = [
  /\b402\b|payment required|prepa(id|yment)|credits?\b.*(deplet|exhaust|insufficient|out of)|(deplet|exhaust|insufficient).*credits?|billing/i,
  /\b429\b|RESOURCE_EXHAUSTED|quota|rate.?limit|usage limit|too many requests/i,
  /AGY_MAX_RUNS|AGY_MODEL is not set|CODEX_MODEL and CODEX_EFFORT must be set/,
  /\b401\b|\b403\b|unauthori[sz]ed|not logged in|sign in|log in|auth\.json|api key|permission denied/i,
  /\b50[234]\b|overloaded|service unavailable|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network error|command not found/i,
];

export function unavailable(run: Run): boolean {
  if (run.missing) return true;
  if (run.status === 0) return false;
  return UNAVAILABLE.some((pattern) => pattern.test(`${run.stderr}\n${run.stdout}`));
}

export type Attempt = { writer: Writer; outcome: 'written' | 'unavailable' | 'failed'; detail: string };
export type Written = { writer: Writer; text: string; attempts: Attempt[] };

export class WriterFailed extends Error {
  constructor(message: string, readonly attempts: Attempt[]) {
    super(message);
  }
}

function tail(run: Run): string {
  return (run.stderr || run.stdout).trim().slice(-300);
}

// A run that fails for another reason, or writes nothing, stops the chain: the next writer would not fix the request, and
// asking all three would hide the failure and spend their limits.
export function writeRussian(prompt: string, run: Runner, writers: readonly Writer[] = WRITERS): Written {
  const attempts: Attempt[] = [];
  for (const writer of writers) {
    const result = run(writer, prompt);
    if (result.status === 0 && result.stdout.trim()) {
      attempts.push({ writer, outcome: 'written', detail: '' });
      return { writer, text: result.stdout, attempts };
    }
    if (unavailable(result)) {
      attempts.push({ writer, outcome: 'unavailable', detail: result.missing ? 'not installed' : tail(result) });
      continue;
    }
    attempts.push({ writer, outcome: 'failed', detail: tail(result) || 'wrote nothing' });
    throw new WriterFailed(`${writer} failed on this request: ${attempts[attempts.length - 1]!.detail}`, attempts);
  }
  throw new WriterFailed(`No Russian writer is available: ${attempts.map((a) => `${a.writer} (${a.detail})`).join(', ')}`, attempts);
}
