import { CONFIG } from "./config";

export class HttpStatusError extends Error {
  constructor(url: string, readonly status: number) {
    super(`${url} failed to load: HTTP ${status}`);
  }
}

export class DownloadFailed extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = 'DownloadFailed';
  }
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
      if (!retryable(e) || (attempt >= tries && e instanceof HttpStatusError)) throw e;
      if (attempt >= tries) throw new DownloadFailed(`${url} failed to load after ${tries} tries: ${e}`, e);
      await new Promise((resolve) => setTimeout(resolve, attempt * CONFIG.assetRetryMs));
    }
  }
}
