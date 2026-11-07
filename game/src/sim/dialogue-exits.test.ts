import { describe, expect, it } from 'vitest';
import { HANG_UP_LINE } from '../data/dialogue';
import { COLD_LINES } from '../data/personalities';
import { vehicleTitle } from '../text/names';
import { resolve } from '../text/resolve';
import { callVehicle, currentOptions } from './dialogue';
import { coldLine } from './dialogue-rules';
import { addState } from './states';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import { refreshVision } from './vision';

function raider() {
  const w = emptyWorld({ x: 30, y: 30 });
  const npc = addVehicle(w, 'scrapjaw', 'buggy', ['stockEngine'], { x: 36, y: 30 });
  npc.brain = npcBrain('buggy', npc.pos, ['raider']);
  refreshVision(w);
  return { w, npc };
}

describe('a call with a raider', () => {
  it('uses no cold line about the name during a fight', () => {
    const { w, npc } = raider();
    expect(Object.values(COLD_LINES)).toContain(coldLine(w, npc, ['trade']));
    addState(w, 'combat', npc.id, w.player.vehicleId, { kind: 'none' });
    expect(coldLine(w, npc, ['trade'])).toBeNull();
  });

  it('titles the raider by faction and role', () => {
    const { w, npc } = raider();
    expect(resolve(vehicleTitle(w, npc), 'en')).toMatch(/^Scrapjaw outrider /);
  });
});

describe('a page with an option that ends the call', () => {
  it('offers no second way out', () => {
    const { w, npc } = raider();
    const open = callVehicle(w, npc.id);
    const call = open.player.call;
    if (!call) throw new Error('The call did not open');
    call.topic = 'fromTheWest';
    call.node = 'goodbye';
    const options = currentOptions(open);
    expect(options.map((o) => o.option?.go)).toEqual(['end']);
    expect(options.some((o) => o.line === HANG_UP_LINE)).toBe(false);
  });

  it('keeps Hang up on a page that has no ending option', () => {
    const { w, npc } = raider();
    const open = callVehicle(w, npc.id);
    const call = open.player.call;
    if (!call) throw new Error('The call did not open');
    call.topic = 'fromTheWest';
    call.node = 'origin';
    expect(currentOptions(open).some((o) => o.line === HANG_UP_LINE)).toBe(true);
  });
});
