import { WORLD_MAP } from '../data/minimap';
import type { World } from '../sim/types';
import { t, type Msg } from '../text/msg';
import { el, markDisabled } from './dom';
import { MapView, observeBox, poseOf } from './map-view';
import { wheelZoomFactor } from './map-geometry';

type Drag = { pointer: number; x: number; y: number };

export class MapTab {
  readonly controls: HTMLElement;
  readonly body: HTMLElement;
  private view = new MapView({ kind: 'free' }, 1, 1, null, 1);
  private zoomOut: HTMLElement;
  private zoomIn: HTMLElement;
  private drag: Drag | null = null;

  constructor() {
    this.zoomOut = zoomButton(t('map.zoomOut'), t('map.zoomOutMark'), () => this.zoom(1 / WORLD_MAP.buttonStep));
    this.zoomIn = zoomButton(t('map.zoomIn'), t('map.zoomInMark'), () => this.zoom(WORLD_MAP.buttonStep));
    this.controls = el('span', { class: 'map-zoom' }, this.zoomOut, this.zoomIn);
    this.body = el('div', { class: 'map-tab', 'aria-label': t('map.full') }, this.view.canvas);
    this.listen();
    observeBox(this.body, this.view, () => this.mark());
  }

  open(world: World): void {
    this.view.reset();
    this.render(world);
  }

  render(world: World): void {
    this.view.update(world, poseOf(world));
    this.mark();
  }

  private zoom(factor: number, clientX?: number, clientY?: number): void {
    const at = clientX === undefined || clientY === undefined ? null : this.view.localPoint(clientX, clientY);
    this.view.zoomBy(factor, at?.x, at?.y);
    this.mark();
  }

  private mark(): void {
    markDisabled(this.zoomOut, this.view.canZoomOut() ? null : t('map.zoomedOut'));
    markDisabled(this.zoomIn, this.view.canZoomIn() ? null : t('map.zoomedIn'));
  }

  private listen(): void {
    const canvas = this.view.canvas;
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.deltaY === 0) return;
      this.zoom(wheelZoomFactor(e.deltaY, e.deltaMode), e.clientX, e.clientY);
    }, { passive: false });
    canvas.addEventListener('pointerdown', (e) => {
      const at = this.view.localPoint(e.clientX, e.clientY);
      if (!at) return;
      canvas.setPointerCapture(e.pointerId);
      this.drag = { pointer: e.pointerId, ...at };
      this.body.classList.add('dragging');
    });
    canvas.addEventListener('pointermove', (e) => {
      const drag = this.drag;
      if (!drag || drag.pointer !== e.pointerId) return;
      const at = this.view.localPoint(e.clientX, e.clientY);
      if (!at) return;
      this.view.panBy(at.x - drag.x, at.y - drag.y);
      this.drag = { ...drag, ...at };
    });
    const release = (e: PointerEvent) => {
      if (this.drag?.pointer !== e.pointerId) return;
      this.drag = null;
      this.body.classList.remove('dragging');
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }
}

function zoomButton(name: Msg, mark: Msg, onclick: () => void): HTMLElement {
  return el('button', { class: 'btn-s', title: name, 'aria-label': name, onclick }, mark);
}
