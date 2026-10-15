import { t } from '../text/msg';
import { el, panel } from './dom';
import type { UiHost } from './host';
import { MapView } from './map-view';
import { poseOf } from './minimap';

const BACKING = 720;

export class WorldMapScreen {
  private root = panel('modal');
  private view = new MapView({ kind: 'whole' }, BACKING);
  private tip = el('div', { class: 'map-tip tooltip', role: 'tooltip' });

  constructor(private host: UiHost) {
    this.root.classList.add('world-map-screen');
    this.root.style.display = 'none';
    this.view.bindTip(this.tip);
  }

  isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  toggle(): void {
    if (this.isOpen()) return this.close();
    this.root.style.display = '';
    this.root.replaceChildren(
      el('button', { class: 'close', onclick: () => this.close() }, t('map.close')),
      el('div', { class: 'world-map-body', 'aria-label': t('map.full') }, this.view.canvas, this.tip),
    );
    this.render();
  }

  close(): void {
    this.root.style.display = 'none';
    this.root.replaceChildren();
  }

  render(): void {
    if (!this.isOpen()) return;
    const world = this.host.world();
    this.view.update(world, poseOf(world));
  }
}
