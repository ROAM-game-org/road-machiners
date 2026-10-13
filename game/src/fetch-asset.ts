export const ASSET_RETRY_DELAYS_MS: readonly number[] = [1000, 3000, 9000];

const TRANSIENT_STATUS: ReadonlySet<number> = new Set([408, 429, 500, 502, 503, 504]);

export type AssetNet = {
  fetch: (url: string) => Promise<Response>;
  wait: (ms: number) => Promise<void>;
  delaysMs: readonly number[];
};

export const BROWSER_NET: AssetNet = {
  fetch: (url) => globalThis.fetch(url),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  delaysMs: ASSET_RETRY_DELAYS_MS,
};

export class AssetUnreachable extends Error {
  constructor(
    readonly label: string,
    readonly url: string,
    readonly attempts: number,
    readonly cause: unknown,
  ) {
    super(`${label} did not arrive after ${attempts} attempts: ${cause}`);
    this.name = 'AssetUnreachable';
  }
}

type Attempt = { bytes: ArrayBuffer } | { transient: unknown };

async function attempt(label: string, url: string, net: AssetNet): Promise<Attempt> {
  let res: Response;
  try {
    res = await net.fetch(url);
  } catch (e) {
    return { transient: e };
  }
  if (TRANSIENT_STATUS.has(res.status)) return { transient: new Error(`HTTP ${res.status} ${res.statusText}`) };
  if (!res.ok) throw new Error(`${label} failed to load: HTTP ${res.status} ${res.statusText}`);
  try {
    return { bytes: await res.arrayBuffer() };
  } catch (e) {
    return { transient: e };
  }
}

export async function fetchAsset(label: string, url: string, net: AssetNet = BROWSER_NET): Promise<ArrayBuffer> {
  let last: unknown;
  for (let i = 0; i <= net.delaysMs.length; i++) {
    if (i > 0) await net.wait(net.delaysMs[i - 1]);
    const result = await attempt(label, url, net);
    if ('bytes' in result) return result.bytes;
    last = result.transient;
  }
  throw new AssetUnreachable(label, url, net.delaysMs.length + 1, last);
}
