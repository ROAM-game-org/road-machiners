import { CONFIG } from './config';

export class DownloadFailed extends Error {
  constructor(what: string, url: string, tries: number, cause: unknown) {
    super(`${what} ${url} failed to download after ${tries} tries: ${cause}`);
    this.name = 'DownloadFailed';
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function retryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function attempt(url: string, what: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    if (!retryable(res.status)) throw new HttpRefused(`${what} ${url} failed to load: HTTP ${res.status}`);
    throw new Error(`HTTP ${res.status}`);
  }
  return res.arrayBuffer();
}

class HttpRefused extends Error {}

export async function download(
  url: string,
  what: string,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<ArrayBuffer> {
  const { tries, waitsMs } = CONFIG.download;
  if (waitsMs.length !== tries - 1) throw new Error('CONFIG.download needs one wait between each pair of tries');
  let last: unknown;
  for (let n = 0; n < tries; n++) {
    if (n > 0) await wait(waitsMs[n - 1]);
    try {
      return await attempt(url, what);
    } catch (e) {
      if (e instanceof HttpRefused) throw e;
      last = e;
    }
  }
  throw new DownloadFailed(what, url, tries, last);
}
