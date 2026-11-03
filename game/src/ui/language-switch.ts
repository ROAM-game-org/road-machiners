import { type Language } from "../text/language";
import { LOCALES, t } from "../text/msg";
import { OptionSwitch } from "./option-switch";

export class LanguageSwitch {
  readonly root: HTMLElement;
  readonly dispose: () => void;

  constructor(parent: HTMLElement, language: Language) {
    const switcher = new OptionSwitch(parent, {
      label: t("language.label"),
      choices: LOCALES.map((locale) => ({ value: locale, label: t(`language.${locale}`), lang: locale, hook: locale })),
      current: () => language.current(),
      pick: (locale) => language.set(locale),
      off: () => null,
      subscribe: (fn) => language.subscribe(fn),
      rootClass: "language-switch",
      buttonClass: "language-option",
      dataKey: "lang",
    });
    this.root = switcher.root;
    this.dispose = switcher.dispose;
  }
}
