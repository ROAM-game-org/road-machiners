import { DOWNLOAD } from './config';
import { attemptWithin, type Body } from './download';
import { REAL_TIMERS } from './stall';

export const ASSET_RETRY_DELAYS_MS: readonly number[] = [1000, 3000, 9000];

const TRANSIENT_STATUS: ReadonlySet<number> = new Set([408, 429, 500, 502, 503, 504]);

export type AssetNet = {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  wait: (ms: number) => Promise<void>;
  delaysMs: readonly number[];
};

export const BROWSER_NET: AssetNet = {
  fetch: (url, init) => (init ? globalThis.fetch(url, init) : globalThis.fetch(url)),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  delaysMs: ASSET_RETRY_DELAYS_MS,
};

export class AssetStatusError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AssetStatusError';
  }
}

export type AssetBody = Body;

export class AssetUnreachable extends Error {
  constructor(
    readonly label: string,
    readonly url: string,
    readonly attempts: number,
    readonly cause: unknown,
  ) {
    super(`${label} ${url} did not arrive after ${attempts} attempts: ${cause}`);
    this.name = 'AssetUnreachable';
  }
}

export class DownloadFailed extends AssetUnreachable {
  constructor(label: string, url: string, attempts: number, cause: unknown) {
    super(label, url, attempts, cause);
    this.name = 'DownloadFailed';
  }
}

type Attempt = { body: AssetBody } | { transient: unknown };

async function attempt(label: string, url: string, init: RequestInit | undefined, net: AssetNet): Promise<Attempt> {
  let outcome: Awaited<ReturnType<typeof attemptWithin>>;
  try {
    outcome = await attemptWithin(url, init, net.fetch, DOWNLOAD.stallMs, REAL_TIMERS);
  } catch (e) {
    return { transient: e };
  }
  if ('body' in outcome) return { body: outcome.body };
  if (TRANSIENT_STATUS.has(outcome.status)) return { transient: new AssetStatusError(`HTTP ${outcome.status} ${outcome.statusText}`, outcome.status) };
  throw new AssetStatusError(`${label} ${url} failed to load: HTTP ${outcome.status} ${outcome.statusText}`, outcome.status);
}

export async function fetchAssetBody(label: string, url: string, init?: RequestInit, net: AssetNet = BROWSER_NET): Promise<AssetBody> {
  let last: unknown;
  for (let i = 0; i <= net.delaysMs.length; i++) {
    if (i > 0) await net.wait(net.delaysMs[i - 1]);
    const result = await attempt(label, url, init, net);
    if ('body' in result) return result.body;
    last = result.transient;
  }
  throw new AssetUnreachable(label, url, net.delaysMs.length + 1, last);
}

export async function fetchAsset(label: string, url: string, net: AssetNet = BROWSER_NET): Promise<ArrayBuffer> {
  return (await fetchAssetBody(label, url, undefined, net)).bytes;
}
