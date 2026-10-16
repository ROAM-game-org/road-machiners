import { DOWNLOAD } from './config';

export class DownloadFailed extends Error {
  readonly url: string;

  constructor(url: string, tries: number, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`Download of ${url} failed ${tries} times: ${reason}`, { cause });
    this.name = 'DownloadFailed';
    this.url = url;
  }
}

export type DownloadDeps = {
  fetch?: (url: string) => Promise<Response>;
  wait?: (ms: number) => Promise<void>;
};

function retryable(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Outcome = { body: ArrayBuffer } | { status: number };

async function attempt(url: string, get: (url: string) => Promise<Response>): Promise<Outcome> {
  const res = await get(url);
  if (res.ok) return { body: await res.arrayBuffer() };
  return { status: res.status };
}

export async function download(url: string, deps: DownloadDeps = {}): Promise<ArrayBuffer> {
  const get = deps.fetch ?? ((u: string) => globalThis.fetch(u));
  const wait = deps.wait ?? pause;
  let dropped: unknown;
  let status: number | null = null;
  for (let i = 0; i < DOWNLOAD.tries; i++) {
    if (i > 0) await wait(DOWNLOAD.waitMs[i - 1]);
    try {
      const outcome = await attempt(url, get);
      if ('body' in outcome) return outcome.body;
      status = outcome.status;
    } catch (e) {
      dropped = e;
      status = null;
      continue;
    }
    if (!retryable(status)) break;
  }
  if (status === null) throw new DownloadFailed(url, DOWNLOAD.tries, dropped);
  throw new Error(`File ${url} failed to load: HTTP ${status}`);
}
