import { describe, expect, it } from 'vitest';
import { directionsTo } from '../sim/directions';
import { emptyWorld } from '../sim/testkit';
import type { Cue, DirectionStep } from '../sim/types';
import { LOCALES } from '../text/msg';
import { resolve } from '../text/resolve';
import { cueText, directionsText } from './directions-text';
import { REGION } from '../data/region';

const STEPS: DirectionStep[] = [
  { do: 'join', octant: 'northWest', span: 'near' },
  { do: 'follow', road: { kind: 'to', site: 'nose' }, span: 'far' },
  { do: 'turn', side: 'left', at: { kind: 'site', id: 'dustwell' }, road: { kind: 'heading', octant: 'south' }, span: 'fair' },
  { do: 'turn', side: 'right', at: { kind: 'prop', look: 'waterTower' }, road: { kind: 'to', site: 'granary' }, span: 'near' },
  { do: 'turn', side: 'keepLeft', at: { kind: 'fork', nth: 2 }, road: { kind: 'to', site: 'bowl' }, span: 'near' },
  { do: 'turn', side: 'keepRight', at: { kind: 'none' }, road: { kind: 'to', site: 'bowl' }, span: 'near' },
  { do: 'leave', at: { kind: 'deck', id: 'canyon-bridge' }, octant: 'east', span: 'fair' },
  { do: 'leave', at: { kind: 'none' }, octant: 'east', span: 'fair' },
  { do: 'straight', octant: 'southEast', span: 'near' },
  { do: 'arrive', site: 'bowl', area: false },
  { do: 'arrive', site: 'orchard', area: true },
  { do: 'search', clue: { kind: 'site', id: 'bowl' }, rough: false },
  { do: 'search', clue: { kind: 'wreck' }, rough: true },
  { do: 'askAgain', at: { kind: 'fork', nth: 3 } },
  { do: 'noRoad', octant: 'north', span: 'far' },
];

describe('directionsText', () => {
  it('renders every kind of step in every language, with no distance in meters', () => {
    for (const locale of LOCALES) {
      for (const step of STEPS) {
        const text = resolve(directionsText([step]), locale);
        expect(text.length, `${locale} ${step.do}`).toBeGreaterThan(0);
        expect(text, `${locale} ${step.do}`).not.toMatch(/[{}]/);
        expect(text, `${locale} ${step.do}`).not.toMatch(/\d+\s?(m|km|м|км)\b/);
      }
    }
  });

  it('joins the steps into one answer in order', () => {
    const text = resolve(directionsText(STEPS.slice(0, 3)), 'en');
    expect(text).toBe('Cut north-west a short way to the road. Take the road to Nose, a long way. At Dustwell, turn left onto the road heading south, a fair way.');
  });

  it('renders a noRoad answer', () => {
    expect(resolve(directionsText([{ do: 'noRoad', octant: 'north', span: 'far' }]), 'en')).toBe('I know no road there. It lies north, a long way.');
  });

  it('renders every real answer from Icarus in every language', () => {
    const w = emptyWorld();
    for (const site of [...REGION.towns, ...REGION.locations]) {
      const steps = directionsTo(w, { x: 200, y: 300 }, { kind: 'site', id: site.id });
      for (const locale of LOCALES) expect(resolve(directionsText(steps), locale)).not.toMatch(/[{}]/);
    }
  });

  it('names a cue of every kind', () => {
    const cues: Cue[] = [{ kind: 'site', id: 'bowl' }, { kind: 'deck', id: 'broken-wing' }, { kind: 'prop', look: 'silo' }, { kind: 'fork', nth: 1 }, { kind: 'fork', nth: 4 }, { kind: 'none' }];
    for (const locale of LOCALES) for (const cue of cues) expect(resolve(cueText(cue, 'turn'), locale).length).toBeGreaterThan(0);
  });

  it('refuses an empty list', () => {
    expect(() => directionsText([])).toThrow();
  });
});
