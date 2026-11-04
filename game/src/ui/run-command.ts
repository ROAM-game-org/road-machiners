import type { World } from "../sim/types";

export function runCommand(world: World, command: (w: World) => World, commit: (next: World, before: World) => void): unknown {
  let next: World;
  try {
    next = command(world);
  } catch (e) {
    return e;
  }
  commit(next, world);
  return null;
}
