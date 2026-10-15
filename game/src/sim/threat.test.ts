import { describe, expect, it } from 'vitest';
import { startKit } from '../data/start';
import { playerVehicle } from './damage';
import { defaultSetup } from './settings';
import { addVehicle, npcBrain } from './testkit';
import { TEST_MAP } from '../test/map';
import { hostileToPlayer, newWorld, threatToPlayer } from './world';

function worldWithRaider() {
  const w = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
  const me = playerVehicle(w);
  const raider = addVehicle(w, 'raiders', 'buggy', [], { x: me.pos.x + 6, y: me.pos.y });
  raider.brain = npcBrain('raider', raider.pos, []);
  return { w, me, raider };
}

describe('threatToPlayer', () => {
  it('holds for an awake hostile driver', () => {
    const { w, raider } = worldWithRaider();
    expect(hostileToPlayer(w, raider)).toBe(true);
    expect(threatToPlayer(w, raider)).toBe(true);
  });

  it('does not hold for a knocked-out hostile, a driverless truck or the player', () => {
    const { w, me, raider } = worldWithRaider();
    expect(threatToPlayer(w, me)).toBe(false);
    raider.defeat = { phase: 'out', turns: 5, unseen: 0, foes: [], gaveUp: false };
    expect(threatToPlayer(w, raider)).toBe(false);
    delete raider.defeat;
    raider.brain = null;
    expect(threatToPlayer(w, raider)).toBe(false);
  });
});
