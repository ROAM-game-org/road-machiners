import { WORLD_MAP } from '../data/minimap';
import { TOUCH } from '../config';
import { playerVehicle } from '../sim/damage';
import { clickOrder } from '../sim/steering';
import type { World } from '../sim/types';
import type { Vec } from '../sim/vec';
import { playerCanAct, setMoveOrder, waypointOf } from '../sim/world';
import { t, type Msg } from '../text/msg';
import { el, markDisabled } from './dom';
import type { UiHost } from './host';
import { mapScene, MapView, observeBox, poseOf } from './map-view';
import { wheelZoomFactor, type Viewport } from './map-geometry';
import { drawWaypoint, type Waypoint } from './map-waypoint';

type Drag = { pointer: number; x: number; y: number; startX: number; startY: number; panned: boolean };

export class MapTab {
  readonly controls: HTMLElement;
  readonly body: HTMLElement;
  private view: MapView;
  private zoomOut: HTMLElement;
  private zoomIn: HTMLElement;
  private drag: Drag | null = null;
  private waypoint: Waypoint | null = null;
  private truckAt: Vec | null = null;

  constructor(private host: UiHost) {
    this.view = new MapView({ kind: 'free' }, 1, 1, (ctx, view) => this.drawOrder(ctx, view), 1);
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
    this.waypoint = waypointOf(world);
    this.truckAt = playerVehicle(world).pos;
    this.view.update(mapScene(world), poseOf(world));
    this.mark();
  }

  private drawOrder(ctx: CanvasRenderingContext2D, view: Viewport): void {
    if (this.waypoint && this.truckAt) drawWaypoint(ctx, view, this.waypoint, this.truckAt);
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
    canvas.addEventListener('pointerdown', (e) => this.press(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => {
      const drag = this.release(e);
      if (drag && !drag.panned) this.click(e);
    });
    canvas.addEventListener('pointercancel', (e) => this.release(e));
  }

  private press(e: PointerEvent): void {
    const at = this.view.localPoint(e.clientX, e.clientY);
    if (!at) return;
    this.view.canvas.setPointerCapture(e.pointerId);
    this.drag = { pointer: e.pointerId, ...at, startX: e.clientX, startY: e.clientY, panned: false };
    this.body.classList.add('dragging');
  }

  private move(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.pointer !== e.pointerId) return;
    const at = this.view.localPoint(e.clientX, e.clientY);
    if (!at) return;
    const panned = pastSlop(drag, e);
    if (panned) this.view.panBy(at.x - drag.x, at.y - drag.y);
    this.drag = { ...drag, ...(panned ? at : {}), panned };
  }

  private release(e: PointerEvent): Drag | null {
    const drag = this.drag;
    if (drag?.pointer !== e.pointerId) return null;
    this.drag = null;
    this.body.classList.remove('dragging');
    return drag;
  }

  private click(e: PointerEvent): void {
    const world = this.host.world();
    if (this.host.getTurnPhase() !== null || !playerCanAct(world)) return;
    const dest = this.view.pick(e.clientX, e.clientY);
    if (!dest) return;
    this.host.apply(setMoveOrder(world, clickOrder(world.terrain, dest, e.shiftKey, playerVehicle(world))));
  }
}

function pastSlop(drag: Drag, e: PointerEvent): boolean {
  return drag.panned || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) >= TOUCH.slopPx;
}

function zoomButton(name: Msg, mark: Msg, onclick: () => void): HTMLElement {
  return el('button', { class: 'btn-s', title: name, 'aria-label': name, onclick }, mark);
}
