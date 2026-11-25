
import { bindAttr, language } from "../text/language";
import { t } from "../text/msg";
import { keyPress } from "./control-sound";
import { el, panel } from "./dom";
import { LanguageSwitch } from "./language-switch";
import { OptionSwitch } from "./option-switch";
import { cameraSetting, RENDER_SCALES, renderScaleSetting, type CameraMode, type RenderScale } from "./camera-setting";
import { minimapSetting } from "./minimap-setting";
import { damageNumbersSetting } from "./damage-numbers-setting";
import { logViewSetting } from "./log-setting";
import type { LogView } from "./log";
import { soundSection, type SoundSettings, type SoundView } from "./sound";
import { UI_SIZES, uiSize } from "./ui-size";

export class OptionsPanel {
  private root: HTMLElement | null = null;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.code !== "Escape") return;
    e.stopPropagation();
    keyPress(this.closeKey);
    this.dismiss();
  };
  private languageSwitch: LanguageSwitch | null = null;
  private sizeSwitch: OptionSwitch<number> | null = null;
  private minimapSwitch: OptionSwitch<boolean> | null = null;
  private damageNumbersSwitch: OptionSwitch<boolean> | null = null;
  private logSwitch: OptionSwitch<LogView> | null = null;
  private cameraSwitch: OptionSwitch<CameraMode> | null = null;
  private renderScaleSwitch: OptionSwitch<RenderScale> | null = null;
  private soundView: SoundView | null = null;
  private closeKey: HTMLElement | null = null;

  constructor(private readonly sound: SoundSettings, private readonly onClose?: () => void) {}

  isOpen(): boolean {
    return this.root !== null;
  }

  cameraKey(): HTMLElement | null {
    const other: CameraMode = cameraSetting().mode() === "auto" ? "centered" : "auto";
    return this.cameraSwitch?.buttonFor(other) ?? null;
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
    const damageNumbersSection = el("section", { class: "options-damage-numbers" }, el("h4", {}, t("options.damageNumbers")));
    this.damageNumbersSwitch = this.damageNumbers(damageNumbersSection);
    const logSection = el("section", { class: "options-log" }, el("h4", {}, t("options.log")));
    this.logSwitch = this.logView(logSection);
    const cameraSection = el("section", { class: "options-camera" }, el("h4", {}, t("options.camera")));
    this.cameraSwitch = this.camera(cameraSection);
    const renderScaleSection = el("section", { class: "options-render-scale" }, el("h4", {}, t("options.renderScale")));
    this.renderScaleSwitch = this.renderScale(renderScaleSection);
    this.soundView = soundSection(this.sound);
    const soundBlock = el("section", { class: "options-sound" }, el("h4", {}, t("options.sound")), this.soundView.root);
    this.closeKey = el("button", { class: "close", onclick: () => this.dismiss() }, t("menu.close"));
    root.append(el("h3", {}, t("options.title")), section, sizeSection, minimapSection, damageNumbersSection, logSection, cameraSection, renderScaleSection, soundBlock, this.closeKey);
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

  private damageNumbers(parent: HTMLElement): OptionSwitch<boolean> {
    const setting = damageNumbersSetting();
    return new OptionSwitch(parent, {
      label: t("options.damageNumbers"),
      choices: [{ value: false, label: t("setting.off") }, { value: true, label: t("setting.on") }],
      current: () => setting.on(),
      pick: (on) => setting.set(on),
      off: () => null,
      subscribe: (fn) => setting.subscribe(fn),
      rootClass: "damage-numbers-switch",
    });
  }

  private logView(parent: HTMLElement): OptionSwitch<LogView> {
    const setting = logViewSetting();
    return new OptionSwitch(parent, {
      label: t("options.log"),
      choices: [{ value: "brief", label: t("options.logBrief") }, { value: "verbose", label: t("options.logVerbose") }],
      current: () => setting.view(),
      pick: (view) => setting.set(view),
      off: () => null,
      subscribe: (fn) => setting.subscribe(fn),
      rootClass: "log-view-switch",
    });
  }

  private camera(parent: HTMLElement): OptionSwitch<CameraMode> {
    const setting = cameraSetting();
    return new OptionSwitch(parent, {
      label: t("options.camera"),
      choices: [{ value: "auto", label: t("setting.cameraAuto") }, { value: "centered", label: t("setting.cameraCentered") }],
      current: () => setting.mode(),
      pick: (mode) => setting.set(mode),
      off: () => null,
      subscribe: (fn) => setting.subscribe(fn),
      rootClass: "camera-switch",
    });
  }

  private renderScale(parent: HTMLElement): OptionSwitch<RenderScale> {
    const setting = renderScaleSetting();
    return new OptionSwitch(parent, {
      label: t("options.renderScale"),
      choices: RENDER_SCALES.map((scale) => ({ value: scale, label: t("setting.percent", { n: Math.round(scale * 100) }) })),
      current: () => setting.scale(),
      pick: (scale) => setting.set(scale),
      off: () => null,
      subscribe: (fn) => setting.subscribe(fn),
      rootClass: "render-scale-switch",
      buttonClass: "num",
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
    this.disposeViewSwitches();
    this.soundView?.dispose();
    this.soundView = null;
    window.removeEventListener("keydown", this.onKey, true);
  }

  private disposeViewSwitches(): void {
    this.minimapSwitch?.dispose();
    this.minimapSwitch = null;
    this.damageNumbersSwitch?.dispose();
    this.damageNumbersSwitch = null;
    this.logSwitch?.dispose();
    this.logSwitch = null;
    this.cameraSwitch?.dispose();
    this.cameraSwitch = null;
    this.renderScaleSwitch?.dispose();
    this.renderScaleSwitch = null;
  }

  private dismiss(): void {
    this.close();
    this.onClose?.();
  }
}
