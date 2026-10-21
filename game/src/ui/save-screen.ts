
import { bindAttr } from '../text/language';
import { t, verbatim } from '../text/msg';
import type { SaveError } from '../three/save';
import type { SlotId, SlotInfo } from '../three/save-slots';
import { SaveList, saveSummary, slotRealTime } from './save-panel';
import { disabledWith, download, el, panel } from './dom';
import { openNewGame, type NewGameActions } from './new-game';
import { OptionsPanel } from './options';
import type { SoundSettings } from './sound';

export function chooseSaveFate(error: SaveError, canMigrate: boolean, stored: unknown, newGame: NewGameActions, sound: SoundSettings): Promise<void> {
  return new Promise((resolve) => {
    const root = savePanel(sound);
    const migrate = () => {
      root.remove();
      resolve();
    };
    root.append(
      el('div', { class: 'dim' }, verbatim(error.code)),
      el(
        'div',
        { class: 'death-buttons' },
        el('button', disabledWith(canMigrate ? null : t('save.unreadable'), migrate), t('save.migrate')),
        el('button', { onclick: () => openNewGame(newGame, () => {}) }, t('menu.newGame')),
        el('button', { onclick: () => downloadSave(stored) }, t('save.download')),
      ),
    );
    root.append(el('div', { class: 'dim' }, t('save.reportBug')));
  });
}

const TITLE = verbatim('Road Machiners');

export function chooseStart(saves: SlotInfo[], newGame: NewGameActions, sound: SoundSettings): Promise<SlotId> {
  return new Promise((resolve) => {
    const root = panel('start-menu');
    root.setAttribute('role', 'dialog');
    bindAttr(root, 'aria-label', TITLE);
    const next = saves[0] ?? null;
    const none = next === null ? t('save.none') : null;
    const play = (slot: SlotId) => {
      saveList.close();
      root.remove();
      resolve(slot);
    };
    const continueButton = el('button', { class: 'btn-l', ...disabledWith(none, () => next && play(next.slot)) }, t('menu.continue'));
    const loadButton = el('button', { class: 'btn-l', ...disabledWith(none, () => saveList.openLoad(saves, play)) }, t('menu.load'));
    const saveList = new SaveList(() => loadButton.focus());
    const newGameButton = el('button', { class: 'btn-l', onclick: () => openNewGame(newGame, () => {}) }, t('menu.newGame'));
    const optionsButton = el('button', { class: 'btn-l' }, t('menu.options'));
    const startOptions = new OptionsPanel(sound, () => optionsButton.focus());
    optionsButton.addEventListener('click', () => startOptions.open());
    const resumes = next === null ? [] : [continueCaption(next, continueButton)];
    root.append(el('h1', {}, TITLE), el('div', { class: 'start-buttons' }, el('div', { class: 'start-continue' }, continueButton, ...resumes), el('div', { class: 'start-others' }, loadButton, newGameButton, optionsButton)));
    (next === null ? newGameButton : continueButton).focus();
  });
}

function continueCaption(info: SlotInfo, continueButton: HTMLElement): HTMLElement {
  continueButton.setAttribute('aria-describedby', 'start-save');
  return el('div', { class: 'start-save', id: 'start-save', title: slotRealTime(info) ?? undefined }, ...saveSummary(info));
}

function downloadSave(stored: unknown): void {
  download('roam-save.json', typeof stored === 'string' ? stored : JSON.stringify(stored), 'application/json');
}

function savePanel(sound: SoundSettings): HTMLElement {
  const title = t('save.needsMigrating');
  const options = new OptionsPanel(sound, () => document.querySelector<HTMLElement>('.save-screen .options-button')?.focus());
  const root = panel('death save-screen');
  root.setAttribute('role', 'alertdialog');
  bindAttr(root, 'aria-label', title);
  root.append(el('h3', {}, title), el('button', { class: 'options-button', onclick: () => options.open() }, t('menu.options')));
  return root;
}
