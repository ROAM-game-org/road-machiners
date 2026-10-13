import { CONFIG } from "./config";

class HttpStatusError extends Error {
  constructor(label: string, readonly status: number) {
    super(`${label} failed to load: HTTP ${status}`);
  }
}

function retryable(e: unknown): boolean {
  return !(e instanceof HttpStatusError) || e.status >= 500;
}

async function fetchOnce(url: string, label: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new HttpStatusError(label, res.status);
  return res.arrayBuffer();
}

export async function fetchBytes(url: string, label: string): Promise<ArrayBuffer> {
  const tries = CONFIG.assetFetchTries;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchOnce(url, label);
    } catch (e) {
      if (!retryable(e)) throw e;
      if (attempt >= tries) throw new Error(`${label} failed to load after ${tries} tries: ${e}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * CONFIG.assetRetryMs));
    }
  }
}
