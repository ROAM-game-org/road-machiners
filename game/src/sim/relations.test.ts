import { describe, expect, it } from 'vitest';
import type { TraitId } from '../data/npcs';
import { isHostile, huntsForLoot } from './combat';
import { playerVehicle } from './damage';
import { knockOutNpc } from './defeat';
import { addGoods } from './inventory';
import { remember } from './memory';
import { canRob, visibleHostiles } from './npc-decisions';
import { attitude, bandOf, isAlly, personalTerm, stanceToward } from './relations';
import { getResources } from './resources';
import { addState } from './states';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import { startEscort, strandedAt } from './tow';
import type { Faction, Vehicle, World } from './types';
import type { Vec } from './vec';

function addNpc(w: World, faction: Faction, template: string, traits: TraitId[], pos: Vec): Vehicle {
  const v = addVehicle(w, faction, 'scout', ['mg', 'stockEngine'], pos);
  v.brain = npcBrain(template, pos, traits);
  return v;
}

const lawman = (w: World, pos: Vec) => addNpc(w, 'bowl', 'bowlFarmer', ['lawman', 'brave'], pos);
const raider = (w: World, faction: 'scrapjaw' | 'kiln', pos: Vec) => addNpc(w, faction, 'buggy', ['raider'], pos);
const trader = (w: World, faction: Faction, pos: Vec) => addNpc(w, faction, 'trader', ['trader'], pos);

describe('attitude', () => {
  it('reads the faction table between NPCs and the saved standing toward the player', () => {
    const w = emptyWorld();
    const bowl = trader(w, 'bowl', { x: 40, y: 30 });
    const nose = trader(w, 'nose', { x: 42, y: 30 });
    const road = trader(w, 'independent', { x: 44, y: 30 });
    expect(attitude(w, bowl, nose)).toBe(-25);
    expect(attitude(w, nose, bowl)).toBe(-5);
    expect(attitude(w, bowl, playerVehicle(w))).toBe(5);
    w.player.standing.bowl = -70;
    expect(attitude(w, bowl, playerVehicle(w))).toBe(-70);
    expect(attitude(w, road, playerVehicle(w))).toBe(0);
  });

  it('makes a feud hostile in either direction and caps any truce at neutral', () => {
    const w = emptyWorld();
    const a = trader(w, 'bowl', { x: 40, y: 30 });
    const b = trader(w, 'bowl', { x: 42, y: 30 });
    addState(w, 'feud', b.id, a.id, { kind: 'feud', robbery: false });
    expect(attitude(w, a, b)).toBe(-100);
    const c = trader(w, 'bowl', { x: 44, y: 30 });
    addState(w, 'truce', a.id, c.id, { kind: 'none' });
    expect(attitude(w, a, c)).toBe(0);
    expect(attitude(w, c, a)).toBe(0);
  });

  it('adds the remembered deeds of a driver within their bound, so two Bowl traders can judge the player apart', () => {
    const w = emptyWorld();
    const me = playerVehicle(w);
    const robbed = trader(w, 'bowl', { x: 40, y: 30 });
    const other = trader(w, 'bowl', { x: 42, y: 30 });
    remember(w, robbed, { kind: 'wronged', by: me.id, deed: 'robbed' });
    remember(w, robbed, { kind: 'wronged', by: me.id, deed: 'attacked' });
    expect(personalTerm(robbed, me.id)).toBe(-60);
    expect(attitude(w, robbed, me)).toBe(-55);
    expect(attitude(w, other, me)).toBe(5);
    expect(stanceToward(w, robbed)).toBe('hostile');
    expect(stanceToward(w, other)).toBe('neutral');
  });

  it('keeps a Bowl lawman hostile to an outlaw whatever it remembers, unless they hold a truce', () => {
    const w = emptyWorld();
    const law = lawman(w, { x: 40, y: 30 });
    const kiln = raider(w, 'kiln', { x: 46, y: 30 });
    remember(w, law, { kind: 'helped', by: kiln.id, deed: 'towed' });
    expect(attitude(w, law, kiln)).toBe(-50);
    addState(w, 'truce', kiln.id, law.id, { kind: 'none' });
    expect(attitude(w, law, kiln)).toBe(0);
  });

  it('refuses the player own attitude and an unknown faction', () => {
    const w = emptyWorld();
    const npc = trader(w, 'bowl', { x: 40, y: 30 });
    expect(() => attitude(w, playerVehicle(w), npc)).toThrow(/player/);
    const odd = trader(w, 'raiders' as Faction, { x: 44, y: 30 });
    expect(() => attitude(w, odd, npc)).toThrow(/raiders/);
  });

  it('maps scores to the five bands at their edges', () => {
    expect([-50, -49, -15, -14, 14, 15, 49, 50].map(bandOf)).toEqual(['hostile', 'unfriendly', 'unfriendly', 'neutral', 'neutral', 'friendly', 'friendly', 'allied']);
  });
});

