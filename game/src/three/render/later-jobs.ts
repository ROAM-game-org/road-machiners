type Job = { left: number; fresh: boolean; run: () => void };

export class LaterJobs {
  private jobs: Job[] = [];

  add(delayMs: number, run: () => void): void {
    if (!(delayMs >= 0)) throw new Error(`A world effect waits a non-negative time, got ${delayMs} ms`);
    this.jobs.push({ left: delayMs / 1000, fresh: true, run });
  }

  tick(playSeconds: number): void {
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      const job = this.jobs[i];
      if (!job.fresh) job.left -= playSeconds;
      if (job.left > 0) continue;
      this.jobs.splice(i, 1);
      job.run();
    }
    for (const job of this.jobs) job.fresh = false;
  }
}
