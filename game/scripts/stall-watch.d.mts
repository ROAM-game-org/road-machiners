type Stream = { write: (chunk: string, ...rest: unknown[]) => boolean };
type StallWatch = { closeOnStall: (close: () => Promise<unknown>) => void; timer: ReturnType<typeof setInterval> | null };

export function stallMinutes(env: Record<string, string | undefined>): number | null;
export function stallMessage(what: string, minutes: number, lastLine: string): string;
export function exitAfterClosing(closers: (() => Promise<unknown>)[]): (message: string) => void;
export function watchStalls(what: string, env: Record<string, string | undefined>, stream?: Stream, exit?: (message: string) => void): StallWatch;
