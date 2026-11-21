
import { keyPress } from "./control-sound";
import { GAME_MODES, WORLD_SETTINGS } from "../data/modes";
import { defaultSetup, parseSetup } from "../sim/settings";
import type { GameModeId, WorldSettings, WorldSetup } from "../sim/types";
import type { BootRequest, NewRequest } from "../three/save-slots";
import { bindAttr, setText } from "../text/language";
import { knobControl } from "./sound";
import { t, type Msg } from "../text/msg";
import { modeDescription, modeName, settingDescription, settingName } from "../text/names";
import { askConfirm, isConfirmOpen } from "./confirm-dialog";
import { el, panel } from "./dom";

export const CONFIRM_NEW_GAME = t("save.confirmNew");

const share = (value: number): Msg => t("setting.percent", { n: Math.round(value * 100) });

export type NewGameActions = {
  hasAutosave: () => boolean;
  requestBoot: (request: BootRequest) => void;
  reload: () => void;
  startHere?: (request: NewRequest) => void;
};

type SettingId = keyof WorldSettings;
const SETTING_IDS = Object.keys(WORLD_SETTINGS) as SettingId[];
const MODE_IDS = Object.keys(GAME_MODES) as GameModeId[];

let shown: NewGameScreen | null = null;

export function isNewGameOpen(): boolean {
  return shown !== null;
}

export function openNewGame(actions: NewGameActions, onClose: () => void): void {
  if (shown) return;
  shown = new NewGameScreen(actions, onClose);
}

class NewGameScreen {
  private draft: WorldSetup = defaultSetup("roaming");
  private skipIntro = false;
  private readonly opener = document.activeElement as HTMLElement | null;
  private readonly block = panel("new-game-block");
  private readonly root = panel("new-game dialog");
  private readonly modes = el("div", { class: "mode-list screen-block", role: "radiogroup", "aria-label": t("newGame.mode") });
  private readonly settingsButton = el("button", { class: "settings-toggle", "aria-expanded": "false", onclick: () => this.toggleSettings() }, t("newGame.settings"));
  private readonly settings = el("div", { class: "world-settings", hidden: true });
  private readonly introButton = el("button", { class: "intro-toggle", role: "switch", "aria-checked": "false", onclick: () => this.toggleIntro() }, t("newGame.skipIntro"));
  private readonly startButton = el("button", { class: "start btn-l", onclick: () => this.start() }, t("newGame.start"));
  private readonly onKey = (e: Event) => {
    if ((e as KeyboardEvent).code !== "Escape" || isConfirmOpen()) return;
    e.stopPropagation();
    keyPress(this.root.querySelector<HTMLElement>(".back"));
    this.close();
  };

  constructor(private actions: NewGameActions, private onClose: () => void) {
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    bindAttr(this.root, "aria-label", t("menu.newGame"));
    this.root.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if ((e as KeyboardEvent).code === "Tab") this.wrapFocus(e as KeyboardEvent);
    });
    this.root.append(
      el("h3", {}, t("menu.newGame")),
      this.modes,
      this.introButton,
      this.settingsButton,
      this.settings,
      el("div", { class: "new-game-buttons" }, el("button", { class: "back btn-l", onclick: () => this.close() }, t("newGame.back")), this.startButton),
    );
    this.render();
    window.addEventListener("keydown", this.onKey, true);
    this.startButton.focus();
  }

  private render(): void {
    this.modes.replaceChildren(...MODE_IDS.map((id) => this.modeCard(id)));
    this.settings.replaceChildren(
      el("div", { class: "settings-knobs" }, ...SETTING_IDS.filter((id) => WORLD_SETTINGS[id].modes.includes(this.draft.mode)).map((id) => this.settingRow(id))),
      el("button", { class: "reset", onclick: () => this.reset() }, t("newGame.reset")),
    );
  }

  private modeCard(id: GameModeId): HTMLElement {
    const selected = this.draft.mode === id;
    return el(
      "button",
      { class: `screen-line mode-card${selected ? " selected" : ""}`, role: "radio", "aria-checked": String(selected), "data-mode": id, onclick: () => this.pickMode(id) },
      el("b", {}, modeName(id)),
      el("span", {}, modeDescription(id)),
    );
  }

  private settingRow(id: SettingId): HTMLElement {
    const def = WORLD_SETTINGS[id];
    const count = Math.round((def.max - def.min) / def.step);
    const toShare = (v: number) => (v - def.min) / (def.max - def.min);
    const value = el("span", { class: "setting-value cost readout" }, share(this.draft.settings[id]));
    const knob = knobControl({
      label: settingName(id),
      aria: settingName(id),
      count,
      mark: toShare(def.default),
      value: () => toShare(this.draft.settings[id]),
      text: () => share(this.draft.settings[id]),
      set: (next) => {
        this.draft.settings[id] = def.min + Math.round(next * count) * def.step;
        setText(value, share(this.draft.settings[id]));
        knob.draw();
      },
    });
    bindAttr(knob.root, "title", settingDescription(id));
    return el("div", { class: "setting-knob", "data-setting": id }, knob.root, value);
  }

  private wrapFocus(e: KeyboardEvent): void {
    const controls = [...this.root.querySelectorAll<HTMLElement>("button, input, [tabindex]")].filter((c) => c.offsetParent !== null);
    const edge = e.shiftKey ? controls[0] : controls[controls.length - 1];
    if (document.activeElement !== edge) return;
    e.preventDefault();
    (e.shiftKey ? controls[controls.length - 1] : controls[0]).focus();
  }

  private pickMode(id: GameModeId): void {
    if (this.draft.mode === id) return;
    this.draft = defaultSetup(id);
    this.render();
  }

  private toggleIntro(): void {
    this.skipIntro = !this.skipIntro;
    this.introButton.setAttribute("aria-checked", String(this.skipIntro));
    this.introButton.className = this.skipIntro ? "intro-toggle selected" : "intro-toggle";
  }

  private toggleSettings(): void {
    const open = this.settings.hidden;
    this.settings.hidden = !open;
    this.settingsButton.setAttribute("aria-expanded", String(open));
  }

  private reset(): void {
    this.draft = defaultSetup(this.draft.mode);
    this.render();
  }

  private start(): void {
    const request = { new: parseSetup(this.draft), intro: !this.skipIntro };
    if (!this.actions.hasAutosave()) return this.boot(request);
    void askConfirm({ question: CONFIRM_NEW_GAME, yes: t("confirm.startNew") }).then((yes) => {
      if (yes) this.boot(request);
    });
  }

  private boot(request: NewRequest): void {
    if (this.actions.startHere) {
      this.close();
      return this.actions.startHere(request);
    }
    this.actions.requestBoot(request);
    this.actions.reload();
  }

  private close(): void {
    this.root.remove();
    this.block.remove();
    window.removeEventListener("keydown", this.onKey, true);
    shown = null;
    this.opener?.focus();
    this.onClose();
  }
}
