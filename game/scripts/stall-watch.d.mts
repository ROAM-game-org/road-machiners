type Stream = { write: (chunk: string, ...rest: unknown[]) => boolean };

export function stallMinutes(env: Record<string, string | undefined>): number | null;
export function stallMessage(what: string, minutes: number, lastLine: string): string;
export function watchStalls(what: string, env: Record<string, string | undefined>, stream?: Stream, exit?: (message: string) => void): ReturnType<typeof setInterval> | null;
