import type { Player } from './types';

const sharedAcrossTurns = new WeakSet<Uint8Array>();

export function shareExplored(explored: Uint8Array): Uint8Array {
  sharedAcrossTurns.add(explored);
  return explored;
}

export function ownExplored(player: Player): Uint8Array {
  if (sharedAcrossTurns.has(player.explored)) player.explored = player.explored.slice();
  return player.explored;
}