describe('hostility from attitude', () => {
  it('makes a Bowl lawman and a Kiln raider hostile on sight without loot, and every gate agrees', () => {
    const w = emptyWorld();
    const law = lawman(w, { x: 40, y: 30 });
    const kiln = raider(w, 'kiln', { x: 46, y: 30 });
    expect(isHostile(w, law, kiln)).toBe(true);
    expect(isHostile(w, kiln, law)).toBe(true);
    expect(visibleHostiles(w, law).map((v) => v.id)).toContain(kiln.id);
    expect(canRob(w, kiln, law)).toBe(false);
    getResources(w, kiln).fuel = 0;
    expect(strandedAt(w, law, kiln)).toBeNull();
  });

  it('keeps Scrapjaw and Kiln raiders apart: no fight, no robbery, and they may tow each other', () => {
    const w = emptyWorld();
    const scrap = raider(w, 'scrapjaw', { x: 40, y: 30 });
    const kiln = raider(w, 'kiln', { x: 46, y: 30 });
    addGoods(w, kiln, 'scrap', 2);
    expect(isHostile(w, scrap, kiln)).toBe(false);
    expect(canRob(w, scrap, kiln)).toBe(false);
    getResources(w, kiln).fuel = 0;
    expect(strandedAt(w, scrap, kiln)).not.toBeNull();
  });

  it('lets Scrapjaw prey on a loaded Bowl trader while Kiln lets it pass', () => {
    const w = emptyWorld();
    const bowl = trader(w, 'bowl', { x: 40, y: 30 });
    addGoods(w, bowl, 'grain', 2);
    const scrap = raider(w, 'scrapjaw', { x: 46, y: 30 });
    const kiln = raider(w, 'kiln', { x: 34, y: 30 });
    expect(isHostile(w, scrap, bowl)).toBe(true);
    expect(huntsForLoot(w, scrap, bowl)).toBe(true);
    expect(isHostile(w, kiln, bowl)).toBe(false);
  });

  it('stops a Kiln raider that the player towed from preying on the player', () => {
    const w = emptyWorld();
    const me = playerVehicle(w);
    addGoods(w, me, 'scrap', 2);
    const kiln = raider(w, 'kiln', { x: 46, y: 30 });
    expect(isHostile(w, kiln, me)).toBe(true);
    remember(w, kiln, { kind: 'helped', by: me.id, deed: 'towed' });
    expect(attitude(w, kiln, me)).toBe(0);
    expect(isHostile(w, kiln, me)).toBe(false);
  });

  it('makes a robbed independent trader hostile to its robber although their factions are neutral', () => {
    const w = emptyWorld();
    const a = trader(w, 'independent', { x: 40, y: 30 });
    const b = trader(w, 'independent', { x: 46, y: 30 });
    expect(isHostile(w, a, b)).toBe(false);
    remember(w, a, { kind: 'wronged', by: b.id, deed: 'robbed' });
    expect(attitude(w, a, b)).toBe(-50);
    expect(isHostile(w, a, b)).toBe(true);
  });

  it('treats same-faction organized drivers as allies and independents as strangers', () => {
    const w = emptyWorld();
    expect(isAlly(w, trader(w, 'bowl', { x: 40, y: 30 }), trader(w, 'bowl', { x: 42, y: 30 }))).toBe(true);
    expect(isAlly(w, trader(w, 'independent', { x: 44, y: 30 }), trader(w, 'independent', { x: 46, y: 30 }))).toBe(false);
  });
});

describe('truce', () => {
  it('lifts a preying raider into the neutral band, so it leaves a loaded truck alone', () => {
    const w = emptyWorld();
    const me = playerVehicle(w);
    addGoods(w, me, 'scrap', 2);
    const scrap = raider(w, 'scrapjaw', { x: 46, y: 30 });
    expect(isHostile(w, scrap, me)).toBe(true);
    addState(w, 'truce', scrap.id, me.id, { kind: 'none' });
    expect(attitude(w, scrap, me)).toBe(-14);
    expect(isHostile(w, scrap, me)).toBe(false);
  });
});

describe('stance toward the player', () => {
  it('answers for a knocked-out driver, a driver on a tow rope and an escort', () => {
    const w = emptyWorld();
    const out = trader(w, 'bowl', { x: 40, y: 30 });
    knockOutNpc(w, out);
    expect(stanceToward(w, out)).toBe('neutral');
    const leader = trader(w, 'nose', { x: 50, y: 30 });
    const guard = addNpc(w, 'nose', 'convoyGuard', ['guard'], { x: 52, y: 30 });
    startEscort(w, guard, leader, null, 0);
    expect(stanceToward(w, guard)).toBe('neutral');
    const roped = trader(w, 'guidestar', { x: 60, y: 30 });
    addState(w, 'tow', playerVehicle(w).id, roped.id, { kind: 'tow', site: 'bowl', fee: 0, waived: 0, hitched: true });
    expect(stanceToward(w, roped)).toBe('neutral');
    expect(() => stanceToward(w, playerVehicle(w))).toThrow();
  });
});
