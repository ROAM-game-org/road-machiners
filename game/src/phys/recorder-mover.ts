import type { Mover } from '../sim/progression/record';
import type { World } from '../sim/types';
import { buildDrive, freeDrive, initPhysics, type Drive } from './drive';
import { physicsMove } from './turn';

export async function physicsMover(): Promise<Mover> {
  await initPhysics();
  let drive: Drive | null = null;
  let next: Drive | null = null;
  let terrain: World['terrain'] | null = null;
  const settle = () => {
    if (!next) return;
    if (drive) freeDrive(drive);
    drive = next;
    next = null;
  };
  return {
    headless: false,
    step(world) {
      settle();
      if (!drive || world.terrain !== terrain) {
        if (drive) freeDrive(drive);
        drive = buildDrive(world);
        terrain = world.terrain;
      }
      return physicsMove(drive, (r) => {
        next = r.next;
      });
    },
    free() {
      settle();
      if (drive) freeDrive(drive);
      drive = null;
    },
  };
}
