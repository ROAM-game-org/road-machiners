import { describe, expect, it } from 'vitest';
import { addVehicle, emptyWorld } from '../sim/testkit';
import { addState } from '../sim/states';
import { playerVehicle } from '../sim/damage';
import { resolve } from '../text/resolve';
import { unstuckReason } from './unstuck-reason';

const say = (reason: ReturnType<typeof unstuckReason>) => (reason === null ? null : resolve(reason, 'en'));

describe('the reason Get unstuck is off', () => {
  it('is none for a free player', () => {
    expect(unstuckReason(emptyWorld(), false, false)).toBeNull();
  });

  it('names a playing turn first, then a scene', () => {
    const w = emptyWorld();
    w.player.state = 'knockedOut';
    expect(say(unstuckReason(w, true, true))).toBe('Wait for the turn');
    expect(say(unstuckReason(w, false, true))).toBe('Not during a scene');
    expect(say(unstuckReason(w, false, false))).toBe('Knocked out');
  });

  it('names a fight', () => {
    const w = emptyWorld();
    const raider = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 50, y: 30 });
    addState(w, 'combat', raider.id, playerVehicle(w).id, { kind: 'none' });
    expect(say(unstuckReason(w, false, false))).toBe('In a fight');
  });

  it('names a harpoon line', () => {
    const w = emptyWorld();
    const other = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 40, y: 30 });
    w.lines.push({ id: 'l1', from: playerVehicle(w).id, fromPart: 'p', to: other.id, toPart: 'q', length: 10, turnsLeft: 3 });
    expect(say(unstuckReason(w, false, false))).toBe('On a harpoon line');
  });
});
