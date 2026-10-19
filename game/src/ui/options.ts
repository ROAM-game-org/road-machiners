
import { bindAttr, language } from "../text/language";
import { t } from "../text/msg";
import { el, panel } from "./dom";
import { LanguageSwitch } from "./language-switch";
import { OptionSwitch } from "./option-switch";
import { minimapSetting } from "./minimap-setting";
import { soundSection, type SoundSettings, type SoundView } from "./sound";
import { UI_SIZES, uiSize } from "./ui-size";

export class OptionsPanel {
  private root: HTMLElement | null = null;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.code !== "Escape") return;
    e.stopPropagation();
    this.dismiss();
  };
  private languageSwitch: LanguageSwitch | null = null;
  private sizeSwitch: OptionSwitch<number> | null = null;
  private minimapSwitch: OptionSwitch<boolean> | null = null;
  private soundView: SoundView | null = null;

  constructor(private readonly sound: SoundSettings, private readonly onClose?: () => void) {}

  isOpen(): boolean {
    return this.root !== null;
  }

  open(): void {
    if (this.root) return;
    const root = panel("options");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "false");
    bindAttr(root, "aria-label", t("options.title"));
    const section = el("section", { class: "options-language" }, el("h4", {}, t("language.label")));
    this.languageSwitch = new LanguageSwitch(section, language());
    const sizeSection = el("section", { class: "options-ui-size" }, el("h4", {}, t("options.uiSize")));
    this.sizeSwitch = this.sizes(sizeSection);
    const minimapSection = el("section", { class: "options-minimap" }, el("h4", {}, t("options.minimap")));
    this.minimapSwitch = this.minimap(minimapSection);
    this.soundView = soundSection(this.sound);
    const soundBlock = el("section", { class: "options-sound" }, el("h4", {}, t("options.sound")), this.soundView.root);
    root.append(el("h3", {}, t("options.title")), section, sizeSection, minimapSection, soundBlock, el("button", { class: "close", onclick: () => this.dismiss() }, t("menu.close")));
    this.root = root;
    window.addEventListener("keydown", this.onKey, true);
    root.querySelector<HTMLElement>('.option-switch > [aria-pressed="true"]')?.focus();
  }

  private sizes(parent: HTMLElement): OptionSwitch<number> {
    const size = uiSize();
    return new OptionSwitch(parent, {
      label: t("options.uiSize"),
      choices: UI_SIZES.map((step) => ({ value: step, label: t("setting.percent", { n: Math.round(step * 100) }) })),
      current: () => size.applied(),
      pick: (step) => size.set(step),
      off: (step) => (size.fits(step) ? null : t("options.uiSizeTooBig")),
      subscribe: (fn) => size.subscribe(fn),
      rootClass: "ui-size-switch",
      buttonClass: "num",
    });
  }

  private minimap(parent: HTMLElement): OptionSwitch<boolean> {
    const setting = minimapSetting();
    return new OptionSwitch(parent, {
      label: t("options.minimap"),
      choices: [{ value: false, label: t("setting.off") }, { value: true, label: t("setting.on") }],
      current: () => setting.on(),
      pick: (on) => setting.set(on),
      off: () => null,
      subscribe: (fn) => setting.subscribe(fn),
      rootClass: "minimap-switch",
    });
  }

  close(): void {
    if (!this.root) return;
    this.root.remove();
    this.root = null;
    this.languageSwitch?.dispose();
    this.languageSwitch = null;
    this.sizeSwitch?.dispose();
    this.sizeSwitch = null;
    this.minimapSwitch?.dispose();
    this.minimapSwitch = null;
    this.soundView?.dispose();
    this.soundView = null;
    window.removeEventListener("keydown", this.onKey, true);
  }

  private dismiss(): void {
    this.close();
    this.onClose?.();
  }
}
