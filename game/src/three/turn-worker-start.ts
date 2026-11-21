import type { DriveSnapshot } from '../phys/drive';
import type { World } from '../sim/types';

export interface TurnWorkerHost {
  sendTerrain(terrain: World['terrain']): void;
  warm(world: World, drive: DriveSnapshot): Promise<void>;
}

export async function startTurnWorker(host: TurnWorkerHost, bootFinished: Promise<void>, physicsReady: Promise<unknown>, terrain: World['terrain'], opening: () => { world: World; drive: DriveSnapshot }): Promise<void> {
  await bootFinished;
  host.sendTerrain(terrain);
  await physicsReady;
  const { world, drive } = opening();
  await host.warm(world, drive);
}

export async function afterBoot(finish: Promise<void>, startTurns: () => Promise<void>, warmPlans: () => void, keep: () => void): Promise<void> {
  await finish;
  try {
    await startTurns();
    warmPlans();
  } finally {
    keep();
  }
}
