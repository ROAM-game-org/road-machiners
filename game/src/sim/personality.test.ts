import { describe, expect, it } from 'vitest';
import { HANG_UP_LINE, TOLL, TOPICS, type LineId, type TopicId } from '../data/dialogue';
import type { TraitId } from '../data/npcs';
import { NPCS } from '../data/npcs';
import { PERSONALITY_IDS, TALK_PRICE, type PersonalityId } from '../data/personalities';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { budget } from '../test/budget';
import { callVehicle, chooseOption, currentOptions, talkOf } from './dialogue';
import { remember } from './memory';
import { defaultSetup } from './settings';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import { standingPressures } from './market';
import { refreshVision } from './vision';
import { newWorld } from './world';
import type { Vehicle, World } from './types';

function driver(traits: TraitId[], personality: PersonalityId): { w: World; npc: Vehicle } {
  const w = emptyWorld({ x: 30, y: 30 });
  const npc = addVehicle(w, 'traders', 'scout', ['stockEngine'], { x: 36, y: 30 });
  npc.brain = npcBrain('trader', npc.pos, traits, personality);
  npc.resources = { fuel: 100, supplies: 10, money: 0, health: 100 };
  refreshVision(w);
  return { w, npc };
}

function backFromNose(w: World, npc: Vehicle): void {
  w.player.perks = ['marketEars'];
  remember(w, npc, { kind: 'prices', shop: 'nose', pressure: standingPressures(w, 'nose') });
}

const offered = (w: World): LineId[] => currentOptions(w).map((o) => o.line);

function choose(w: World, line: LineId): World {
  const i = offered(w).indexOf(line);
  if (i < 0) throw new Error(`No option ${line} in ${offered(w).join(' | ')}`);
  return chooseOption(w, i);
}

const ask = (topic: TopicId): LineId => TOPICS[topic].ask!.say;

describe('personality draw', () => {
  it('gives every driver of a seed a personality, the same each time the seed is played', () => {
    const personalities = (seed: number) => newWorld(seed, START_KITS.standard, TEST_MAP, defaultSetup('roaming')).vehicles.filter((v) => v.brain).map((v) => v.brain!.personality);

    expect(personalities(1337)).toEqual(personalities(1337));
    expect(personalities(1337).every((p) => PERSONALITY_IDS.includes(p))).toBe(true);
    expect(personalities(1337)).not.toEqual(personalities(42));
  }, budget(15_000));

  it('uses every personality across a handful of seeds', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 6; seed++) {
      for (const v of newWorld(seed * 7919, START_KITS.standard, TEST_MAP, defaultSetup('roaming')).vehicles) if (v.brain) seen.add(v.brain.personality);
    }

    expect([...seen].sort()).toEqual([...PERSONALITY_IDS].sort());
  }, budget(30_000));

  it('lets every template talk with every personality', () => {
    for (const tpl of Object.values(NPCS)) for (const id of PERSONALITY_IDS) expect(() => talkOf(driver(tpl.traits, id).npc), `${tpl.id} ${id}`).not.toThrow();
  });
});

describe('information gates', () => {
  it('answers an open topic straight away', () => {
    const { w, npc } = driver(['trader'], 'kind');
    const next = choose(callVehicle(w, npc.id), ask('directions'));

    expect(next.player.call?.node).toBe(TOPICS.directions.start);
  });

  it('does not offer a closed topic', () => {
    const { w, npc } = driver(['trader'], 'pious');
    backFromNose(w, npc);

    expect(offered(callVehicle(w, npc.id))).not.toContain(ask('marketNews'));
  });

  it('asks a price first on a price gate and answers once paid, moving the money', () => {
    const { w, npc } = driver(['trader'], 'suspicious');
    w.player.money = TALK_PRICE + 50;
    let next = choose(callVehicle(w, npc.id), ask('directions'));

    expect(next.player.call?.node).toBe(TOLL);
    expect(next.player.call?.line.line).toBe('thatCostsYou');
    expect(next.player.call?.vars.price).toEqual({ kind: 'money', amount: TALK_PRICE });
    next = choose(next, 'dealSendingIt');
    expect(next.player.call?.node).toBe(TOPICS.directions.start);
    expect(next.player.money).toBe(50);
    expect(next.vehicles.find((v) => v.id === npc.id)!.resources!.money).toBe(TALK_PRICE);
  });

  it('leaves a player who cannot pay only the way out, and costs nothing', () => {
    const { w, npc } = driver(['trader'], 'suspicious');
    w.player.money = TALK_PRICE - 1;
    const next = choose(callVehicle(w, npc.id), ask('directions'));

    expect(offered(next)).toEqual(['tooMuch', HANG_UP_LINE]);
    expect(choose(next, 'tooMuch').player.money).toBe(TALK_PRICE - 1);
  });

  it('holds back a help gate until the player has helped the driver', () => {
    const { w, npc } = driver(['trader'], 'tightLipped');
    backFromNose(w, npc);
    const held = choose(callVehicle(w, npc.id), ask('marketNews'));

    expect(held.player.call?.topic).toBeNull();
    expect(held.player.call?.line.line).toBe('helpMeFirst');
    w.player.talked[npc.id] = { offerAid: 'done' };
    const told = choose(callVehicle(w, npc.id), ask('marketNews'));
    expect(told.player.call?.node).toBe(TOPICS.marketNews.start);
  });
});
