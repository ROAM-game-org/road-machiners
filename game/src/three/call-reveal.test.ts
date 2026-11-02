import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { CONFIG } from '../config';
import { playerVehicle } from '../sim/damage';
import { callVehicle } from '../sim/dialogue';
import { addGoods } from '../sim/inventory';
import { addVehicle, emptyWorld, forceOption, npcBrain, sizedUp, testDrive } from '../sim/testkit';
import type { GameEvent, World } from '../sim/types';
import { endTurn } from '../sim/world';
import { CallReveal } from './call-reveal';

function surrenderTurn(): { w: World; raiderId: string } {
  const w = emptyWorld({ x: 30, y: 30 });
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
  addGoods(w, playerVehicle(w), 'scrap', 2);
  w.player.money = 0;
  w.player.fuel = 0;
  const raider = addVehicle(w, 'scrapjaw', 'buggy', ['stockEngine', 'mg'], { x: 40, y: 30 }, Math.PI);
  raider.brain = npcBrain('buggy', raider.pos, ['raider']);
  sizedUp(w, raider, playerVehicle(w));
  forceOption('hostileSeen', 'fight');
  return { w: endTurn(w, testDrive), raiderId: raider.id };
}

function towTurn(): { w: World; npcId: string } {
  const idle = emptyWorld({ x: 30, y: 30 });
  const npc = addVehicle(idle, 'independent', 'scout', ['stockEngine'], { x: 36, y: 30 });
  npc.brain = npcBrain('trader', npc.pos, ['trader']);
  const w = callVehicle(idle, npc.id);
  const shot: GameEvent = { t: 'towOffer', by: npc.id, town: 'bowl', fee: 3 };
  w.events = [...w.events, shot];
  return { w, npcId: npc.id };
}

const kinds = (events: readonly GameEvent[]) => events.map((e) => e.t);

describe('CallReveal', () => {
  it('holds the raider call and its say line until the beat after playback', () => {
    const { w, raiderId } = surrenderTurn();
    expect(w.player.call?.with).toBe(raiderId);
    const reveal = new CallReveal();
    const logged = reveal.landed(w);
    expect(logged.some((e) => e.t === 'say')).toBe(false);
    expect(logged.some((e) => e.t === 'call')).toBe(false);
    expect(reveal.holding()).toBe(true);
    reveal.ended(1000);
    expect(reveal.due(1000 + CONFIG.callBeatMs - 1)).toBeNull();
    expect(reveal.holding()).toBe(true);
    const due = reveal.due(1000 + CONFIG.callBeatMs)!;
    expect(kinds(due)).toContain('say');
    expect(kinds(due)).toContain('call');
    expect(reveal.holding()).toBe(false);
    expect(reveal.due(5000)).toBeNull();
    expect([...logged, ...due].length).toBe(w.events.length);
  });

  it('holds a tow offer with the call', () => {
    const { w } = towTurn();
    const reveal = new CallReveal();
    reveal.landed(w);
    reveal.ended(0);
    expect(kinds(reveal.due(CONFIG.callBeatMs)!)).toContain('towOffer');
  });

  it('holds nothing on a turn without a call and starts no beat', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const reveal = new CallReveal();
    expect(reveal.landed(w)).toBe(w.events);
    reveal.ended(0);
    expect(reveal.holding()).toBe(false);
    expect(reveal.due(10_000)).toBeNull();
  });

  it('throws when a beat is already running', () => {
    const { w } = towTurn();
    const reveal = new CallReveal();
    reveal.landed(w);
    reveal.ended(0);
    expect(() => reveal.ended(10)).toThrow();
  });

  it('settle returns the held lines for the same caller and drops them when the call is gone', () => {
    const { w } = towTurn();
    const same = new CallReveal();
    same.landed(w);
    expect(kinds(same.settle(w))).toContain('towOffer');
    expect(same.holding()).toBe(false);
    const gone = new CallReveal();
    gone.landed(w);
    expect(gone.settle({ ...w, player: { ...w.player, call: null } })).toEqual([]);
    expect(gone.holding()).toBe(false);
  });
});
