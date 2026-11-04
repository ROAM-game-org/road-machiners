import { bindAttr } from "../text/language";
import { t, type Msg } from "../text/msg";
import { el, isBrowserChord, panel } from "./dom";

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
    const dialog = panel("confirm-dialog dialog");
    const cancel = el("button", { onclick: () => finish(false) }, t("confirm.cancel"));
    const yes = el("button", { class: "btn-danger", onclick: () => finish(true) }, ask.yes);

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
    dialog.append(el("p", { id: QUESTION_ID }, ask.question), el("div", { class: "confirm-buttons" }, cancel, yes));
    window.addEventListener("keydown", onKey, true);
    cancel.focus();
  });
}
