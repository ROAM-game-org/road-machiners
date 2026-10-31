import { describe, expect, it } from 'vitest';
import type { TraitId } from '../data/npcs';
import { DEEDS, STANDING } from '../data/npc-behavior';
import { TIME } from '../data/time';
import { settleAid } from './aid';
import { isHostile, noteAttack } from './combat';
import { playerVehicle } from './damage';
import { addGoods } from './inventory';
import { recall } from './memory';
import { driftStanding, noteDefeat, noteContractDeed, noteDeed, personalTerm, reportIncident } from './relations';
import { getResources } from './resources';
import { addState } from './states';
import { addVehicle, editableTerrain, emptyWorld, npcBrain } from './testkit';
import type { Faction, Vehicle, World } from './types';
import type { Vec } from './vec';
import { refreshVision } from './vision';

function addNpc(w: World, faction: Faction, template: string, traits: TraitId[], pos: Vec): Vehicle {
  const v = addVehicle(w, faction, 'scout', ['mg', 'stockEngine'], pos);
  v.brain = npcBrain(template, pos, traits);
  return v;
}

const trader = (w: World, faction: Faction, pos: Vec) => addNpc(w, faction, 'trader', ['trader'], pos);
const standingEvents = (w: World) => w.events.filter((e) => e.t === 'standing');

function raiseHill(w: World): void {
  editableTerrain(w);
  const size = w.terrain.size;
  for (let i = 32; i <= 36; i++) for (let j = 24; j <= 36; j++) w.terrain.heights[j * (size + 1) + i] = 3;
  refreshVision(w);
}

describe('deeds toward a faction', () => {
  it('changes standing once for an observed attack, whatever the number of witnesses', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const me = playerVehicle(w);
    const victim = trader(w, 'bowl', { x: 30, y: 34 });
    for (let i = 0; i < 5; i++) trader(w, 'bowl', { x: 26 + 2 * i, y: 38 });
    noteAttack(w, me, victim, true);
    expect(w.player.standing.bowl).toBe(5 - 15);
    expect(w.player.deeds).toEqual([{ subject: victim.id, faction: 'bowl', deed: 'attacked', delta: -15, turn: w.turn }]);
    expect(personalTerm(victim, me.id)).toBe(-40);
  });

  it('keeps standing for a crime nobody saw, while the victim still remembers it', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    raiseHill(w);
    const me = playerVehicle(w);
    const victim = trader(w, 'bowl', { x: 40, y: 30 });
    reportIncident(w, { aggressor: me, victim, deed: 'robbed', victimFights: false });
    expect(w.player.standing.bowl).toBe(5);
    expect(w.player.deeds).toEqual([]);
    expect(recall(victim, 'wronged').map((m) => m.fact)).toEqual([{ kind: 'wronged', by: me.id, deed: 'robbed' }]);
  });

  it('gives no deed for shooting back at a raider that preys on the player', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const me = playerVehicle(w);
    addGoods(w, me, 'scrap', 2);
    const raider = addNpc(w, 'scrapjaw', 'buggy', ['raider'], { x: 36, y: 30 });
    expect(isHostile(w, raider, me)).toBe(true);
    noteAttack(w, me, raider, !isHostile(w, raider, me));
    expect(w.player.standing.scrapjaw).toBe(-30);
    expect(w.player.deeds).toEqual([]);
    expect(recall(raider, 'wronged')).toEqual([]);
  });

  it('raises standing and the personal term for a free aid gift', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const me = playerVehicle(w);
    const npc = trader(w, 'nose', { x: 34, y: 30 });
    getResources(w, npc).fuel = 0;
    const s = addState(w, 'aid', npc.id, me.id, { kind: 'aid', giver: 'player', fuel: 5, supplies: 0, price: 0, free: true, agreed: true, started: true, work: 0, workLeft: 0 });
    settleAid(w, s);
    expect(w.player.standing.nose).toBe(10);
    expect(personalTerm(npc, me.id)).toBe(30);
  });

  it('counts ten hits on one driver as one attack', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const me = playerVehicle(w);
    const victim = trader(w, 'bowl', { x: 30, y: 34 });
    for (let i = 0; i < 10; i++) reportIncident(w, { aggressor: me, victim, deed: 'attacked', victimFights: true });
    expect(w.player.standing.bowl).toBe(-10);
    expect(w.player.deeds).toHaveLength(1);
  });

  it('caps help gains with one faction per day, and gives no fresh credit for the same driver after a refit', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const me = playerVehicle(w);
    const helped = Array.from({ length: 5 }, (_, i) => trader(w, 'guidestar', { x: 34 + 2 * i, y: 30 }));
    for (const v of helped) noteDeed(w, me, v, 'towed', true);
    expect(w.player.standing.guidestar).toBe(10 + STANDING.dailyGainCap);
    const later = emptyWorld({ x: 30, y: 30 });
    const once = trader(later, 'bowl', { x: 34, y: 30 });
    noteDeed(later, playerVehicle(later), once, 'patched', true);
    later.turn += DEEDS.repeatTurns - 1;
    noteDeed(later, playerVehicle(later), once, 'patched', true);
    expect(later.player.standing.bowl).toBe(10);
  });

  it('opens the help gain cap again on the first turn of the next work day', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const me = playerVehicle(w);
    const helped = Array.from({ length: 5 }, (_, i) => trader(w, 'guidestar', { x: 34 + 2 * i, y: 30 }));
    for (const v of helped.slice(0, 3)) noteDeed(w, me, v, 'towed', true);
    const capped = w.player.standing.guidestar;
    expect(capped).toBe(10 + STANDING.dailyGainCap);
    w.turn = TIME.workDayTurns + 1;
    noteDeed(w, me, helped[3], 'towed', true);
    expect(w.player.standing.guidestar).toBeGreaterThan(capped);
  });

  it('pushes a standing event when a deed crosses a band', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const me = playerVehicle(w);
    noteDeed(w, me, trader(w, 'bowl', { x: 34, y: 30 }), 'robbed', true);
    expect(standingEvents(w)).toEqual([{ t: 'standing', faction: 'bowl', band: 'unfriendly', cause: { kind: 'deed', deed: 'robbed' } }]);
  });

  it('drifts standing from the floor out of the hostile band within six days', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.player.standing.kiln = -100;
    w.player.standing.bowl = -100;
    for (let turn = 1; turn <= 6 * TIME.workDayTurns; turn++) {
      w.turn = turn;
      driftStanding(w);
    }
    expect(w.player.standing.bowl).toBeGreaterThan(-50);
    expect(w.player.standing.kiln).toBe(-40);
    expect(standingEvents(w)).toContainEqual({ t: 'standing', faction: 'bowl', band: 'unfriendly', cause: { kind: 'drift', toward: 'up' } });
  });

  it('names the drift up, the drift down and a contract as causes of a band change', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.player.standing.scrapjaw = -55;
    w.player.standing.bowl = 20;
    for (let turn = 1; turn <= TIME.workDayTurns; turn++) {
      w.turn = turn;
      driftStanding(w);
    }
    expect(standingEvents(w)).toContainEqual({ t: 'standing', faction: 'scrapjaw', band: 'unfriendly', cause: { kind: 'drift', toward: 'up' } });
    expect(standingEvents(w)).toContainEqual({ t: 'standing', faction: 'bowl', band: 'neutral', cause: { kind: 'drift', toward: 'down' } });
    const c = emptyWorld({ x: 30, y: 30 });
    c.player.standing.bowl = 13;
    noteContractDeed(c, 'contract-1', 'bowl', 'contract');
    expect(standingEvents(c)).toEqual([{ t: 'standing', faction: 'bowl', band: 'friendly', cause: { kind: 'deed', deed: 'contract' } }]);
  });

  it('leaves standing alone on Chaos Highway, where deeds still form memories', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.setup = { ...w.setup, mode: 'chaosHighway' };
    const victim = trader(w, 'bowl', { x: 34, y: 30 });
    noteDeed(w, playerVehicle(w), victim, 'attacked', true);
    expect(w.player.standing.bowl).toBe(5);
    expect(personalTerm(victim, playerVehicle(w).id)).toBe(-40);
  });

  it('lets no file but relations.ts write player standing', () => {
    const sources = import.meta.glob(['../**/*.ts', '!../**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const write = /\.standing(?:\[[^\]]+\])?\s*(?:[-+]?=(?!=))/;
    const writers = Object.entries(sources).filter(([path, source]) => !path.endsWith('/relations.ts') && write.test(source)).map(([path]) => path);
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    expect(writers).toEqual([]);
  });
});

