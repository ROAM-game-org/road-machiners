import { DOWNLOAD } from './config';
import { attemptWithin, type Body } from './download';
import { REAL_TIMERS } from './stall';

export const ASSET_RETRY_DELAYS_MS: readonly number[] = [1000, 3000, 9000];

const TRANSIENT_STATUS: ReadonlySet<number> = new Set([408, 429, 500, 502, 503, 504]);

export type AssetNet = {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  wait: (ms: number) => Promise<void>;
  delaysMs: readonly number[];
  page: () => string | null;
};

export const BROWSER_NET: AssetNet = {
  fetch: (url, init) => (init ? globalThis.fetch(url, init) : globalThis.fetch(url)),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  delaysMs: ASSET_RETRY_DELAYS_MS,
  page: () => globalThis.location?.href ?? null,
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

export class BuildGone extends AssetUnreachable {
  constructor(label: string, url: string, attempts: number, cause: AssetStatusError, page: string) {
    super(label, url, attempts, cause);
    this.message = `${label} ${url} answered ${cause.message} and the page's own build ${page} is gone from the host`;
    this.name = 'BuildGone';
  }
}

type Attempt = { body: AssetBody } | { transient: unknown } | { missing: AssetStatusError };

const goneNets = new WeakSet<AssetNet>();

async function buildGone(net: AssetNet): Promise<string | null> {
  const page = net.page();
  if (page === null) return null;
  if (goneNets.has(net)) return page;
  try {
    const outcome = await attemptWithin(page, { cache: 'no-store' }, net.fetch, DOWNLOAD.stallMs, REAL_TIMERS);
    if ('body' in outcome) return null;
  } catch {
    return null;
  }
  goneNets.add(net);
  return page;
}

async function attempt(label: string, url: string, init: RequestInit | undefined, net: AssetNet): Promise<Attempt> {
  let outcome: Awaited<ReturnType<typeof attemptWithin>>;
  try {
    outcome = await attemptWithin(url, init, net.fetch, DOWNLOAD.stallMs, REAL_TIMERS);
  } catch (e) {
    return { transient: e };
  }
  if ('body' in outcome) return { body: outcome.body };
  if (TRANSIENT_STATUS.has(outcome.status)) return { transient: new AssetStatusError(`HTTP ${outcome.status} ${outcome.statusText}`, outcome.status) };
  return { missing: new AssetStatusError(`${label} ${url} failed to load: HTTP ${outcome.status} ${outcome.statusText}`, outcome.status) };
}

export async function fetchAssetBody(label: string, url: string, init?: RequestInit, net: AssetNet = BROWSER_NET): Promise<AssetBody> {
  let last: unknown;
  for (let i = 0; i <= net.delaysMs.length; i++) {
    if (i > 0) await net.wait(net.delaysMs[i - 1]);
    const result = await attempt(label, url, init, net);
    if ('body' in result) return result.body;
    if ('missing' in result) {
      const page = await buildGone(net);
      throw page === null ? result.missing : new BuildGone(label, url, i + 1, result.missing, page);
    }
    last = result.transient;
  }
  throw new AssetUnreachable(label, url, net.delaysMs.length + 1, last);
}

export async function fetchAsset(label: string, url: string, net: AssetNet = BROWSER_NET): Promise<ArrayBuffer> {
  return (await fetchAssetBody(label, url, undefined, net)).bytes;
}
