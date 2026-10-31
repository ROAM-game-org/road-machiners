import { haulerOf } from "../sim/damage";
import { haulerShare } from "../sim/hauler";
import type { World } from "../sim/types";
import { t } from "../text/msg";
import { chassisPortrait } from "./cards";
import { el } from "./dom";

export class HaulerGauge {
  readonly root = el("div", { class: "hauler-gauge" });

  render(w: World): void {
    if (!w.chaosHighway) {
      this.root.style.display = "none";
      return;
    }
    const hauler = haulerOf(w);
    const share = haulerShare(hauler);
    this.root.style.display = "";
    this.root.replaceChildren(
      chassisPortrait(hauler.chassisId, w.player.paint),
      el("div", { class: `meter${share === 0 ? " broken" : ""}`, title: t("hud.haulerTip", { percent: Math.round(share * 100) }) }, el("div", { style: `width:${share * 100}%` })),
    );
  }
}
