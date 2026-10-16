import type { Cue, DirectionStep, RoadName } from '../sim/types';
import { concat, SPACE, t, type Msg } from '../text/msg';
import { compassName, propName, siteName, siteSign } from '../text/names';

type CueMode = 'turn' | 'leave';

export function cueText(cue: Cue, mode: CueMode): Msg {
  if (cue.kind === 'site' || cue.kind === 'deck') return t('way.cue.site', { site: siteName(cue.id) });
  if (cue.kind === 'prop') return t('way.cue.prop', { prop: propName(cue.look) });
  if (cue.kind === 'fork') return t('way.cue.fork', { n: cue.nth });
  return t(mode === 'turn' ? 'way.cue.next' : 'way.cue.closest');
}

export function roadText(name: RoadName): Msg {
  return name.kind === 'to' ? t('way.road.to', { site: siteName(name.site) }) : t('way.road.heading', { octant: compassName(name.octant) });
}

function stepText(step: DirectionStep): Msg {
  switch (step.do) {
    case 'join': return t('way.join', { octant: compassName(step.octant), span: t(`way.span.${step.span}`) });
    case 'follow': return t('way.follow', { road: roadText(step.road), span: t(`way.span.${step.span}`) });
    case 'turn': return t(`way.turn.${step.side}`, { at: cueText(step.at, 'turn'), road: roadText(step.road), span: t(`way.span.${step.span}`) });
    case 'arrive': return t(step.area ? 'way.arriveArea' : 'way.arrive', { site: siteName(step.site) });
    case 'leave': return t('way.leave', { at: cueText(step.at, 'leave'), octant: compassName(step.octant), span: t(`way.span.${step.span}`) });
    case 'straight': return t('way.straight', { octant: compassName(step.octant), span: t(`way.span.${step.span}`) });
    case 'search': return step.clue.kind === 'site' ? t('way.search.site', { sign: siteSign(step.clue.id) }) : t('way.search.rough');
    case 'askAgain': return t('way.askAgain', { at: cueText(step.at, 'turn') });
    case 'noRoad': return t('way.noRoad', { octant: compassName(step.octant), span: t(`way.span.${step.span}`) });
  }
}

export function directionsText(steps: readonly DirectionStep[]): Msg {
  if (steps.length === 0) throw new Error('Directions with no step are never spoken');
  return concat(steps.flatMap((step, i) => (i === 0 ? [stepText(step)] : [SPACE, stepText(step)])));
}
