import { MINIMAP } from '../data/minimap';
import { playerVehicle } from '../sim/damage';
import type { World } from '../sim/types';
import { bindAttr } from '../text/language';
import { t } from '../text/msg';
import { el, panel, topLeft } from './dom';
import { MapView, type MapTruck } from './map-view';

const BACKING = 360;

export function poseOf(world: World): MapTruck {
  const me = playerVehicle(world);
  return { pos: me.pos, heading: me.heading };
}

export class Minimap {
  private root = panel('minimap', topLeft());
  private view = new MapView({ kind: 'disc', reach: MINIMAP.reach }, BACKING);

  constructor(onOpen: () => void) {
    const tip = el('div', { class: 'map-tip tooltip', role: 'tooltip' });
    bindAttr(this.root, 'aria-label', t('map.minimap'));
    this.root.setAttribute('role', 'button');
    this.root.tabIndex = 0;
    this.root.addEventListener('click', onOpen);
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onOpen();
    });
    this.view.bindTip(tip);
    this.root.append(this.view.canvas, tip);
  }

  update(world: World, truck: MapTruck = poseOf(world)): void {
    this.view.update(world, truck);
  }
}
