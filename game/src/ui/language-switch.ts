
import { type Language } from "../text/language";
import { LOCALES, t, type Locale } from "../text/msg";
import { el } from "./dom";

export class LanguageSwitch {
  readonly root: HTMLElement;
  private readonly buttons: Map<Locale, HTMLElement>;
  readonly dispose: () => void;

  constructor(parent: HTMLElement, private readonly language: Language) {
    this.buttons = new Map(LOCALES.map((locale) => [locale, this.button(locale)]));
    this.root = el("div", { class: "language-switch", role: "group", "aria-label": t("language.label") },
      ...this.buttons.values(),
    );
    parent.append(this.root);
    this.mark();
    this.dispose = language.subscribe(() => this.mark());
  }

  private button(locale: Locale): HTMLElement {
    return el("button", { class: "language-option", lang: locale, "data-lang": locale, onclick: () => this.language.set(locale) }, t(`language.${locale}`));
  }

  private mark(): void {
    for (const [locale, button] of this.buttons) button.setAttribute("aria-pressed", String(locale === this.language.current()));
  }
}
