import { createIcon, type IconName } from "./cards";
import { chassisDef, HAULER_CHASSIS, PLAYER_CHASSIS } from "../data/chassis";
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
  chars?: number;
};

function chipClasses(opts: ChipOptions): string {
  const fixed = opts.chars === undefined ? "" : "fixed";
  return ["chip", opts.bad ? "bad" : "", fixed, opts.className ?? ""].filter(Boolean).join(" ");
}

function chipAttrs(opts: ChipOptions): Record<string, string | Msg> {
  return {
    class: chipClasses(opts),
    ...(opts.chars === undefined ? {} : { style: `--chip-ch:${opts.chars}` }),
    ...(opts.title ? { title: opts.title } : {}),
    ...(opts.label ? { "aria-label": opts.label } : {}),
  };
}

export function chipEl(value: Child, opts: ChipOptions = {}): HTMLElement {
  const shown = opts.readout && value !== null ? el("span", { class: "num" }, value) : value;
  return el("span", chipAttrs(opts), opts.icon ? createIcon(opts.icon) : null, shown, ...(opts.extra ?? []));
}

const MONEY_CHARS = 9;
const POWER_CHARS = 20;
const LOAD_GLYPHS = 6;
const COUNT_PAD = 1;

function thousands(n: number): number {
  return Math.round(n).toLocaleString("en-US").length;
}

function loadChars(): number {
  const rated = Math.max(...[...PLAYER_CHASSIS, HAULER_CHASSIS].map((id) => chassisDef(id).ratedMass));
  return 2 * thousands(rated) + LOAD_GLYPHS + COUNT_PAD;
}

function tapeEl(name: Msg, title?: Msg): HTMLElement {
  return el("span", { class: "tape", ...(title ? { title } : {}) }, name);
}

function featureTape(chassisId: string): HTMLElement | null {
  const name = chassisAbilityName(chassisId);
  return name ? tapeEl(name, chassisAbilityLine(chassisId) ?? name) : null;
}

export function truckChips(w: World, opts: { feature?: boolean } = {}, truckId?: string): HTMLElement {
  const me = truckFor(w, truckId);
  const mass = loadMass(me);
  const rated = chassisDef(me.chassisId).ratedMass;
  return el(
    "span",
    { class: "chips" },
    el(
      "span",
      { class: "chip-screen" },
      chipEl(moneyEl(w.player.money), { chars: MONEY_CHARS }),
      chipEl(t("speed.loadChip", { mass: Math.round(mass), rated: Math.round(rated) }), {
        icon: "mass",
        readout: true,
        bad: mass > rated,
        title: t("inv.loadTitle"),
        chars: loadChars(),
      }),
      powerChipNode(w, me),
    ),
    tapeEl(chassisName(chassisDef(me.chassisId).id)),
    opts.feature === false ? null : featureTape(me.chassisId),
  );
}

function powerChipNode(w: World, me: Vehicle): HTMLElement {
  const chip = powerChip(maxSpeedSteps(w, me), me);
  const cost = chip.cost ? [createIcon("speed"), el("span", { class: "num" }, chip.cost)] : [];
  return chipEl(chip.ratio, { icon: "power", readout: !chip.words, bad: chip.over, title: chip.detail, label: chip.detail, extra: cost, chars: POWER_CHARS });
}
