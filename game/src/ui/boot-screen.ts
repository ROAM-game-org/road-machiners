
import { AssetUnreachable } from '../fetch-asset';
import { SIGN_STAGES } from '../render/sign';
import { bindAttr, setText } from '../text/language';
import { sameMsg, t, type Msg } from '../text/msg';
import { BOOT_STEPS, BOOT_TEXT, BootProgress, type BootState, type BootStep } from './boot-progress';

const FADE_MS = 250;

const STATUS: Record<BootState, Msg> = { waiting: t('boot.waiting'), running: t('boot.running'), done: t('boot.done'), failed: t('boot.failed') };

function part(root: HTMLElement, selector: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`${selector} missing from #boot`);
  return el;
}

export class BootScreen {
  private readonly progress = new BootProgress();
  private readonly bar: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly signStages: Element[];
  private readonly segments = new Map<BootStep, HTMLElement>();
  private readonly lines = new Map<BootStep, HTMLElement>();
  private readonly announcer: HTMLElement;
  private live: Msg | null = null;
  private stageShown: Msg = BOOT_TEXT.code;

  private unreachable = false;
  private retryButton: HTMLButtonElement | null = null;

  private constructor(
    private readonly root: HTMLElement,
    private readonly retry: () => void,
  ) {
    this.bar = part(root, '[role=progressbar]');
    this.stage = part(root, '.boot-stage');
    this.signStages = SIGN_STAGES.map((stage) => part(root, `.boot-sign [data-stage=${stage}]`));
    const list = part(root, '.boot-steps');
    this.stage.setAttribute('aria-live', 'off');
    this.announcer = document.createElement('p');
    this.announcer.className = 'boot-live';
    this.announcer.setAttribute('aria-live', 'polite');
    root.append(this.announcer);
    this.bar.replaceChildren();
    list.replaceChildren();
    for (const step of BOOT_STEPS) {
      const seg = document.createElement('span');
      seg.className = 'boot-seg';
      seg.dataset.step = step;
      this.bar.append(seg);
      this.segments.set(step, seg);
      const line = document.createElement('li');
      line.append(document.createElement('span'), document.createElement('span'));
      list.append(line);
      this.lines.set(step, line);
    }
    root.dataset.adopted = 'true';
    this.progress.finish('code');
    this.bar.setAttribute('aria-valuemin', '0');
    this.bar.setAttribute('aria-valuemax', String(this.progress.total));
    bindAttr(this.bar, 'aria-label', t('boot.loading'));
    this.render();
  }

  static adopt(retry: () => void): BootScreen {
    const root = document.getElementById('boot');
    if (!root) throw new Error('#boot element missing from the page');
    return new BootScreen(root, retry);
  }

  async track<T>(step: BootStep, work: Promise<T> | (() => T), label?: Msg): Promise<T> {
    this.begin(step, label);
    try {
      if (typeof work === 'function') await this.painted();
      const result = await (typeof work === 'function' ? work() : work);
      if (!this.progress.failed) this.progress.finish(step);
      this.render();
      return result;
    } catch (err) {
      if (!this.progress.failed) this.progress.fail(step);
      if (err instanceof AssetUnreachable) this.offerRetry();
      this.render();
      throw err;
    }
  }

  count(step: BootStep): (done: number, total: number) => void {
    return (done, total) => {
      if (this.progress.failed) return;
      this.begin(step);
      this.progress.count(step, done, total);
      this.render();
    };
  }

  private begin(step: BootStep, label?: Msg): void {
    if (!this.progress.failed && this.progress.state(step) === 'waiting') this.progress.start(step, label);
    this.render();
  }

  async aside<T>(work: () => Promise<T>): Promise<T> {
    this.root.hidden = true;
    try {
      return await work();
    } finally {
      this.root.hidden = false;
    }
  }

  async painted(): Promise<void> {
    if (!document.hidden) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => setTimeout(resolve));
  }

  showText(): void {
    this.root.dataset.fonts = 'ready';
  }

  async finish(): Promise<void> {
    this.progress.start('frame');
    this.render();
    if (!document.hidden) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }
    this.progress.finish('frame');
    this.render();
    const still = document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) return this.root.remove();
    this.root.classList.add('leaving');
    this.root.addEventListener('transitionend', (e) => {
      if (e.target === this.root) this.root.remove();
    });
    setTimeout(() => this.root.remove(), FADE_MS * 2);
  }

  private offerRetry(): void {
    this.unreachable = true;
    if (this.retryButton) return;
    const button = document.createElement('button');
    button.className = 'btn-l boot-retry';
    setText(button, t('boot.retry'));
    button.addEventListener('click', () => this.retry());
    part(this.root, '.boot-box').append(button);
    button.focus();
    this.retryButton = button;
  }

  private failure(): Msg {
    if (this.unreachable) return t('boot.unreachable');
    const step = BOOT_STEPS.find((s) => this.progress.state(s) === 'failed');
    return step ? t('boot.stepFailed', { label: this.progress.label(step) }) : t('boot.failedToLoad');
  }

  private render(): void {
    for (const step of BOOT_STEPS) this.renderStep(step);
    const p = this.progress;
    const text = this.stageText();
    this.bar.setAttribute('aria-valuenow', String(p.finished));
    bindAttr(this.bar, 'aria-valuetext', text);
    setText(this.stage, text);
    this.announce(p.failed ? text : p.liveLine);
    this.root.classList.toggle('failed', p.failed);
    this.signStages.forEach((stage, i) => stage.classList.toggle('shown', i < p.signStages));
    if (p.failed) this.root.setAttribute('aria-busy', 'false');
  }

  private stageText(): Msg {
    this.stageShown = this.progress.failed ? this.failure() : (this.progress.stageLine ?? this.stageShown);
    return this.stageShown;
  }

  private renderStep(step: BootStep): void {
    const state = this.progress.state(step);
    const segment = this.segments.get(step);
    const line = this.lines.get(step);
    if (!segment || !line) throw new Error(`Boot step ${step} has no view`);
    segment.className = `boot-seg ${state}`;
    line.className = state;
    const [name, status] = Array.from(line.children);
    setText(name, this.progress.label(step));
    setText(status, STATUS[state]);
  }

  private announce(live: Msg | null): void {
    if (!live || (this.live && sameMsg(live, this.live))) return;
    this.live = live;
    setText(this.announcer, live);
  }
}
