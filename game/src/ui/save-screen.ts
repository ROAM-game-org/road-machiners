
import type { World } from '../sim/types';
import type { CarryReport } from '../sim/world';
import { eventText } from './format';
import { bindAttr } from '../text/language';
import { list, t, verbatim, type Msg } from '../text/msg';
import { goodName, partName, questTitle, settingName } from '../text/names';
import { WORLD_SETTINGS } from '../data/modes';
import type { LoadRepair, SaveError } from '../three/save';
import type { SlotId, SlotInfo } from '../three/save-slots';
import { SaveList, saveSummary, slotRealTime } from './save-panel';
import { disabledWith, download, el, panel } from './dom';
import { openNewGame, type NewGameActions } from './new-game';
import { OptionsPanel } from './options';
import type { SoundSettings } from './sound';
import { moneyMsg } from './units';

export function saveErrorText(error: SaveError): Msg {
  const code = error.code;
  if (code === 'outOfReach' || code === 'mapChanged') throw new Error(`Save error ${code} carries on load and never reaches the save screen`);
  return formatErrorText(error, code);
}

function formatErrorText(error: SaveError, code: Exclude<SaveError['code'], 'outOfReach' | 'mapChanged'>): Msg {
  if (code !== 'incompatible' && code !== 'newer' && code !== 'notMigrated') return t(`save.error.${code}`);
  if (!error.format) throw new Error(`Save error ${code} names no format`);
  return t(`save.error.${code}`, error.format);
}

export function chooseSaveFate(reason: Msg, canMigrate: boolean, stored: unknown, newGame: NewGameActions, sound: SoundSettings): Promise<void> {
  return new Promise((resolve) => {
    const root = savePanel(t('save.needsMigrating'), sound);
    const migrate = () => {
      root.remove();
      resolve();
    };
    root.append(
      el('div', {}, t('save.migrateExplain')),
      el('div', { class: 'dim' }, reason),
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

export function showCarryReport(report: CarryReport, sound: SoundSettings): Promise<void> {
  const lines = [...repairLines(report.questsReset), ...carryLines(report), ...changeLines(report)];
  return showReport(t('save.migrated'), lines.length === 0 ? [t('save.allCarried')] : lines, sound);
}

export function showRepairReport(world: World, repair: LoadRepair, sound: SoundSettings): Promise<void> {
  const logged = repair.events.flatMap((e) => eventText(world, e)?.text ?? []);
  return showReport(t('save.repaired'), [...repairLines(repair.questsReset), ...soldLines(repair.sold), ...changeLines(repair), ...logged], sound);
}

function showReport(title: Msg, lines: readonly Msg[], sound: SoundSettings): Promise<void> {
  return new Promise((resolve) => {
    const root = savePanel(title, sound);
    root.append(
      ...lines.map((line) => el('div', {}, line)),
      el('div', { class: 'death-buttons' }, el('button', { onclick: () => { root.remove(); resolve(); } }, t('save.driveOn'))),
    );
  });
}

function downloadSave(stored: unknown): void {
  download('roam-save.json', typeof stored === 'string' ? stored : JSON.stringify(stored), 'application/json');
}

function savePanel(title: Msg, sound: SoundSettings): HTMLElement {
  const options = new OptionsPanel(sound, () => document.querySelector<HTMLElement>('.save-screen .options-button')?.focus());
  const root = panel('death save-screen');
  root.setAttribute('role', 'alertdialog');
  bindAttr(root, 'aria-label', title);
  root.append(el('h3', {}, title), el('button', { class: 'options-button', onclick: () => options.open() }, t('menu.options')));
  return root;
}

function repairLines(questsReset: readonly string[]): Msg[] {
  return questsReset.length > 0 ? [t('save.questsReset', { quests: list(questsReset.map(questTitle)) })] : [];
}

function soldLines(sold: CarryReport['sold']): Msg[] {
  return sold.map((s) => t('save.sold', { n: s.units, good: goodName(s.good), money: moneyMsg(s.money) }));
}

function carryLines(report: CarryReport): Msg[] {
  const sold = soldLines(report.sold);
  const refunded = report.refunded.map((r) => t('save.refunded', { id: verbatim(r.id), money: moneyMsg(r.money) }));
  return [...(report.toGarage.length > 0 ? [t('save.toGarage', { parts: list(report.toGarage.map(partName)) })] : []), ...sold, ...refunded];
}

function changeLines(changes: Pick<CarryReport, 'lost' | 'settingsReset'>): Msg[] {
  return [
    ...(changes.lost.length > 0 ? [t('save.lost', { ids: list(changes.lost.map(verbatim)) })] : []),
    ...changes.settingsReset.map((id) => t('save.settingReset', { setting: settingName(id), pct: Math.round(WORLD_SETTINGS[id].default * 100) })),
  ];
}
