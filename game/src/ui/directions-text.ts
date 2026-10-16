import type { Cue, DirectionStep, RoadName, Span } from '../sim/types';
import { concat, SPACE, t, type Msg } from '../text/msg';
import { compassName, propName, siteName, siteSign } from '../text/names';

type CueMode = 'turn' | 'leave';

const ORDINALS: Record<number, 'second' | 'third'> = { 2: 'second', 3: 'third' };

function ordinal(nth: number): 'second' | 'third' {
  const word = ORDINALS[nth];
  if (!word) throw new Error(`A fork is only counted to the third, not ${nth}`);
  return word;
}

export function cueText(cue: Cue, mode: CueMode): Msg {
  if (cue.kind === 'site' || cue.kind === 'deck') return t('way.cue.site', { site: siteName(cue.id) });
  if (cue.kind === 'prop') return t('way.cue.prop', { prop: propName(cue.look) });
  if (cue.kind === 'fork') return t(mode === 'turn' ? `way.cue.fork.${ordinal(cue.nth)}` : `way.cue.pastFork.${ordinal(cue.nth)}`);
  return t(mode === 'turn' ? 'way.cue.next' : 'way.cue.closest');
}

export function roadText(name: RoadName): Msg {
  return name.kind === 'to' ? t('way.road.to', { site: siteName(name.site) }) : t('way.road.heading', { octant: compassName(name.octant) });
}

const spanText = (span: Span): Msg => t(`way.span.${span}`);

function leadsTo(road: RoadName, target: string | null, next: DirectionStep | undefined): boolean {
  return road.kind === 'to' && road.site === target && next?.do === 'arrive';
}

function haulAfter(span: Span, previous: Span | null): Msg[] {
  return span === 'far' && previous !== 'far' ? [t('way.longHaul')] : [];
}

function stepText(step: DirectionStep, next: DirectionStep | undefined, target: string | null, previous: Span | null): Msg[] {
  switch (step.do) {
    case 'join': return [t('way.join', { octant: compassName(step.octant), span: spanText(step.span) })];
    case 'follow': return [leadsTo(step.road, target, next) ? t('way.followThere') : t('way.follow', { road: roadText(step.road) }), ...haulAfter(step.span, previous)];
    case 'turn': {
      const at = cueText(step.at, 'turn');
      const sentence = leadsTo(step.road, target, next) ? t(`way.turnThere.${step.side}`, { at }) : t(`way.turn.${step.side}`, { at, road: roadText(step.road) });
      return [sentence, ...haulAfter(step.span, previous)];
    }
    case 'arrive': return [t(step.area ? 'way.arriveArea' : 'way.arrive')];
    case 'leave': return [t('way.leave', { at: cueText(step.at, 'leave'), octant: compassName(step.octant), span: spanText(step.span) })];
    case 'straight': return [t('way.straight', { octant: compassName(step.octant), span: spanText(step.span) })];
    case 'search': return [step.clue.kind === 'site' ? t('way.search.site', { sign: siteSign(step.clue.id) }) : t('way.search.rough')];
    case 'askAgain': return [t('way.askAgain')];
    case 'noRoad': return [t('way.noRoad', { octant: compassName(step.octant), span: spanText(step.span) })];
  }
}

function spanOfStep(step: DirectionStep | undefined): Span | null {
  return step && 'span' in step ? step.span : null;
}

export function directionsText(steps: readonly DirectionStep[]): Msg {
  if (steps.length === 0) throw new Error('Directions with no step are never spoken');
  const arrival = steps.find((s) => s.do === 'arrive');
  const target = arrival?.do === 'arrive' ? arrival.site : null;
  const sentences = steps.flatMap((step, i) => stepText(step, steps[i + 1], target, spanOfStep(steps[i - 1])));
  return concat(sentences.flatMap((s, i) => (i === 0 ? [s] : [SPACE, s])));
}
