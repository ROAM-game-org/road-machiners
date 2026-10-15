import { DownloadFailed } from "../fetch-asset";
import { reportError } from "./crash";

export const WORKER_RETRY_DELAYS_MS: readonly number[] = [500, 1000, 2000, 4000, 4000];
export const WORKER_LOAD_ATTEMPTS = WORKER_RETRY_DELAYS_MS.length + 1;

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
    if (this.failures >= WORKER_LOAD_ATTEMPTS) {
      this.given = true;
      this.sleeping = false;
      reportError(new DownloadFailed(this.label, event.filename || this.label, WORKER_LOAD_ATTEMPTS, new Error(workerFailure(this.label, event))));
      return true;
    }
    this.sleeping = true;
    this.wait(WORKER_RETRY_DELAYS_MS[this.failures - 1], () => {
      this.sleeping = false;
      restart();
    });
    return true;
  }
}
