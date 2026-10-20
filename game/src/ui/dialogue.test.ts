import { describe, expect, it } from 'vitest';
import { HANG_UP_LINE, LINE_IDS, TOLL, TOPICS, TRAIT_TALK, type LineId, type PrepareId } from '../data/dialogue';
import type { CallVar, CallVars } from '../sim/types';
import { LOCALES, type Msg } from '../text/msg';
import { lineKey } from '../text/names';
import { resolve, schemaOf } from '../text/resolve';
import { emptyWorld, addVehicle, npcBrain } from '../sim/testkit';
import { aidWords, callError, haulText, lineText, sightingText, tipText } from './dialogue';

const en = (msg: Msg): string => resolve(msg, 'en');

describe('trading tip text', () => {
  it('names the site and the good of a dear tip', () => {
    expect(en(tipText({ kind: 'tip', tip: { shop: 'bowl', good: 'salt', dear: true } }))).toBe('Last time I was at Bowl, salt was very overpriced.');
  });

  it('names the site and the good of a cheap tip', () => {
    expect(en(tipText({ kind: 'tip', tip: { shop: 'granary', good: 'grain', dear: false } }))).toBe('Last time I was at The Granary, sorgut was going cheap.');
  });

  it('fits the verb to a good with a plural name', () => {
    expect(en(tipText({ kind: 'tip', tip: { shop: 'nose', good: 'meds', dear: true } }))).toBe('Last time I was at Nose, meds were very overpriced.');
    expect(en(tipText({ kind: 'tip', tip: { shop: 'pump-station', good: 'batteries', dear: false } }))).toBe('Last time I was at Pump Station, batteries were going cheap.');
  });

  it('says there is nothing to tell without a tip', () => {
    expect(en(tipText({ kind: 'tip', tip: null }))).toBe('Nothing worth telling.');
  });

  it('tells a tip in Russian without the English verb', () => {
    expect(resolve(tipText({ kind: 'tip', tip: { shop: 'bowl', good: 'salt', dear: true } }), 'ru')).toBe('Недавно был в Чаше. Там соль продавали втридорога.');
  });
});

describe('aid words', () => {
  it('names fuel and supplies, leaving out a zero part, and counts supplies in each language', () => {
    expect(en(aidWords(2, 3))).toBe('10 L of fuel and 3 supplies');
    expect(en(aidWords(0, 1))).toBe('1 supply');
    expect(resolve(aidWords(0, 5), 'ru')).toBe('5 ящиков припасов');
    expect(() => aidWords(0, 0)).toThrow();
  });
});

const PREPARE_VARS: Record<PrepareId, string[]> = {
  nearestTown: ['town', 'way'],
  towOffer: ['town', 'fee'],
  patchTerms: ['deal'],
  truceAnswer: ['answer', 'haul', 'price'],
  mercyAnswer: ['answer', 'haul', 'price'],
  threatAnswer: ['answer'],
  warnAnswer: ['answer'],
  npcTowTerms: ['site', 'fee'],
  lastTownPrices: ['town', 'prices'],
  nearestRumor: ['site', 'way'],
  tradeTip: ['tip'],
  trucePrice: ['price'],
  guardOffer: ['price'],
  aidWanted: ['aid', 'price'],
  aidAnswer: ['aid'],
  aidOffered: ['aid'],
  yieldAnswer: ['answer'],
  lootWarningTerms: ['warnLine', 'answer'],
  demandHaul: ['haul', 'price'],
  demandCut: ['price'],
  robCutAnswer: ['answer', 'price'],
  surrenderHaul: ['haul'],
  lastSighting: ['sighting'],
  claimWreckBearing: ['bearing', 'distance'],
  courierNeed: ['aid', 'price'],
  taleNews: ['site', 'way', 'tip'],
  tipTerms: ['price', 'way'],
  courierNews: ['site', 'way', 'tip'],
  courierFavorTerms: ['price'],
};

const SAMPLE: Record<string, CallVar> = {
  town: { kind: 'town', id: 'bowl' },
  site: { kind: 'site', id: 'granary' },
  bearing: { kind: 'bearing', rad: 1 },
  distance: { kind: 'distance', tiles: 12 },
  way: { kind: 'directions', steps: [{ do: 'follow', road: { kind: 'to', site: 'nose' }, span: 'far' }, { do: 'arrive', site: 'nose', area: false }] },
  fee: { kind: 'money', amount: 1200 },
  price: { kind: 'money', amount: 45 },
  deal: { kind: 'deal', deal: 'paid', patcher: 'npc', price: 80, parts: 2, turns: 3 },
  prices: { kind: 'prices', town: 'bowl', goods: [{ good: 'salt', buy: 30, sell: 22 }, { good: 'meds', buy: 90, sell: 70 }] },
  tip: { kind: 'tip', tip: { shop: 'nose', good: 'meds', dear: false } },
  aid: { kind: 'aid', fuel: 2, supplies: 3 },
  warnLine: { kind: 'line', line: 'thatsMyPick' },
  haul: { kind: 'haul', goods: { scrap: 2 }, parts: ['mg'] },
  sighting: { kind: 'sighting', driver: 'Jed Cobb', seen: { bearing: 0.8, tiles: 300, turns: 80, heading: 3.1 } },
};

