export type BootEnding = 'left' | 'hidden';

export interface UnfinishedBoot {
  step: string;
  request: string;
  version: string;
  startedAt?: number;
  ended?: BootEnding;
  endedAt?: number;
}

export class BootUnfinished extends Error {
  constructor(readonly unfinished: UnfinishedBoot, now: number) {
    super([`The last start of ${unfinished.version} did not finish. It died in the step: ${unfinished.step}, started from: ${unfinished.request}`, endingOf(unfinished, now)].filter(Boolean).join('. '));
    this.name = 'BootUnfinished';
  }
}

function endingOf(unfinished: UnfinishedBoot, now: number): string | null {
  const { startedAt, ended, endedAt } = unfinished;
  if (startedAt === undefined) return null;
  if (ended === 'left') return `The page was closed or reloaded ${secondsBetween(startedAt, endedAt ?? now)} s into the step.`;
  if (ended === 'hidden') return `The page was hidden ${secondsBetween(startedAt, endedAt ?? now)} s into the step and never came back to finish it.`;
  return `The page stopped with no unload; the next start came ${secondsBetween(startedAt, now)} s after the step began.`;
}

function secondsBetween(from: number, to: number): number {
  return Math.max(0, Math.round((to - from) / 1000));
}

type Mark = UnfinishedBoot | 'waiting';

function markKey(base: string): string {
  return `${base}.boot-mark`;
}

function store(session: Storage, base: string, mark: Mark): void {
  try {
    session.setItem(markKey(base), JSON.stringify(mark));
  } catch (error) {
    console.warn('The boot marker was not written:', error);
  }
}

function read(session: Storage, base: string): Mark | null {
  const text = session.getItem(markKey(base));
  if (text === null) return null;
  try {
    const mark: unknown = JSON.parse(text);
    return isMark(mark) ? mark : null;
  } catch {
    return null;
  }
}

function isMark(value: unknown): value is Mark {
  if (value === 'waiting') return true;
  if (typeof value !== 'object' || value === null) return false;
  const mark = value as Record<string, unknown>;
  return (
    typeof mark.step === 'string' &&
    typeof mark.request === 'string' &&
    typeof mark.version === 'string' &&
    optional(mark.startedAt, 'number') &&
    optional(mark.endedAt, 'number') &&
    (mark.ended === undefined || mark.ended === 'left' || mark.ended === 'hidden')
  );
}

function optional(value: unknown, type: 'number'): boolean {
  return value === undefined || typeof value === type;
}

export function markStep(session: Storage, base: string, step: string, request: string, version: string, now: number): void {
  store(session, base, { step, request, version, startedAt: now });
}

export function markWaiting(session: Storage, base: string): void {
  store(session, base, 'waiting');
}

export function clearMark(session: Storage, base: string): void {
  session.removeItem(markKey(base));
}

export function takeUnfinished(session: Storage, base: string): UnfinishedBoot | null {
  const mark = read(session, base);
  clearMark(session, base);
  return typeof mark === 'object' && mark !== null ? mark : null;
}

export function watchBootEnd(page: EventTarget, doc: EventTarget & { visibilityState: string }, session: Storage, base: string, now: () => number): void {
  page.addEventListener('pagehide', () => endStep(session, base, 'left', now()));
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') endStep(session, base, 'hidden', now());
    else resumeStep(session, base);
  });
}

function endStep(session: Storage, base: string, ended: BootEnding, at: number): void {
  const mark = read(session, base);
  if (typeof mark !== 'object' || mark === null || mark.ended === 'left') return;
  store(session, base, { ...mark, ended, endedAt: at });
}

function resumeStep(session: Storage, base: string): void {
  const mark = read(session, base);
  if (typeof mark !== 'object' || mark === null || mark.ended !== 'hidden') return;
  store(session, base, { step: mark.step, request: mark.request, version: mark.version, startedAt: mark.startedAt });
}
