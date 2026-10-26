import { describe, expect, it } from 'vitest';
import type { QuestLinks } from '../data/quests';
import { QUESTS } from '../sim/quests';
import { brokenLinks, lostQuestNames, raisedQuests, revisionReach, type QuestLinkRecord } from './save-shape';

const NO_LINKS: QuestLinks = { reads: [], readsNotes: [], writes: {}, notes: [], begins: [] };

function record(links: Partial<QuestLinks>, revision = 1): QuestLinkRecord {
  return { bench: { revision, links: { ...NO_LINKS, ...links } } };
}

const RECORDED = record({ reads: ['wagon_pin'], readsNotes: ['wagonBowl'], writes: { wagon_fate: ['logged', 'buried'] }, notes: ['greenPit'], begins: ['leak'] });

describe('brokenLinks', () => {
  it('refuses a value no longer written, a note no longer given, a new read and a changed begin', () => {
    expect(brokenLinks(RECORDED, record({ reads: ['wagon_pin'], readsNotes: ['wagonBowl'], writes: { wagon_fate: ['logged'] }, notes: ['greenPit'], begins: ['leak'] }), [])).toEqual(['quest bench no longer writes "buried" to wagon_fate']);
    expect(brokenLinks(RECORDED, record({ reads: ['wagon_pin'], readsNotes: ['wagonBowl'], writes: { wagon_fate: ['logged', 'buried'] }, begins: ['leak'] }), [])).toEqual(['quest bench no longer gives note greenPit']);
    expect(brokenLinks(RECORDED, record({ ...RECORDED.bench.links, reads: ['wagon_pin', 'depot_thief'], readsNotes: ['wagonBowl', 'pipeBook'] }), [])).toEqual(['quest bench now reads depot_thief', 'quest bench now reads note pipeBook']);
    expect(brokenLinks(RECORDED, record({ ...RECORDED.bench.links, begins: ['pipe'] }), [])).toEqual(['quest bench now begins pipe', 'quest bench no longer begins leak']);
    expect(brokenLinks(RECORDED, record(RECORDED.bench.links, 0), [])).toEqual(['quest bench went down from revision 1 to 0']);
  });

  it('accepts a new value, a new note, a removed read, a new quest, a raised revision and a quest named compatible', () => {
    const grown = record({ writes: { wagon_fate: ['logged', 'buried', 'sold'] }, notes: ['greenPit', 'pipeBook'], begins: ['leak'] });
    expect(brokenLinks(RECORDED, { ...grown, fresh: { revision: 1, links: NO_LINKS } }, [])).toEqual([]);
    const cut = record({ begins: ['pipe'] }, 2);
    expect(brokenLinks(RECORDED, cut, [])).toEqual([]);
    expect(brokenLinks(RECORDED, record({ begins: ['pipe'] }), ['bench'])).toEqual([]);
  });
});

describe('the revision gate on lost names', () => {
  it('lets a quest whose revision rose drop variables and checkpoints, and still guards world variables', () => {
    const recorded = { world: { heard: 'boolean' as const }, local: { bench: { trust: 'number' as const } }, checkpoints: { bench: ['start', 'start.talk'] } };
    const current = { world: {}, local: { bench: {} }, checkpoints: { bench: ['start'] } };
    const raised = raisedQuests(RECORDED, record(RECORDED.bench.links, 2));
    expect(raised).toEqual(['bench']);
    expect(lostQuestNames(recorded, current, raised)).toEqual(['World variable heard (boolean)']);
  });
});

describe('revisionReach', () => {
  it('names the quests a raised revision could reset at most, through reads and the quests it begins', () => {
    expect(revisionReach(QUESTS, 'pump_agnes')).toEqual(expect.arrayContaining(['pump_agnes', 'pump_pipe']));
    expect(revisionReach(QUESTS, 'wagon_bench')).toEqual(expect.arrayContaining(['wagon_bench', 'bowl_dag', 'nose_kovac', 'nose_lena', 'yard_sefa']));
    expect(revisionReach(QUESTS, 'bowl_ruben')).toEqual(['bowl_ruben']);
  });
});
