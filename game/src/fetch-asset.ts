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

export type AssetBody = { response: Response; bytes: ArrayBuffer };

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
  let res: Response;
  try {
    res = await net.fetch(url, init);
  } catch (e) {
    return { transient: e };
  }
  if (TRANSIENT_STATUS.has(res.status)) return { transient: new AssetStatusError(`HTTP ${res.status} ${res.statusText}`, res.status) };
  if (!res.ok) throw new AssetStatusError(`${label} ${url} failed to load: HTTP ${res.status} ${res.statusText}`, res.status);
  try {
    return { body: { response: res, bytes: await res.arrayBuffer() } };
  } catch (e) {
    return { transient: e };
  }
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
