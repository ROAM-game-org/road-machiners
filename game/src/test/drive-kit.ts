import { emptyWorld } from '../sim/testkit';
import type { MoveOrder, World } from '../sim/types';
import { endTurn, setMoveOrder } from '../sim/world';
import { buildDrive, freeDrive, type Drive } from '../phys/drive';
import { physicsMove } from '../phys/turn';
import { lineKey } from '../text/names';
import { entryText } from '../text/resolve';

export const en = (line: Parameters<typeof lineKey>[0]): string => entryText('en', lineKey(line));

export function play(w: World, n: number): { w: World; d: Drive } {
  let d = buildDrive(w);
  for (let i = 0; i < n; i++) {
    let next: Drive | null = null;
    w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
    freeDrive(d);
    d = next!;
  }
  return { w, d };
}

export async function playYielding(w: World, n: number): Promise<{ w: World; d: Drive }> {
  let d = buildDrive(w);
  for (let i = 0; i < n; i++) {
    let next: Drive | null = null;
    w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
    freeDrive(d);
    d = next!;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return { w, d };
}

export function ordered(order: MoveOrder, speed = 0, heading = 0): World {
  const w = emptyWorld();
  w.vehicles[0].speed = speed;
  w.vehicles[0].heading = heading;
  return setMoveOrder(w, order);
}


export const me = (w: World) => w.vehicles[0];

export const KICK_SEEN = 0.2;
