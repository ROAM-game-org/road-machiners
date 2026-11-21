import { t, type Msg } from "../text/msg";
import { disabledWith, el } from "./dom";
import { keyTip } from "./input-mode";

export interface AutoPatchKeyOptions {
  on: boolean;
  reason: Msg | null;
  flip: () => void;
}

export function autoPatchKey(o: AutoPatchKeyOptions): HTMLElement {
  return el(
    "button",
    { type: "button", role: "switch", "aria-checked": String(o.on), title: keyTip(t("hud.autoPatchTitle"), "P"), ...disabledWith(o.reason, o.flip) },
    t("hud.autoPatch"),
  );
}
