import type { WorkLeft } from '../sim/states';

import { t, type Msg } from '../text/msg';
import { cellsEl, cellStates, type CellState } from './cards';
import { workProgress } from './format';

export const WORK_CELLS_MAX = 12;

export function workTurnsText(work: WorkLeft): Msg {
  return t('hud.workTurns', { n: work.turnsLeft, total: work.total });
}

function turnCells(work: WorkLeft): CellState[] {
  const done = work.total - work.turnsLeft;
  return Array.from({ length: work.total }, (_, i) => (i < done ? 'on' : 'off'));
}

function workCells(work: WorkLeft): CellState[] {
  return work.total <= WORK_CELLS_MAX ? turnCells(work) : cellStates(workProgress(work), WORK_CELLS_MAX);
}

export function workMeterBar(work: WorkLeft, label: Msg): HTMLElement {
  const count = workTurnsText(work);
  return cellsEl(workCells(work), undefined, {
    class: 'job-bar progress',
    role: 'progressbar',
    'aria-label': t('hud.workProgress', { label }),
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-valuenow': String(Math.round(workProgress(work) * 100)),
    'aria-valuetext': count,
    title: count,
  });
}
