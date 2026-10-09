import { describe, expect, it } from 'vitest';
import { TOLL, TOPICS, type TopicId } from '../data/dialogue';
import type { TraitId } from '../data/npcs';
import { NPCS } from '../data/npcs';
import { PERSONALITIES, PERSONALITY_IDS, TALK_PRICE, type PersonalityId } from '../data/personalities';
import { RUMORS } from '../data/rumors';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { budget } from '../test/budget';
import { callVehicle, chooseOption, currentOptions, hangUp, placeholders, talkOf } from './dialogue';
import { defaultSetup } from './settings';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import { refreshVision } from './vision';
import { newWorld } from './world';
import type { Vehicle, World } from './types';

const ROLES: Record<string, TraitId[]> = {
  trader: ['trader'],
  scavenger: ['scavenger'],
  raider: ['raider'],
  lawman: ['lawman', 'brave'],
  courier: ['courier'],
  roamer: ['roamer'],
  vulture: ['vulture'],
  supplier: ['supplier'],
  guard: ['guard', 'brave'],
  merc: ['merc'],
};

function driver(traits: TraitId[], personality: PersonalityId): { w: World; npc: Vehicle } {
  const w = emptyWorld({ x: 30, y: 30 });
  const npc = addVehicle(w, 'traders', 'scout', ['stockEngine'], { x: 36, y: 30 });
  npc.brain = npcBrain('trader', npc.pos, traits, personality);
  npc.resources = { fuel: 100, supplies: 10, money: 0, health: 100 };
  refreshVision(w);
  return { w, npc };
}

const offered = (w: World): string[] => currentOptions(w).map((o) => o.text);

function choose(w: World, text: string): World {
  const i = offered(w).indexOf(text);
  if (i < 0) throw new Error(`No option "${text}" in ${offered(w).join(' | ')}`);
  return chooseOption(w, i);
}

const ask = (topic: TopicId): string => TOPICS[topic].ask!.text;

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

  it('lets every template talk, so every spawned driver has a voice', () => {
    for (const tpl of Object.values(NPCS)) {
      const { npc } = driver(tpl.traits, 'talkative');
      expect(talkOf(npc).greeting, tpl.id).not.toBe('');
    }
  });
});

describe('personality data', () => {
  const entries = PERSONALITY_IDS.map((id) => [id, PERSONALITIES[id]] as const);
  const gated = (id: PersonalityId, gate: string) => Object.values(PERSONALITIES[id].gates).includes(gate as 'price');

  it('writes a different greeting, repeat line and refusal for each personality', () => {
    for (const key of ['greeting', 'repeatLine', 'refusal'] as const) {
      expect(new Set(entries.map(([, p]) => p[key])).size).toBe(PERSONALITY_IDS.length);
    }
  });

  it('overrides only lines of topics that exist, with the same call values as the original, and never for a closed topic', () => {
    for (const [id, p] of entries) {
      for (const [topic, nodes] of Object.entries(p.lines) as [TopicId, Record<string, string>][]) {
        expect(p.gates[topic], `${id} ${topic}`).not.toBe('closed');
        for (const [node, line] of Object.entries(nodes)) {
          const original = TOPICS[topic].nodes[node];
          expect(original, `${id} ${topic}.${node}`).toBeDefined();
          expect(placeholders(line).sort(), `${id} ${topic}.${node}`).toEqual(placeholders(original.line).sort());
        }
      }
    }
  });

  it('gates only topics the player asks for, and gives a price gate a price node', () => {
    for (const [id, p] of entries) {
      for (const [topic, gate] of Object.entries(p.gates) as [TopicId, string][]) {
        expect(TOPICS[topic].ask, `${id} ${topic}`).not.toBeNull();
        if (gate === 'price') expect(TOPICS[topic].nodes[TOLL], `${id} ${topic}`).toBeDefined();
      }
    }
  });

  it('writes a holding back line and a price line exactly where a gate needs one', () => {
    for (const [id, p] of entries) {
      expect(p.withholdLine !== null, id).toBe(gated(id, 'help'));
      expect(p.tollLine !== null, id).toBe(gated(id, 'price'));
      if (p.tollLine) expect(placeholders(p.tollLine)).toEqual(['price']);
      if (p.withholdLine) expect(placeholders(p.withholdLine)).toEqual([]);
    }
  });

  it('gives every personality that tells rumors a pool of them, and keeps tall tales out of the pools', () => {
    for (const [id, p] of entries) {
      const tells = p.gates.hearsay !== 'closed';
      const pool = RUMORS.filter((r) => p.rumorKinds.includes(r.kind));
      if (tells) expect(pool.length, id).toBeGreaterThan(1);
      expect(pool.some((r) => r.kind === 'tall'), id).toBe(false);
    }
  });

  it('passes on different rumors for different personalities', () => {
    const pools = entries.filter(([, p]) => p.gates.hearsay !== 'closed').map(([, p]) => RUMORS.filter((r) => p.rumorKinds.includes(r.kind)).map((r) => r.id).join());

    expect(new Set(pools).size).toBe(pools.length);
  });
});

