import { afterEach, expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { defaultSetup } from './settings';
import { setLoadoutMemo } from './loadout-memo';
import { testDrive } from './testkit';
import { endTurn, newWorld } from './world';

afterEach(() => setLoadoutMemo(true));

function play(turns: number): { world: string; events: string } {
  let w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
  const events: unknown[] = [];
  for (let i = 0; i < turns; i++) {
    w = endTurn(w, testDrive);
    events.push(w.events);
  }
  return { world: JSON.stringify(w), events: JSON.stringify(events) };
}

it('plays six turns of seed 1337 to the same world and events with the memo on and off', () => {
  setLoadoutMemo(true);
  const on = play(6);
  setLoadoutMemo(false);
  const off = play(6);
  expect(off.events).toBe(on.events);
  expect(off.world).toBe(on.world);
});
