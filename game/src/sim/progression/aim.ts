import { setAutoFire } from '../world';
import type { Orders } from './orders';

export function setFire(o: Orders, on: boolean): void {
  if (o.world.player.autoFire !== on) o.run((w) => setAutoFire(w, on));
}