describe('talk by personality', () => {
  it('opens the call with the role voice and then the personality greeting', () => {
    const { w, npc } = driver(ROLES.trader, 'pious');
    const next = callVehicle(w, npc.id);

    expect(next.player.call?.line.text).toBe('Go ahead. Peace on the road, stranger.');
  });

  it('gives each personality its own greeting for one role', () => {
    const greetings = PERSONALITY_IDS.map((id) => talkOf(driver(ROLES.trader, id).npc).greeting);

    expect(new Set(greetings).size).toBe(PERSONALITY_IDS.length);
  });

  it('keeps the role voice under every personality', () => {
    const raider = driver(ROLES.raider, 'kind').npc;
    const trader = driver(ROLES.trader, 'kind').npc;

    expect(talkOf(raider).greeting.startsWith('Get lost.')).toBe(true);
    expect(talkOf(trader).greeting.startsWith('Go ahead.')).toBe(true);
    expect(talkOf(raider).honksBack).toBe(false);
  });

  it('offers a different set of topics to a talkative driver and a tight-lipped one of the same role', () => {
    const open = offered(callVehicle(...pair(driver(ROLES.trader, 'talkative'))));
    const shut = offered(callVehicle(...pair(driver(ROLES.trader, 'tightLipped'))));

    expect(open).toContain(ask('tips'));
    expect(open).toContain(ask('hearsay'));
    expect(shut).not.toContain(ask('tips'));
    expect(shut).not.toContain(ask('hearsay'));
    expect(shut).toContain(ask('directions'));
  });

  it('works for every role and every personality: each option on the hub can be taken and hung up on', () => {
    for (const [role, traits] of Object.entries(ROLES)) {
      for (const personality of PERSONALITY_IDS) {
        const { w, npc } = driver(traits, personality);
        w.player.money = TALK_PRICE * 5;
        const call = callVehicle(w, npc.id);
        expect(call.player.call?.line.text, `${role} ${personality}`).toBe(talkOf(npc).greeting);
        const count = currentOptions(call).length;
        for (let i = 0; i < count - 1; i++) {
          const next = chooseOption(call, i);
          if (next.player.call) hangUp(next);
        }
      }
    }
  });
});

function pair({ w, npc }: { w: World; npc: Vehicle }): [World, string] {
  return [w, npc.id];
}

