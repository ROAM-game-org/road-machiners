import { ODD_JOBS } from "../data/odd-jobs";
import { playerVehicle } from "./damage";
import { startJob, workBlocker } from "./jobs";
import { shopAt } from "./market";
import type { Job, Refusal, Vehicle, World } from "./types";
import { playerCommand, Refused } from "./world";

type OddJobs = Extract<Job, { kind: "oddJobs" }>;

export function oddJobsBlock(world: World): Refusal | null {
  const blocked = workBlocker(world, playerVehicle(world));
  if (blocked) return blocked;
  if (shopAt(world) === null) return { id: "stopFirst" };
  return world.player.money >= ODD_JOBS.hireBelow ? { id: "notHiring" } : null;
}

export function oddJobsPay(turns: number): number {
  if (!Number.isInteger(turns) || turns < 0) throw new Error(`Odd jobs cannot pay ${turns} turns`);
  return Math.floor(turns * ODD_JOBS.payPerTurn);
}

export function startOddJobs(world: World): World {
  return playerCommand(world, (w) => {
    const block = oddJobsBlock(w);
    if (block) throw new Refused(block);
    startJob(w, playerVehicle(w), { kind: "oddJobs", turnsLeft: ODD_JOBS.shiftTurns, total: ODD_JOBS.shiftTurns });
  });
}

export function oddJobsTurn(world: World, v: Vehicle, job: OddJobs): boolean {
  if (v.id !== world.player.vehicleId) throw new Error("Only the player does odd jobs");
  job.turnsLeft = Math.max(0, job.turnsLeft - 1);
  return job.turnsLeft === 0;
}

export function payOddJobs(world: World, v: Vehicle, job: OddJobs): void {
  if (v.id !== world.player.vehicleId) throw new Error("Only the player does odd jobs");
  if (job.turnsLeft > job.total) throw new Error("Odd jobs have more turns left than the shift");
  const amount = oddJobsPay(job.total - job.turnsLeft);
  if (amount === 0) return;
  world.player.money += amount;
  world.events.push({ t: "money", amount, reason: { kind: "oddJobs" } });
}