const named = (line: LineId): string[] => Object.keys(schemaOf(lineKey(line)));

describe('every radio line', () => {
  it('names only call values its topic prepares', () => {
    for (const topic of Object.values(TOPICS)) {
      const yields = new Set(topic.prepare ? PREPARE_VARS[topic.prepare] : []);
      for (const [id, node] of Object.entries(topic.nodes)) {
        const known = id === TOLL ? new Set([...yields, 'price']) : yields;
        for (const name of named(node.line)) expect(known.has(name), `${topic.id} ${node.line} {${name}}`).toBe(true);
        for (const option of node.options) expect(named(option.say), `${topic.id} ${option.say}`).toEqual([]);
      }
      if (topic.ask) expect(named(topic.ask.say), topic.id).toEqual([]);
    }
  });

  it('reads in every language with the values it names', () => {
    const vars: CallVars = SAMPLE;
    for (const locale of LOCALES) {
      for (const line of LINE_IDS) {
        const words = resolve(lineText(line, vars), locale);
        expect(words.length, `${locale} ${line}`).toBeGreaterThan(0);
        expect(words, `${locale} ${line}`).not.toContain('{');
      }
    }
  });

  it('every voice and the hang up need no values', () => {
    const voices = Object.values(TRAIT_TALK).flatMap((t) => (t.voice ? [t.voice.greeting, t.voice.repeatLine, t.voice.refusal, t.voice.warnOff] : []));
    for (const line of [...voices, HANG_UP_LINE]) expect(named(line)).toEqual([]);
  });

  it('throws for a line missing a value it names', () => {
    expect(() => lineText('townWay', {})).toThrow(/town/);
  });
});

describe('haul text', () => {
  it('names goods by count and parts by name, joined in one list', () => {
    expect(en(haulText({ kind: 'haul', goods: { scrap: 2 }, parts: [] }))).toBe('2 scrap metal');
    expect(en(haulText({ kind: 'haul', goods: { scrap: 2, salt: 1 }, parts: ['mg'] }))).toBe('2 scrap metal, 1 salt, MG turret');
  });

  it('never names an empty haul', () => {
    expect(() => haulText({ kind: 'haul', goods: {}, parts: [] })).toThrow(/empty haul/);
  });
});

describe('currency in dialogue', () => {
  it("groups an amount and names the unit", () => {
    const vars: CallVars = { town: { kind: 'town', id: 'bowl' }, fee: { kind: 'money', amount: 150000 } };
    expect(en(lineText('pullPaid', vars))).toContain('1,500 M when we get there.');
  });
});

describe('a driver\'s own line', () => {
  it('shows as that line', () => {
    const warn = TOPICS.lootWarning.nodes.warn.line;
    const vars: CallVars = { warnLine: { kind: 'line', line: HANG_UP_LINE } };
    expect(en(lineText(warn, vars))).toBe(en(lineText(HANG_UP_LINE, {})));
  });
});

describe('call error', () => {
  it('is null for a driver in sight and says why otherwise', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const near = addVehicle(w, 'independent', 'scout', [], { x: 32, y: 30 });
    near.brain = npcBrain('trader', { x: 32, y: 30 }, []);
    const far = addVehicle(w, 'independent', 'scout', [], { x: 29, y: 29 });
    far.brain = npcBrain('trader', { x: 29, y: 29 }, []);
    far.pos = { x: 500, y: 500 };
    expect(callError(w, near.id)).toBeNull();
    expect(callError(w, far.id)).not.toBeNull();
    expect(callError(w, 'nobody')).not.toBeNull();
  });
});

describe('sighting words', () => {
  it('tells the age, place and heading of what the driver saw', () => {
    const seen = { bearing: 0, tiles: 300, turns: 60, heading: Math.PI / 2 };
    const words = en(sightingText({ kind: 'sighting', driver: 'Jed Cobb', seen }));
    expect(words).toMatch(/^Jed Cobb\? Saw that truck about 3 hours ago, .* east of you, heading south\.$/);
  });

  it('says they never crossed paths when nothing was seen', () => {
    expect(en(sightingText({ kind: 'sighting', driver: 'Jed Cobb', seen: null }))).toBe('Jed Cobb? Never crossed paths.');
  });
});
