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

export type AfterBootSteps = {
  mark: (step: string) => void;
  startTurns: () => Promise<void>;
  warmPlans: () => void;
  keep: () => void;
  tilesFilled: Promise<void>;
  end: () => void;
};

export async function afterBoot(finish: Promise<void>, steps: AfterBootSteps): Promise<void> {
  try {
    await finish;
    steps.mark('starting the turn worker');
    await steps.startTurns();
    steps.mark('warming the plans');
    steps.warmPlans();
  } finally {
    await finishGround(steps);
  }
}

async function finishGround(steps: AfterBootSteps): Promise<void> {
  try {
    steps.mark('writing the ground cache');
    steps.keep();
    steps.mark('filling the ground tiles');
    await steps.tilesFilled;
  } finally {
    steps.end();
  }
}
