import { t, type Msg } from '../text/msg';
import { disabledWith, el, panel, topCenter } from './dom';
import type { RenderScaleSetting } from './camera-setting';

const LOWEST = 0.5;

export function lowerReason(scale: RenderScaleSetting): Msg | null {
  return scale.scale() === LOWEST ? t('software.lowest') : null;
}

export class SoftwareNotice {
  private root: HTMLElement | null = null;

  constructor(private readonly scale: RenderScaleSetting) {}

  show(): void {
    if (this.root) return;
    const root = panel('software notice', topCenter());
    root.append(
      el('h3', {}, t('software.title')),
      el('div', {}, t('software.body')),
      el(
        'div',
        { class: 'software-buttons' },
        el('button', { class: 'btn-l', ...disabledWith(lowerReason(this.scale), () => this.lower()) }, t('software.lower')),
        el('button', { class: 'btn-l', onclick: () => this.close() }, t('software.keep')),
      ),
    );
    this.root = root;
  }

  close(): void {
    this.root?.remove();
    this.root = null;
  }

  private lower(): void {
    this.scale.set(LOWEST);
    this.close();
  }
}
