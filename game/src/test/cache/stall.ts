function envMinutes(env: NodeJS.ProcessEnv, key: string): number | null {
  const raw = env[key];
  if (raw === undefined) return null;
  const minutes = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(minutes) || minutes <= 0) throw new Error(`${key} must be a positive number of minutes, got "${raw}".`);
  return minutes;
}

export function stallMinutes(env: NodeJS.ProcessEnv): number | null {
  return envMinutes(env, 'TEST_STALL_MINUTES');
}

export function suiteMinutes(env: NodeJS.ProcessEnv): number | null {
  return envMinutes(env, 'TEST_SUITE_MINUTES');
}

export type FileTime = { file: string; ms: number };

const SLOWEST_SHOWN = 10;

export function suiteOverMessage(limitMinutes: number, finished: FileTime[]): string {
  const slowest = [...finished].sort((a, b) => b.ms - a.ms).slice(0, SLOWEST_SHOWN).map(({ file, ms }) => `${file} ${Math.round(ms / 1000)} s`);
  return `[test-cache] SuiteTimeError: the suite ran past its limit of ${limitMinutes} minutes. Make the slowest test files cheaper. Slowest finished files: ${slowest.join(', ')}`;
}

export type StallWatch = {
  fileStarted: (file: string, now: number) => void;
  fileEnded: (file: string, now: number) => void;
  caseStarted: (id: string, file: string, name: string) => void;
  caseEnded: (id: string, now: number) => void;
  stalled: (now: number) => string | null;
};

export function createStallWatch(limitMs: number, startedAt: number): StallWatch {
  const files = new Set<string>();
  const cases = new Map<string, { file: string; name: string }>();
  let progressAt = startedAt;
  const runningIn = (file: string) => [...cases.values()].filter((running) => running.file === file).map((running) => `${file} > ${running.name}`);
  const running = () => [...files].flatMap((file) => (runningIn(file).length > 0 ? runningIn(file) : [file]));
  return {
    fileStarted: (file, now) => {
      files.add(file);
      progressAt = now;
    },
    fileEnded: (file, now) => {
      files.delete(file);
      progressAt = now;
    },
    caseStarted: (id, file, name) => void cases.set(id, { file, name }),
    caseEnded: (id, now) => {
      cases.delete(id);
      progressAt = now;
    },
    stalled: (now) => {
      if (files.size === 0 || now - progressAt < limitMs) return null;
      return `[test-cache] StallError: no test finished in ${limitMs / 60_000} minutes. Still running: ${running().join(', ')}`;
    },
  };
}
