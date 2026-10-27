import type { Topic } from './dialogue';
import type { LingerReason } from './linger';
import type { TraitId } from './npcs';
import type { PersonalityId } from './personalities';

export type MomentId = 'fromTheWest' | 'eightToNine' | 'crucible';

export const MOMENT_IDS: readonly MomentId[] = ['fromTheWest', 'eightToNine', 'crucible'];

export type MomentConditionId = 'fromTheWestDue' | 'eightToNineDue' | 'crucibleDue';
export type MomentEffectId = 'hearMoment' | 'honkGoodbye';

export type Moment = {
  reason: LingerReason;
  due: MomentConditionId;
  anyTrait: readonly TraitId[];
  barredTraits: readonly TraitId[];
  personalities: readonly PersonalityId[];
};

export const MOMENTS: Record<MomentId, Moment> = {
  fromTheWest: { reason: 'watchSunset', due: 'fromTheWestDue', anyTrait: ['roamer'], barredTraits: [], personalities: ['kind', 'talkative', 'pious'] },
  eightToNine: { reason: 'restShade', due: 'eightToNineDue', anyTrait: ['trader', 'scavenger'], barredTraits: [], personalities: ['kind', 'talkative', 'pious'] },
  crucible: { reason: 'tendGrave', due: 'crucibleDue', anyTrait: ['trader', 'scavenger', 'roamer', 'courier', 'vulture'], barredTraits: ['scumbag', 'raider'], personalities: ['kind', 'pious'] },
};

export const MOMENT_TALK = { range: 10 };

export const MOMENT_LINES = [
  'westOpening', 'westAskGrandmother', 'westHabits', 'westAskOrigin', 'westOrigin', 'westQuiet', 'westGoodbye',
  'nineOpening', 'nineAskSpiral', 'nineSpiral', 'nineAskHumming', 'nineSongFull', 'nineHum', 'nineAskSong', 'nineSong', 'nineLeave',
  'crucibleOpening', 'crucibleAskFire', 'crucibleFire', 'crucibleAskDoor', 'crucibleDoor', 'crucibleDone',
] as const;

const END = 'end';

function raised(due: MomentConditionId): Topic['raise'] {
  return { when: [due], priority: 2, duringFeud: false, duringCombat: false };
}

export const MOMENT_TOPICS: Record<MomentId, Topic> = {
  fromTheWest: {
    id: 'fromTheWest',
    once: true,
    ask: null,
    raise: raised('fromTheWestDue'),
    prepare: null,
    hangUp: ['hearMoment'],
    start: 'open',
    nodes: {
      open: {
        line: 'westOpening',
        options: [
          { say: 'westAskGrandmother', when: [], effects: [], go: 'habits' },
          { say: 'silent', when: [], effects: [], go: 'quiet' },
        ],
      },
      habits: {
        line: 'westHabits',
        options: [
          { say: 'westAskOrigin', when: [], effects: [], go: 'origin' },
          { say: 'silent', when: [], effects: [], go: 'quiet' },
        ],
      },
      origin: { line: 'westOrigin', options: [{ say: 'silent', when: [], effects: [], go: 'goodbye' }] },
      quiet: { line: 'westQuiet', options: [{ say: 'silent', when: [], effects: [], go: 'goodbye' }] },
      goodbye: { line: 'westGoodbye', options: [{ say: 'overAndOut', when: [], effects: ['hearMoment', 'honkGoodbye'], go: END }] },
    },
  },
  eightToNine: {
    id: 'eightToNine',
    once: true,
    ask: null,
    raise: raised('eightToNineDue'),
    prepare: null,
    hangUp: ['hearMoment'],
    start: 'open',
    nodes: {
      open: {
        line: 'nineOpening',
        options: [
          { say: 'nineAskSpiral', when: [], effects: [], go: 'spiral' },
          { say: 'silent', when: [], effects: [], go: 'hum' },
        ],
      },
      spiral: {
        line: 'nineSpiral',
        options: [
          { say: 'nineAskHumming', when: [], effects: [], go: 'songFull' },
          { say: 'silent', when: [], effects: [], go: 'hum' },
        ],
      },
      songFull: { line: 'nineSongFull', options: [{ say: 'silent', when: [], effects: [], go: 'leave' }] },
      hum: {
        line: 'nineHum',
        options: [
          { say: 'nineAskSong', when: [], effects: [], go: 'song' },
          { say: 'silent', when: [], effects: [], go: 'leave' },
        ],
      },
      song: { line: 'nineSong', options: [{ say: 'silent', when: [], effects: [], go: 'leave' }] },
      leave: { line: 'nineLeave', options: [{ say: 'overAndOut', when: [], effects: ['hearMoment'], go: END }] },
    },
  },
  crucible: {
    id: 'crucible',
    once: true,
    ask: null,
    raise: raised('crucibleDue'),
    prepare: null,
    hangUp: ['hearMoment'],
    start: 'open',
    nodes: {
      open: {
        line: 'crucibleOpening',
        options: [
          { say: 'crucibleAskFire', when: [], effects: [], go: 'fire' },
          { say: 'crucibleAskDoor', when: [], effects: [], go: 'door' },
          { say: 'silent', when: [], effects: [], go: 'done' },
        ],
      },
      fire: {
        line: 'crucibleFire',
        options: [
          { say: 'crucibleAskDoor', when: [], effects: [], go: 'door' },
          { say: 'silent', when: [], effects: [], go: 'done' },
        ],
      },
      door: { line: 'crucibleDoor', options: [{ say: 'silent', when: [], effects: [], go: 'done' }] },
      done: { line: 'crucibleDone', options: [{ say: 'overAndOut', when: [], effects: ['hearMoment'], go: END }] },
    },
  },
};
