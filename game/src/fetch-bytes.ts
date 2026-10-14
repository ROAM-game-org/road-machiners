import { CONFIG } from "./config";

class HttpStatusError extends Error {
  constructor(url: string, readonly status: number) {
    super(`${url} failed to load: HTTP ${status}`);
  }
}

export class DownloadFailed extends Error {
  constructor(readonly url: string, readonly tries: number, cause: unknown) {
    super(`${url} failed to load after ${tries} tries: ${cause}`, { cause });
    this.name = 'DownloadFailed';
  }
}

function retryDelay(attempt: number): number {
  return Math.min(CONFIG.assetRetryMs * 2 ** (attempt - 1), CONFIG.assetRetryMaxMs);
}

function retryable(e: unknown): boolean {
  return !(e instanceof HttpStatusError) || e.status >= 500;
}

async function fetchOnce(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new HttpStatusError(url, res.status);
  return res.arrayBuffer();
}

export async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const tries = CONFIG.assetFetchTries;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchOnce(url);
    } catch (e) {
      if (!retryable(e)) throw e;
      if (attempt >= tries) {
        if (e instanceof HttpStatusError) throw new Error(`${url} failed to load after ${tries} tries: ${e}`, { cause: e });
        throw new DownloadFailed(url, tries, e);
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
    }
  }
}
