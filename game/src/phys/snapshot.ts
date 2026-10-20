import RAPIER from "@dimforge/rapier3d-compat";

let restorer: RAPIER.SerializationPipeline | null = null;

export function restoreWorld(snapshot: Uint8Array): RAPIER.World {
  restorer ??= new RAPIER.SerializationPipeline();
  const raw = restorer.raw.deserializeAll(snapshot);
  if (!raw) throw new Error("Rapier could not read the physics snapshot");
  try {
    return RAPIER.World.fromRaw(raw);
  } finally {
    raw.free();
  }
}

export function stepWorld(world: RAPIER.World, events?: RAPIER.EventQueue): void {
  if (!world.physicsPipeline) throw new Error("Physics world was stepped after it was freed");
  world.physicsPipeline.step(world.gravity, world.integrationParameters, world.islands, world.broadPhase, world.narrowPhase, world.bodies, world.colliders, world.softBodies, world.impulseJoints, world.multibodyJoints, world.ccdSolver, events);
}

export function freeOnThrow<T>(world: RAPIER.World, events: RAPIER.EventQueue, use: () => T): T {
  try {
    return use();
  } catch (error) {
    world.free();
    throw error;
  } finally {
    events.free();
  }
}
