import { createIcon, type IconName } from "./cards";
import { chassisDef } from "../data/chassis";
import { truckFor } from "../sim/damage";
import { loadMass } from "../sim/mass";
import { maxSpeedSteps } from "../sim/stats";
import type { Vehicle, World } from "../sim/types";
import { chassisAbilityLine, chassisAbilityName, chassisName } from "../text/names";
import { powerChip } from "./hud-readout";
import { moneyEl } from "./units";
import { el, type Child } from "./dom";
import { t, type Msg } from "../text/msg";

export type ChipOptions = {
  icon?: IconName;
  readout?: boolean;
  title?: Msg;
  label?: Msg;
  bad?: boolean;
  extra?: HTMLElement[];
  className?: string;
};

export function chipEl(value: Child, opts: ChipOptions = {}): HTMLElement {
  const classes = ["chip", opts.bad ? "bad" : "", opts.className ?? ""].filter(Boolean).join(" ");
  const attrs: Record<string, string | Msg> = {
    class: classes,
    ...(opts.title ? { title: opts.title } : {}),
    ...(opts.label ? { "aria-label": opts.label } : {}),
  };
  const shown = opts.readout && value !== null ? el("span", { class: "num" }, value) : value;
  return el("span", attrs, opts.icon ? createIcon(opts.icon) : null, shown, ...(opts.extra ?? []));
}

function featureChip(chassisId: string): HTMLElement | null {
  const name = chassisAbilityName(chassisId);
  return name ? chipEl(name, { title: chassisAbilityLine(chassisId) ?? name }) : null;
}

export function truckChips(w: World, opts: { feature?: boolean } = {}, truckId?: string): HTMLElement {
  const me = truckFor(w, truckId);
  const mass = loadMass(me);
  const rated = chassisDef(me.chassisId).ratedMass;
  return el(
    "span",
    { class: "chips" },
    chipEl(chassisName(chassisDef(me.chassisId).id), { icon: "truck" }),
    opts.feature === false ? null : featureChip(me.chassisId),
    chipEl(moneyEl(w.player.money)),
    chipEl(t("speed.loadChip", { mass: Math.round(mass), rated: Math.round(rated) }), {
      icon: "mass",
      readout: true,
      bad: mass > rated,
      title: t("inv.loadTitle"),
    }),
    powerChipNode(w, me),
  );
}

function powerChipNode(w: World, me: Vehicle): HTMLElement {
  const chip = powerChip(maxSpeedSteps(w, me), me);
  const cost = chip.cost ? [createIcon("speed"), el("span", { class: "num" }, chip.cost)] : [];
  return chipEl(chip.ratio, { icon: "power", readout: !chip.words, bad: chip.over, title: chip.detail, label: chip.detail, extra: cost });
}
