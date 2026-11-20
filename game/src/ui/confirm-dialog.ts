import { bindAttr } from "../text/language";
import { t, type Msg } from "../text/msg";
import { isBrowserChord, panel } from "./dom";
import { controls, metalLine, textKey } from "./dash/skin";

export type ConfirmAsk = { question: Msg; yes: Msg };

const QUESTION_ID = "confirm-question";

let asking = false;

export function isConfirmOpen(): boolean {
  return asking;
}

export function askConfirm(ask: ConfirmAsk): Promise<boolean> {
  if (asking) return Promise.resolve(false);
  asking = true;
  return new Promise((resolve) => {
    const opener = document.activeElement as HTMLElement | null;
    const block = panel("confirm-block");
    const dialog = panel("confirm-dialog hud-frame hud-panel");
    const cancel = textKey(t("confirm.cancel"), { onclick: () => finish(false) });
    const yes = textKey(ask.yes, { onclick: () => finish(true) }, true);

    const onKey = (e: Event) => {
      const key = e as KeyboardEvent;
      if (key.code === "Escape") {
        key.stopPropagation();
        finish(false);
        return;
      }
      if (isBrowserChord(key)) return;
      if (key.code === "Tab") {
        key.preventDefault();
        (document.activeElement === cancel ? yes : cancel).focus();
      }
      key.stopPropagation();
    };

    function finish(answer: boolean): void {
      window.removeEventListener("keydown", onKey, true);
      dialog.remove();
      block.remove();
      asking = false;
      opener?.focus();
      resolve(answer);
    }

    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-describedby", QUESTION_ID);
    bindAttr(dialog, "aria-label", ask.question);
    dialog.append(metalLine(ask.question, QUESTION_ID), controls(cancel, yes));
    window.addEventListener("keydown", onKey, true);
    cancel.focus();
  });
}
