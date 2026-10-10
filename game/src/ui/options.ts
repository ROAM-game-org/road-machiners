
import { bindAttr, language } from "../text/language";
import { t } from "../text/msg";
import { el, panel } from "./dom";
import { LanguageSwitch } from "./language-switch";

export class OptionsPanel {
  private root: HTMLElement | null = null;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.code !== "Escape") return;
    e.stopPropagation();
    this.dismiss();
  };
  private languageSwitch: LanguageSwitch | null = null;

  constructor(private readonly onClose?: () => void) {}

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
    root.append(el("h3", {}, t("options.title")), section, el("button", { class: "close", onclick: () => this.dismiss() }, t("menu.close")));
    this.root = root;
    window.addEventListener("keydown", this.onKey, true);
    root.querySelector<HTMLElement>('.language-option[aria-pressed="true"]')?.focus();
  }

  close(): void {
    if (!this.root) return;
    this.root.remove();
    this.root = null;
    this.languageSwitch?.dispose();
    this.languageSwitch = null;
    window.removeEventListener("keydown", this.onKey, true);
  }

  private dismiss(): void {
    this.close();
    this.onClose?.();
  }
}
