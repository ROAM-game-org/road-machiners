import { DOWNLOAD } from './config';
import { REAL_TIMERS, Stalled, checkedLimit, withinMs, type Timers } from './stall';

export class DownloadFailed extends Error {
  readonly url: string;

  constructor(url: string, tries: number, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`Download of ${url} failed ${tries} times: ${reason}`, { cause });
    this.name = 'DownloadFailed';
    this.url = url;
  }
}

export class HttpStatusError extends Error {
  constructor(url: string, readonly status: number) {
    super(`File ${url} failed to load: HTTP ${status}`);
  }
}

export type Body = { response: Response; bytes: ArrayBuffer };

export type DownloadDeps = {
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  wait?: (ms: number) => Promise<void>;
  timers?: Timers;
  stallMs?: number;
};

type Watch = { signal: AbortSignal; silent: Promise<never>; beat(): void; stop(): void };

function retryable(status: number): boolean {
  return status === 404 || status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Outcome = { body: Body } | { status: number };

function watchSilence(url: string, ms: number, timers: Timers): Watch {
  const controller = new AbortController();
  const stall = new Stalled(`Download of ${url}`, ms);
  let handle: unknown;
  const beat = () => {
    timers.clear(handle);
    handle = timers.set(ms, () => controller.abort(stall));
  };
  const silent = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(stall), { once: true });
  });
  silent.catch(() => {});
  beat();
  return { signal: controller.signal, silent, beat, stop: () => timers.clear(handle) };
}

async function readChunks(body: ReadableStream<Uint8Array>, watch: Watch): Promise<ArrayBuffer> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await Promise.race([reader.read(), watch.silent]);
    if (done) break;
    watch.beat();
    chunks.push(value);
    size += value.byteLength;
  }
  const joined = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    joined.set(chunk, at);
    at += chunk.byteLength;
  }
  return joined.buffer;
}

async function readBody(url: string, response: Response, watch: Watch, ms: number, timers: Timers): Promise<ArrayBuffer> {
  if (response.body) return readChunks(response.body, watch);
  return withinMs(response.arrayBuffer(), ms, `Body of ${url}`, timers);
}

async function attempt(url: string, init: RequestInit | undefined, get: NonNullable<DownloadDeps['fetch']>, ms: number, timers: Timers): Promise<Outcome> {
  const watch = watchSilence(url, ms, timers);
  try {
    const response = await Promise.race([get(url, { ...init, signal: watch.signal }), watch.silent]);
    if (!response.ok) return { status: response.status };
    watch.beat();
    return { body: { response, bytes: await readBody(url, response, watch, ms, timers) } };
  } finally {
    watch.stop();
  }
}

export async function download(url: string, deps: DownloadDeps = {}): Promise<ArrayBuffer> {
  return (await downloadBody(url, undefined, deps)).bytes;
}

export async function downloadBody(url: string, init?: RequestInit, deps: DownloadDeps = {}): Promise<Body> {
  const get = deps.fetch ?? ((u: string, i?: RequestInit) => (i ? globalThis.fetch(u, i) : globalThis.fetch(u)));
  const wait = deps.wait ?? pause;
  const timers = deps.timers ?? REAL_TIMERS;
  const stallMs = checkedLimit(deps.stallMs ?? DOWNLOAD.stallMs);
  let dropped: unknown;
  let status: number | null = null;
  for (let i = 0; i < DOWNLOAD.tries; i++) {
    if (i > 0) await wait(DOWNLOAD.waitMs[i - 1]);
    try {
      const outcome = await attempt(url, init, get, stallMs, timers);
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
  throw new HttpStatusError(url, status);
}