describe('the defended deed', () => {
  function raiderPreysOnTrader(): { w: World; me: Vehicle; raider: Vehicle; prey: Vehicle } {
    const w = emptyWorld({ x: 30, y: 30 });
    const me = playerVehicle(w);
    const raider = addNpc(w, 'scrapjaw', 'buggy', ['raider'], { x: 30, y: 34 });
    const prey = trader(w, 'bowl', { x: 32, y: 32 });
    noteAttack(w, raider, prey, true);
    w.turn += 1;
    noteAttack(w, prey, raider, false);
    return { w, me, raider, prey };
  }

  function knockOut(w: World, actor: Vehicle, beaten: Vehicle): void {
    beaten.lastHitBy = actor.id;
    noteDefeat(w, beaten, false);
  }

  it('pays nothing for knocking out a driver who only shot back at a raider', () => {
    const { w, me, raider, prey } = raiderPreysOnTrader();
    noteAttack(w, me, prey, true);
    w.events = [];
    knockOut(w, me, prey);
    expect(w.player.standing.scrapjaw).toBe(-30);
    expect(w.player.deeds.some((d) => d.deed === 'defended')).toBe(false);
    expect(recall(raider, 'helped')).toEqual([]);
  });

  it('still pays for knocking out the raider that attacked the trader', () => {
    const { w, me, raider, prey } = raiderPreysOnTrader();
    knockOut(w, me, raider);
    expect(w.player.deeds).toContainEqual(expect.objectContaining({ subject: prey.id, faction: 'bowl', deed: 'defended', delta: 8 }));
    expect(recall(prey, 'helped').map((m) => m.fact)).toContainEqual(expect.objectContaining({ by: me.id }));
  });

  it('pays nothing after a mutual fight that began on the same turn', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const me = playerVehicle(w);
    const a = addNpc(w, 'scrapjaw', 'buggy', ['raider'], { x: 30, y: 34 });
    const b = trader(w, 'bowl', { x: 32, y: 32 });
    noteAttack(w, a, b, false);
    noteAttack(w, b, a, false);
    knockOut(w, me, a);
    expect(w.player.deeds.some((d) => d.deed === 'defended')).toBe(false);
  });

  it('follows the same rule for an NPC actor', () => {
    const { w, raider, prey } = raiderPreysOnTrader();
    const lawman = addNpc(w, 'bowl', 'buggy', ['raider'], { x: 28, y: 32 });
    knockOut(w, lawman, prey);
    expect(recall(raider, 'helped')).toEqual([]);
    knockOut(w, lawman, raider);
    expect(recall(prey, 'helped')).not.toEqual([]);
  });
});
