import { haulerOf } from "../sim/damage";
import { haulerShare } from "../sim/hauler";
import type { World } from "../sim/types";
import { t } from "../text/msg";
import { chassisPortrait, segmentGauge } from "./cards";
import { el } from "./dom";

export function haulerReadout(share: number): HTMLElement[] {
  const percent = Math.round(share * 100);
  return [
    segmentGauge(share, { title: t("hud.haulerTip", { percent }) }),
    el("span", { class: share === 0 ? "num bad" : "num" }, t("setting.percent", { n: percent })),
  ];
}

export class HaulerGauge {
  readonly root = el("div", { class: "hauler-gauge" });

  render(w: World): void {
    if (!w.chaosHighway) {
      this.root.style.display = "none";
      return;
    }
    const hauler = haulerOf(w);
    this.root.style.display = "";
    this.root.replaceChildren(chassisPortrait(hauler.chassisId, w.player.paint), ...haulerReadout(haulerShare(hauler)));
  }
}
