export const BROWSER_SLOT_STALE_MS: number;
export function takeBrowserSlot(env?: Record<string, string | undefined>, log?: (line: string) => void): Promise<() => void>;
