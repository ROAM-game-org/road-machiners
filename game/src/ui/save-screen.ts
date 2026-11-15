
import { bindAttr } from '../text/language';
import { t, verbatim, type Msg } from '../text/msg';
import type { SaveError } from '../three/save';
import type { NewRequest, SlotId, SlotInfo } from '../three/save-slots';
import { importButton, pickImport, refusalLine, SaveList, saveSummary, slotRealTime, type SavePanelActions } from './save-panel';
import { disabledWith, download, el, panel } from './dom';
import { openNewGame, type NewGameActions } from './new-game';
import { OptionsPanel } from './options';
import type { SoundSettings } from './sound';

export function chooseSaveFate(error: SaveError, canMigrate: boolean, stored: unknown, newGame: NewGameActions, sound: SoundSettings): Promise<void> {
  return new Promise((resolve) => {
    const root = savePanel(sound, canMigrate ? t('save.needsMigrating') : t('save.doesNotFit'));
    const migrate = () => {
      root.remove();
      resolve();
    };
    const migrateButtons = canMigrate ? [el('button', { onclick: migrate }, t('save.migrate'))] : [];
    root.append(
      el('div', { class: 'dim' }, verbatim(error.code)),
      el(
        'div',
        { class: 'death-buttons' },
        ...migrateButtons,
        el('button', { onclick: () => openNewGame(newGame, () => {}) }, t('menu.newGame')),
        el('button', { onclick: () => downloadSave(stored) }, t('save.download')),
      ),
    );
    root.append(el('div', { class: 'dim' }, t('save.reportBug')));
  });
}

const TITLE = verbatim('Road Machiners');

export function chooseStart(saves: SlotInfo[], newGame: NewGameActions, sound: SoundSettings, importSave: SavePanelActions['importSave'], unfinished = false): Promise<SlotId | NewRequest> {
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
    const startHere = (request: NewRequest) => {
      saveList.close();
      root.remove();
      resolve(request);
    };
    const startMenuNewGame: NewGameActions = { ...newGame, startHere };
    const continueButton = el('button', { class: 'btn-l', ...disabledWith(none, () => next && play(next.slot)) }, t('menu.continue'));
    const loadButton = el('button', { class: 'btn-l', ...disabledWith(none, () => saveList.openLoad(saves, play)) }, t('menu.load'));
    const saveList = new SaveList(() => loadButton.focus());
    const notice = el('div', { class: 'dim', role: 'status' }, t('menu.bootUnfinished'));
    const refused = el('div', { class: 'start-refusal' }, ...(unfinished ? [notice] : []));
    const clearNotice = () => notice.remove();
    root.addEventListener('pointerdown', clearNotice, true);
    root.addEventListener('keydown', clearNotice, true);
    const importFile = async () => {
      const result = await pickImport(importSave);
      if (result === null) return;
      clearNotice();
      if ('slot' in result) play(result.slot);
      else refused.append(refusalLine(result.refusal));
    };
    const newGameButton = el('button', { class: 'btn-l', onclick: () => openNewGame(startMenuNewGame, () => {}) }, t('menu.newGame'));
    const optionsButton = el('button', { class: 'btn-l' }, t('menu.options'));
    const startOptions = new OptionsPanel(sound, () => optionsButton.focus());
    optionsButton.addEventListener('click', () => startOptions.open());
    const resumes = next === null ? [] : [continueCaption(next, continueButton)];
    root.append(el('h1', {}, TITLE), el('div', { class: 'start-buttons' }, el('div', { class: 'start-continue' }, continueButton, ...resumes), el('div', { class: 'start-others' }, loadButton, importButton(() => void importFile(), 'btn-l'), newGameButton, optionsButton)), refused);
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

function savePanel(sound: SoundSettings, title: Msg): HTMLElement {
  const options = new OptionsPanel(sound, () => document.querySelector<HTMLElement>('.save-screen .options-button')?.focus());
  const root = panel('death save-screen');
  root.setAttribute('role', 'alertdialog');
  bindAttr(root, 'aria-label', title);
  root.append(el('h3', {}, title), el('button', { class: 'options-button', onclick: () => options.open() }, t('menu.options')));
  return root;
}
