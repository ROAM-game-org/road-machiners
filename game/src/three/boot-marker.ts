export interface UnfinishedBoot {
  step: string;
  request: string;
  version: string;
}

export class BootUnfinished extends Error {
  constructor(readonly unfinished: UnfinishedBoot) {
    super(`The last start of ${unfinished.version} did not finish. It died in the step: ${unfinished.step}, started from: ${unfinished.request}`);
    this.name = 'BootUnfinished';
  }
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
  return typeof mark.step === 'string' && typeof mark.request === 'string' && typeof mark.version === 'string';
}

export function markStep(session: Storage, base: string, step: string, request: string, version: string): void {
  store(session, base, { step, request, version });
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
