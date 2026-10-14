import { CONFIG } from "./config";

class HttpStatusError extends Error {
  constructor(url: string, readonly status: number) {
    super(`${url} failed to load: HTTP ${status}`);
  }
}

export class DownloadFailure extends Error {
  readonly name = 'DownloadFailure';
  constructor(readonly url: string, readonly tries: number, options: { cause: unknown }) {
    super(`${url} failed to load after ${tries} tries: ${options.cause}`, options);
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
      if (!retryable(e)) throw e;
      if (attempt >= tries) throw new DownloadFailure(url, tries, { cause: e });
      await new Promise((resolve) => setTimeout(resolve, CONFIG.assetRetryMs * 2 ** (attempt - 1)));
    }
  }
}
