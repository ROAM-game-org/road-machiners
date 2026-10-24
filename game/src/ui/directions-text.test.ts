import { describe, expect, it } from 'vitest';
import { directionsTo } from '../sim/directions';
import { emptyWorld } from '../sim/testkit';
import type { Cue, DirectionStep } from '../sim/types';
import { LOCALES } from '../text/msg';
import { resolve } from '../text/resolve';
import { cueText, directionsText } from './directions-text';
import { REGION } from '../data/region';
import { siteName } from '../text/names';

const STEPS: DirectionStep[] = [
  { do: 'join', octant: 'northWest', span: 'near' },
  { do: 'follow', road: { kind: 'to', site: 'nose' }, heading: null, span: 'far' },
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
  { do: 'askAgain' },
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
    expect(text).toBe("Cut north a short way to the road. Take the road to Nose. It's a long haul. At Dustwell, turn left onto the road heading south-west.");
  });

  it('renders a noRoad answer', () => {
    expect(resolve(directionsText([{ do: 'noRoad', octant: 'north', span: 'far' }]), 'en')).toBe('I know no road there. It lies north-east, a long way.');
  });

  it('renders every real answer from Icarus in every language', () => {
    const w = emptyWorld();
    for (const site of [...REGION.towns, ...REGION.locations]) {
      const steps = directionsTo(w, { x: 200, y: 300 }, { kind: 'site', id: site.id });
      for (const locale of LOCALES) expect(resolve(directionsText(steps), locale)).not.toMatch(/[{}]/);
    }
  });

  it('names a cue of every kind', () => {
    const cues: Cue[] = [{ kind: 'site', id: 'bowl' }, { kind: 'deck', id: 'broken-wing' }, { kind: 'prop', look: 'silo' }, { kind: 'fork', nth: 2 }, { kind: 'fork', nth: 3 }, { kind: 'none' }];
    for (const locale of LOCALES) for (const cue of cues) expect(resolve(cueText(cue, 'turn'), locale).length).toBeGreaterThan(0);
  });

  it('names the place once and leaves the span off a road leg', () => {
    const steps: DirectionStep[] = [
      { do: 'join', octant: 'northWest', span: 'fair' },
      { do: 'follow', road: { kind: 'to', site: 'nose' }, heading: null, span: 'fair' },
      { do: 'turn', side: 'left', at: { kind: 'fork', nth: 2 }, road: { kind: 'to', site: 'glass-flats' }, span: 'near' },
      { do: 'arrive', site: 'glass-flats', area: true },
      { do: 'search', clue: { kind: 'site', id: 'glass-flats' }, rough: false },
    ];
    expect(resolve(directionsText(steps), 'en')).toBe('Cut north a fair way to the road. Take the road to Nose. At the second fork, turn left. The road takes you right in. You will know it by glass ground round a half-buried ship engine.');
  });

  it('follows the road without naming it when it leads to the place', () => {
    const steps: DirectionStep[] = [{ do: 'follow', road: { kind: 'to', site: 'bowl' }, heading: null, span: 'near' }, { do: 'arrive', site: 'bowl', area: false }];
    expect(resolve(directionsText(steps), 'en')).toBe('Follow the road. The road takes you to the gate.');
  });

  it('names the way along the first road once, in its first sentence', () => {
    const answer = (road: DirectionStep & { do: 'follow' }, rest: DirectionStep[]) => resolve(directionsText([road, ...rest]), 'en');
    const arrive: DirectionStep = { do: 'arrive', site: 'bowl', area: false };
    expect(answer({ do: 'follow', road: { kind: 'to', site: 'bowl' }, heading: 'west', span: 'near' }, [arrive])).toBe('Follow the road north-west. The road takes you to the gate.');
    expect(answer({ do: 'follow', road: { kind: 'to', site: 'nose' }, heading: 'east', span: 'far' }, [])).toBe("Take the road to Nose, heading south-east. It's a long haul.");
    expect(answer({ do: 'follow', road: { kind: 'heading', octant: 'north' }, heading: 'north', span: 'near' }, [])).toBe('Take the road heading north-east.');
    expect(answer({ do: 'follow', road: { kind: 'to', site: 'nose' }, heading: 'east', span: 'near' }, [{ do: 'turn', side: 'left', at: { kind: 'fork', nth: 2 }, road: { kind: 'to', site: 'bowl' }, span: 'near' }, arrive])).toBe('Take the road to Nose, heading south-east. At the second fork, turn left. The road takes you to the gate.');
  });

  it('reads an answer planned before headings with the old words', () => {
    expect(resolve(directionsText([{ do: 'follow', road: { kind: 'to', site: 'bowl' }, heading: null, span: 'near' }, { do: 'arrive', site: 'bowl', area: false }]), 'en')).toBe('Follow the road. The road takes you to the gate.');
    expect(resolve(directionsText([{ do: 'follow', road: { kind: 'to', site: 'nose' }, heading: null, span: 'near' }]), 'en')).toBe('Take the road to Nose.');
  });

  it('says the heading in Russian too, and never a heading road twice', () => {
    const cases: DirectionStep[][] = [
      [{ do: 'follow', road: { kind: 'to', site: 'bowl' }, heading: 'west', span: 'near' }, { do: 'arrive', site: 'bowl', area: false }],
      [{ do: 'follow', road: { kind: 'to', site: 'nose' }, heading: 'east', span: 'near' }],
      [{ do: 'follow', road: { kind: 'heading', octant: 'north' }, heading: 'north', span: 'near' }],
    ];
    const [west, east, north] = cases.map((steps) => resolve(directionsText(steps), 'ru'));
    expect(west).toContain('к северо-западу');
    expect(east).toContain('к юго-востоку');
    expect(north.match(/к северо-востоку/g)).toHaveLength(1);
  });

  it('warns once about a long road leg, and not after a long cut to the road', () => {
    const road = (span: 'fair' | 'far') => ({ do: 'follow', road: { kind: 'to', site: 'nose' }, heading: null, span }) as const;
    expect(resolve(directionsText([road('far')]), 'en')).toBe("Take the road to Nose. It's a long haul.");
    expect(resolve(directionsText([{ do: 'join', octant: 'east', span: 'far' }, road('far')]), 'en')).toBe('Cut south-east a long way to the road. Take the road to Nose.');
  });

  it('warns of a long haul once across successive long road legs', () => {
    const steps: DirectionStep[] = [
      { do: 'follow', road: { kind: 'to', site: 'nose' }, heading: null, span: 'far' },
      { do: 'turn', side: 'left', at: { kind: 'fork', nth: 2 }, road: { kind: 'heading', octant: 'north' }, span: 'far' },
      { do: 'askAgain' },
    ];
    expect(resolve(directionsText(steps), 'en').match(/long haul/g)).toHaveLength(1);
  });

  it('says past the fork where a wreck leave point is counted', () => {
    expect(resolve(directionsText([{ do: 'leave', at: { kind: 'fork', nth: 2 }, octant: 'east', span: 'near' }]), 'en')).toBe('Past the second fork, where the road runs closest, leave the road and head south-east, a short way.');
  });

  it('asks again plainly', () => {
    expect(resolve(directionsText([{ do: 'askAgain' }]), 'en')).toBe('Ask again on the way.');
  });

  it('refuses to count a fork past the third', () => {
    expect(() => cueText({ kind: 'fork', nth: 4 }, 'turn')).toThrow();
    expect(() => cueText({ kind: 'fork', nth: 1 }, 'leave')).toThrow();
  });

  it('holds no digit, number or unit and names the place once in every real answer, in every language', () => {
    const w = emptyWorld();
    for (const from of [{ x: 200, y: 300 }, { x: 60, y: 40 }, { x: 400, y: 150 }]) {
      for (const site of [...REGION.towns, ...REGION.locations]) {
        const steps = directionsTo(w, from, { kind: 'site', id: site.id });
        for (const locale of LOCALES) {
          const text = resolve(directionsText(steps), locale);
          expect(text, `${locale} ${site.id}`).not.toMatch(/[0-9#]|number|номер|\d\s?(m|km|м|км)\b/);
        }
        const english = resolve(directionsText(steps), 'en');
        const sign = steps.find((x) => x.do === 'search' && x.clue.kind === 'site');
        const name = resolve(siteName(site.id), 'en');
        const body = sign ? english.slice(0, english.indexOf('You will know')) : english;
        expect(body.split(name).length - 1, `${site.id} ${english}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('refuses an empty list', () => {
    expect(() => directionsText([])).toThrow();
  });
});
