import type { World } from '../sim/types';

export type LandingScreen = { kind: 'loot' | 'look'; id: string };

export function landingScreen(world: World): LandingScreen | null {
  const searched = world.events.find((e) => e.t === 'searched');
  if (searched) return { kind: 'loot', id: searched.stock };
  for (const e of world.events) if (e.t === 'lookedOver' && e.by === world.player.vehicleId) return { kind: 'look', id: e.target };
  return null;
}
