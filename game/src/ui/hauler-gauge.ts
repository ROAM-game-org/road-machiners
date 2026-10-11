import { haulerOf } from "../sim/damage";
import { mountedParts } from "../sim/grid";
import type { Vehicle, World } from "../sim/types";
import { maxHp } from "../sim/wear";
import { t } from "../text/msg";
import { chassisPortrait } from "./cards";
import { el } from "./dom";

export function haulerCondition(hauler: Vehicle): number {
  const parts = mountedParts(hauler);
  const max = parts.reduce((sum, p) => sum + maxHp(p), 0);
  return max === 0 ? 0 : parts.reduce((sum, p) => sum + p.hp, 0) / max;
}

export class HaulerGauge {
  readonly root = el("div", { class: "hauler-gauge" });

  render(w: World): void {
    if (!w.furyRoad) {
      this.root.style.display = "none";
      return;
    }
    const hauler = haulerOf(w);
    const share = haulerCondition(hauler);
    this.root.style.display = "";
    this.root.title = "";
    this.root.replaceChildren(
      chassisPortrait(hauler.chassisId),
      el("div", { class: `meter${share === 0 ? " broken" : ""}`, title: t("hud.haulerTip", { percent: Math.round(share * 100) }) }, el("div", { style: `width:${share * 100}%` })),
    );
  }
}
