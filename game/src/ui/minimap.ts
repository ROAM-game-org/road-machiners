import { MINIMAP } from '../data/minimap';
import type { World } from '../sim/types';
import { t } from '../text/msg';
import { keyLabel } from './input-mode';
import { el, markDisabled, panel, topLeft } from './dom';
import { MapView, observeBox, poseOf, type MapTruck } from './map-view';

function reachStep(reach: number): number {
  const at = MINIMAP.reaches.indexOf(reach);
  if (at < 0) throw new Error(`Minimap reach ${reach} is not a step`);
  return at;
}

export class Minimap {
  private root = panel('minimap', topLeft());
  private step = reachStep(MINIMAP.startReach);
  private view = new MapView({ kind: 'follow', reach: MINIMAP.startReach }, 1, 1);
  private zoomOut = el('button', { class: 'btn-s', title: t('map.zoomOut'), 'aria-label': t('map.zoomOut'), onclick: () => this.stepTo(this.step + 1) }, t('map.zoomOutMark'));
  private zoomIn = el('button', { class: 'btn-s', title: t('map.zoomIn'), 'aria-label': t('map.zoomIn'), onclick: () => this.stepTo(this.step - 1) }, t('map.zoomInMark'));

  constructor(onOpen: () => void) {
    const tip = el('div', { class: 'map-tip tooltip', role: 'tooltip' });
    const open = el('button', { class: 'log-expand', title: keyLabel(t('map.open'), 'K'), 'aria-label': t('map.open'), onclick: onOpen }, t('log.expandMark'));
    this.view.canvas.addEventListener('click', onOpen);
    this.view.bindTip(tip);
    const body = el('div', { class: 'minimap-body' }, this.view.canvas, tip);
    this.root.append(el('div', { class: 'minimap-head' }, this.zoomOut, this.zoomIn, open), body);
    observeBox(body, this.view);
    this.mark();
  }

  update(world: World, truck: MapTruck = poseOf(world)): void {
    this.view.update(world, truck);
  }

  dispose(): void {
    this.root.remove();
  }

  private stepTo(step: number): void {
    if (step < 0 || step >= MINIMAP.reaches.length) return;
    this.step = step;
    this.view.setReach(MINIMAP.reaches[step]);
    this.mark();
  }

  private mark(): void {
    markDisabled(this.zoomIn, this.step > 0 ? null : t('map.zoomedIn'));
    markDisabled(this.zoomOut, this.step < MINIMAP.reaches.length - 1 ? null : t('map.zoomedOut'));
  }
}
