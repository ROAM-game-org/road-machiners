import { passShare, SIDES } from '../armor';
import { playerVehicle } from '../damage';
import { vehicleStats } from '../stats';
import type { Vehicle, World } from '../types';
import { setAutoFire } from '../world';
import type { Orders } from './orders';

const MIN_PASS = 0.5;

export function isSoftTarget(world: World, foe: Vehicle): boolean {
  const weapons = vehicleStats(world, playerVehicle(world)).weapons;
  if (weapons.length === 0) return false;
  const heaviest = weapons.reduce((top, w) => (w.def.round.damage > top.def.round.damage ? w : top));
  return SIDES.some((side) => passShare(foe, side, heaviest.def.round) >= MIN_PASS);
}

export function setFire(o: Orders, on: boolean): void {
  if (o.world.player.autoFire !== on) o.run((w) => setAutoFire(w, on));
}
