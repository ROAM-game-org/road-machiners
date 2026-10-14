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

export type Body = { response: Response; bytes: ArrayBuffer };

async function fetchOnce(url: string, init?: RequestInit): Promise<Body> {
  const response = await (init ? fetch(url, init) : fetch(url));
  if (!response.ok) throw new HttpStatusError(url, response.status);
  return { response, bytes: await response.arrayBuffer() };
}

export async function fetchBytes(url: string): Promise<ArrayBuffer> {
  return (await fetchBody(url)).bytes;
}

export async function fetchBody(url: string, init?: RequestInit): Promise<Body> {
  const tries = CONFIG.assetFetchTries;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchOnce(url, init);
    } catch (e) {
      if (!retryable(e) || (attempt >= tries && e instanceof HttpStatusError)) throw e;
      if (attempt >= tries) throw new DownloadFailed(`${url} failed to load after ${tries} tries: ${e}`, e);
      await new Promise((resolve) => setTimeout(resolve, attempt * CONFIG.assetRetryMs));
    }
  }
}
