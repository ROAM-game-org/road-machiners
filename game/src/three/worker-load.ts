import { reportError } from "./crash";

export const DOWNLOAD = { tries: 6, waitMs: [500, 1000, 2000, 4000, 4000] };

export class DownloadFailed extends Error {
  constructor(readonly url: string, tries: number, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`Download of ${url} failed ${tries} times: ${reason}`, { cause });
    this.name = "DownloadFailed";
  }
}

export function workerFailure(label: string, event: ErrorEvent): string {
  if (typeof event.message === "string" && event.message !== "") return `${label} failed: ${event.message}`;
  const where = event.filename ? ` (${event.filename}:${event.lineno})` : "";
  return `${label} failed: script did not load or start${where}`;
}

type Wait = (ms: number, then: () => void) => void;

const timeout: Wait = (ms, then) => void setTimeout(then, ms);

export class WorkerLoad {
  private failures = 0;
  private given = false;
  private sleeping = false;

  constructor(
    private readonly label: string,
    private readonly wait: Wait = timeout,
  ) {}

  get gaveUp(): boolean {
    return this.given;
  }

  get waiting(): boolean {
    return this.sleeping;
  }

  loaded(): void {
    this.failures = 0;
  }

  failed(event: ErrorEvent, restart: () => void): boolean {
    if (typeof event.message === "string" && event.message !== "") return false;
    this.failures++;
    if (this.failures >= DOWNLOAD.tries) {
      this.given = true;
      this.sleeping = false;
      reportError(new DownloadFailed(this.label, DOWNLOAD.tries, new Error(workerFailure(this.label, event))));
      return true;
    }
    this.sleeping = true;
    this.wait(DOWNLOAD.waitMs[this.failures - 1], () => {
      this.sleeping = false;
      restart();
    });
    return true;
  }
}
