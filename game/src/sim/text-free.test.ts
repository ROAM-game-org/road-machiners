import { describe, expect, it } from 'vitest';
import { standardWorld } from '../test/world-cache';
import { hangUp } from './dialogue';
import { testDrive } from './testkit';
import type { World } from './types';
import { endTurn } from './world';

const PHRASE = /[A-Za-z]{2,} [A-Za-z]{2,}/;

function strings(value: unknown, path: string, out: [string, string][] = []): [string, string][] {
  if (typeof value === 'string') out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) strings(v, `${path}.${k}`, out);
  return out;
}

function phrases(w: World): [string, string][] {
  const goals = w.vehicles.flatMap((v) => v.brain?.goals ?? []);
  return [...strings(w.events, 'events'), ...strings(goals, 'goals'), ...strings(w.player.call, 'call')].filter(([, s]) => PHRASE.test(s));
}

describe('the sim keeps no English', () => {
  it('holds no phrase in events, goals or the call over many turns', () => {
    let w = standardWorld(7);
    const found: [string, string][] = [];
    let events = 0;
    for (let turn = 0; turn < 25; turn++) {
      if (w.player.call) w = hangUp(w);
      w = endTurn(w, testDrive);
      events += w.events.length;
      found.push(...phrases(w));
    }
    expect(events).toBeGreaterThan(50);
    expect(found).toEqual([]);
  }, 120_000);

  it('the check catches a phrase', () => {
    const w = standardWorld(7);
    w.events = [{ t: 'arrived', vehicle: 'Some truck' }];
    expect(phrases(w)).toEqual([['events[0].vehicle', 'Some truck']]);
  });
});
