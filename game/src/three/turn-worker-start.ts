import type { DriveSnapshot } from '../phys/drive';
import type { World } from '../sim/types';

export interface TurnWorkerHost {
  sendTerrain(terrain: World['terrain']): void;
  warm(world: World, drive: DriveSnapshot): Promise<void>;
}

export async function startTurnWorker(host: TurnWorkerHost, groundBaked: Promise<void>, firstFrame: Promise<void>, physicsReady: Promise<unknown>, terrain: World['terrain'], opening: () => { world: World; drive: DriveSnapshot }): Promise<void> {
  await groundBaked;
  await firstFrame;
  host.sendTerrain(terrain);
  await physicsReady;
  const { world, drive } = opening();
  await host.warm(world, drive);
}
