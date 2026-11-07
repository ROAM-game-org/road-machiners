import type { WorkLeft } from '../sim/states';

import { t, type Msg } from '../text/msg';
import { el } from './dom';
import { workProgress } from './format';

export const WORK_CELLS_MAX = 12;

export function workTurnsText(work: WorkLeft): Msg {
  return t('hud.workTurns', { n: work.turnsLeft, total: work.total });
}

function cell(done: boolean): HTMLElement {
  return el('i', { class: done ? 'on' : '', 'aria-hidden': 'true' });
}

function cellsOf(work: WorkLeft): HTMLElement[] {
  const done = work.total - work.turnsLeft;
  return Array.from({ length: work.total }, (_, i) => cell(i < done));
}

export function workMeterBar(work: WorkLeft, label: Msg): HTMLElement {
  const progress = Math.round(workProgress(work) * 100);
  const notched = work.total <= WORK_CELLS_MAX;
  const count = workTurnsText(work);
  return el(
    'span',
    {
      class: notched ? 'job-bar meter progress notched' : 'job-bar meter progress',
      style: notched ? `--cells:${work.total}` : undefined,
      role: 'progressbar',
      'aria-label': t('hud.workProgress', { label }),
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': String(progress),
      'aria-valuetext': count,
      title: count,
    },
    ...(notched ? cellsOf(work) : [el('span', { style: `width:${progress}%` })]),
  );
}
