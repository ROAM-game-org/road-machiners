import { CONFIG } from '../config';
import { radioSpeakers } from '../sim/dialogue';
import type { GameEvent, World } from '../sim/types';

export function callOpening(world: World): GameEvent[] {
  const call = world.player.call;
  if (!call) return [];
  return world.events.filter((e) => radioSpeakers([e], world.player.vehicleId).includes(call.with));
}

export class CallReveal {
  private held: GameEvent[] = [];
  private caller: string | null = null;
  private beatEnd: number | null = null;

  landed(world: World): GameEvent[] {
    this.clear();
    if (!world.player.call) return world.events;
    this.caller = world.player.call.with;
    this.held = callOpening(world);
    return world.events.filter((e) => !this.held.includes(e));
  }

  ended(now: number): void {
    if (this.caller === null) return;
    if (this.beatEnd !== null) throw new Error('A call beat is already running, so a turn played under a held call');
    this.beatEnd = now + CONFIG.callBeatMs;
  }

  holding(): boolean {
    return this.caller !== null;
  }

  due(now: number): GameEvent[] | null {
    if (this.beatEnd === null || now < this.beatEnd) return null;
    const events = this.held;
    this.clear();
    return events;
  }

  settle(next: World): GameEvent[] {
    const keep = this.caller !== null && next.player.call?.with === this.caller;
    const events = keep ? this.held : [];
    this.clear();
    return events;
  }

  private clear(): void {
    this.held = [];
    this.caller = null;
    this.beatEnd = null;
  }
}
