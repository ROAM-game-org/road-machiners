import { describe, expect, it } from 'vitest';
import { playerVehicle, haulerOf } from './damage';
import { getUnstuck, unstuckBlock } from './unstuck';
import { addVehicle, emptyWorld, furyRoadWorld, parkInYard } from './testkit';
import { addState } from './states';
import { dist, type Vec } from './vec';
import { endTurn } from './world';
import { RULES } from '../data/rules';
import type { Obstacle, World } from './types';

const CENTER = { x: 60, y: 60 };
const none = () => {};

function ring(center: Vec): Obstacle[] {
  return Array.from({ length: 16 }, (_, i) => {
    const a = (2 * Math.PI * i) / 16;
    return { id: `ring${i}`, pos: { x: center.x + Math.cos(a) * 3.5, y: center.y + Math.sin(a) * 3.5 }, r: 1.2, kind: 'rock' as const };
  });
}

function pocket(): World {
  const w = emptyWorld(CENTER);
  w.obstacles = ring(CENTER);
  return w;
}

describe('getUnstuck', () => {
  it('sets a truck in a closed pocket outside it, parked and without an order', () => {
    const w = pocket();
    const me = playerVehicle(w);
    me.speed = 2;
    me.order = { kind: 'through', dest: { x: 100, y: 100 } };
    const after = playerVehicle(getUnstuck(w));
    expect(dist(after.pos, CENTER)).toBeGreaterThan(4.7);
    expect(after.speed).toBe(0);
    expect(after.order).toBeNull();
    expect(after.strandedTurns).toBe(RULES.stranded.turns);
  });

  it('keeps a free parked truck where it stands', () => {
    const w = emptyWorld();
    const before = playerVehicle(w);
    const after = playerVehicle(getUnstuck(w));
    expect(after.pos).toEqual(before.pos);
    expect(after.heading).toBe(before.heading);
  });

  it('gives no money, XP or events', () => {
    const w = pocket();
    const after = getUnstuck(w);
    expect(after.player).toEqual(w.player);
    expect(playerVehicle(after).resources).toEqual(playerVehicle(w).resources);
    expect(after.events).toEqual(w.events);
  });

  describe('refusals', () => {
    const refused = (w: World, block: string) => {
      expect(unstuckBlock(w)).toBe(block);
      expect(() => getUnstuck(w)).toThrow(`Get unstuck is refused: ${block}`);
    };

    it('is allowed with nothing in the way', () => {
      expect(unstuckBlock(emptyWorld())).toBeNull();
    });

    it('refuses a knocked-out player', () => {
      const w = emptyWorld();
      w.player.state = 'knockedOut';
      refused(w, 'knockedOut');
    });

    it('refuses a towed player', () => {
      const w = emptyWorld();
      const tower = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 32, y: 30 });
      addState(w, 'tow', tower.id, playerVehicle(w).id, { kind: 'tow', site: 'bowl', fee: 0, waived: 0, hitched: true });
      refused(w, 'towed');
    });

    it('refuses on the radio', () => {
      const w = emptyWorld();
      w.player.call = {} as World['player']['call'];
      refused(w, 'onRadio');
    });

    it('refuses in combat', () => {
      const w = emptyWorld();
      const raider = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 50, y: 30 });
      addState(w, 'combat', raider.id, playerVehicle(w).id, { kind: 'none' });
      refused(w, 'combat');
    });

    it('refuses while towing another truck', () => {
      const w = emptyWorld();
      const towed = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 32, y: 30 });
      addState(w, 'tow', playerVehicle(w).id, towed.id, { kind: 'tow', site: 'bowl', fee: 0, waived: 0, hitched: true });
      refused(w, 'towing');
    });

    it('refuses on a harpoon line, held or holding', () => {
      for (const mine of ['from', 'to'] as const) {
        const w = emptyWorld();
        const other = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 40, y: 30 });
        const ends = mine === 'from' ? [playerVehicle(w).id, other.id] : [other.id, playerVehicle(w).id];
        w.lines.push({ id: 'l1', from: ends[0], fromPart: 'p', to: ends[1], toPart: 'q', length: 10, turnsLeft: 3 });
        refused(w, 'harpoon');
      }
    });

    it('refuses behind shut gates', () => {
      const w = furyRoadWorld();
      parkInYard(w, w.furyRoad!.window + 1);
      refused(endTurn(w, none), 'gatesShut');
    });
  });

  it('leaves the Chaos Highway hauler where it is', () => {
    const w = furyRoadWorld();
    const hauler = { ...haulerOf(w).pos };
    const after = getUnstuck(w);
    expect(haulerOf(after).pos).toEqual(hauler);
  });
});