describe('information gates', () => {
  it('answers an open topic with the personality line', () => {
    const { w, npc } = driver(ROLES.trader, 'kind');
    const next = choose(callVehicle(w, npc.id), ask('directions'));

    expect(next.player.call?.line.text).toMatch(/^You are lost\? .* lies .* of you, about .* out\. Drive safe\.$/);
  });

  it('asks a price first on a price gate and answers once paid, moving the money', () => {
    const { w, npc } = driver(ROLES.trader, 'suspicious');
    w.player.money = TALK_PRICE + 50;
    let next = choose(callVehicle(w, npc.id), ask('directions'));

    expect(next.player.call?.line.text).toBe(PERSONALITIES.suspicious.tollLine);
    expect(next.player.call?.vars.price).toEqual({ kind: 'money', amount: TALK_PRICE });
    next = choose(next, 'Deal. Sending it.');
    expect(next.player.call?.line.text).toMatch(/^If you must know, .* lies .* of you/);
    expect(next.player.money).toBe(50);
    expect(next.vehicles.find((v) => v.id === npc.id)!.resources!.money).toBe(TALK_PRICE);
  });

  it('answers a price gate with nothing for a player who cannot pay, and costs nothing', () => {
    const { w, npc } = driver(ROLES.trader, 'suspicious');
    w.player.money = TALK_PRICE - 1;
    const next = choose(callVehicle(w, npc.id), ask('directions'));

    expect(offered(next)).toEqual(['Too much.', 'Hang up.']);
    expect(choose(next, 'Too much.').player.money).toBe(TALK_PRICE - 1);
    expect(next.player.call?.line.text).not.toMatch(/lies/);
  });

  it('holds back a help gate until the player has helped the driver', () => {
    const { w, npc } = driver(ROLES.trader, 'suspicious');
    const held = choose(callVehicle(w, npc.id), ask('hearsay'));

    expect(held.player.call?.topic).toBeNull();
    expect(held.player.call?.line.text).toBe(PERSONALITIES.suspicious.withholdLine);
    w.player.talked[npc.id] = { offerAid: 'done' };
    const told = choose(callVehicle(w, npc.id), ask('hearsay'));
    expect(told.player.call?.line.text).toMatch(/^Keep your voice down\. /);
  });

  it('counts helping with fuel at the radio as help', () => {
    const { w, npc } = driver(ROLES.trader, 'suspicious');
    npc.resources!.fuel = 0;
    let next = choose(callVehicle(w, npc.id), ask('offerAid'));
    next = choose(next, 'Deal.');

    expect(next.player.talked[npc.id]).toEqual({ offerAid: 'done' });
    expect(offered(callVehicle(next.player.call ? hangUp(next) : next, npc.id))).toContain(ask('hearsay'));
  });

  it('tells a rumor from the pool of the personality, and a second one only to a gossip', () => {
    const { w, npc } = driver(ROLES.trader, 'gossip');
    let next = callVehicle(w, npc.id);
    expect(offered(next)).not.toContain(ask('hearsayMore'));
    next = choose(next, ask('hearsay'));
    const first = next.player.call!.vars.rumor;
    next = choose(next, 'Thanks. Something else.');
    next = choose(next, ask('hearsayMore'));

    expect(first).toMatchObject({ kind: 'rumor' });
    expect(next.player.call!.vars.rumor).not.toEqual(first);
    expect(offered(callVehicle(driver(ROLES.trader, 'talkative').w, npc.id))).not.toContain(ask('hearsayMore'));
  });

  it('tells a tall tale only through a braggart', () => {
    const braggart = driver(ROLES.trader, 'braggart');
    const told = choose(callVehicle(braggart.w, braggart.npc.id), ask('boast'));
    const id = (told.player.call!.vars.rumor as { id: string }).id;

    expect(RUMORS.find((r) => r.id === id)!.kind).toBe('tall');
    for (const personality of PERSONALITY_IDS.filter((p) => p !== 'braggart')) {
      const other = driver(ROLES.trader, personality);
      expect(offered(callVehicle(other.w, other.npc.id)), personality).not.toContain(ask('boast'));
    }
  });

  it('settles a told rumor so the same driver gives the repeat line', () => {
    const { w, npc } = driver(ROLES.trader, 'talkative');
    let next = choose(callVehicle(w, npc.id), ask('hearsay'));
    next = choose(next, 'Thanks. Something else.');
    next = choose(next, ask('hearsay'));

    expect(next.player.call?.line.text).toBe(talkOf(npc).repeatLine);
  });

  it('changes no money, goods or fuel for talk that costs nothing', () => {
    const { w, npc } = driver(ROLES.trader, 'gossip');
    const before = JSON.stringify([w.player.money, npc.resources]);
    const next = choose(choose(callVehicle(w, npc.id), ask('hearsay')), 'Thanks. Over and out.');

    expect(JSON.stringify([next.player.money, next.vehicles.find((v) => v.id === npc.id)!.resources])).toBe(before);
  });
});
