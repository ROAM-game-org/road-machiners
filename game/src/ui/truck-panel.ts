import { chassisDef, type ChassisAbility } from "../data/chassis";
import { partDef } from "../data/parts";
import { chassisAbility } from "../sim/chassis-features";
import { isMounted } from "../sim/grid";
import { loadMass } from "../sim/mass";
import { driveStats, fuelCap, gunDraw, maxSpeedSteps, suppliesCap, workingEngineCapacity } from "../sim/stats";
import type { GridItem, Vehicle, World } from "../sim/types";
import { num, t, type Msg } from "../text/msg";
import { chassisAbilityLine, chassisAbilityName } from "../text/names";
import { gaugeEl, meterRow, statRow, statValueEl, type IconName } from "./cards";
import { el } from "./dom";
import { CRATE_MASS, PARCEL } from "../data/goods";
import { getHudReadout, powerChip, type TipLine } from "./hud-readout";
import { fuelLiters, kph, mps2 } from "./units";

const DEG = Math.PI / 180;

function massOf(item: GridItem): number {
  if (item.kind === "part") return partDef(item.part.defId).mass;
  return item.kind === "parcel" ? PARCEL.mass : CRATE_MASS;
}

function drawOf(item: GridItem | null): number | null {
  if (item?.kind !== "part") return null;
  const def = partDef(item.part.defId);
  return def.kind === "weapon" ? def.draw : null;
}

function loadRow(me: Vehicle, picked: GridItem | null): HTMLElement {
  const mass = loadMass(me);
  const rated = chassisDef(me.chassisId).ratedMass;
  const part = picked && me.items.some((it) => it.id === picked.id) ? massOf(picked) : null;
  const share = part === null ? null : { left: (mass - part) / rated, width: part / rated };
  const value = statValueEl(t("speed.loadChip", { mass: Math.round(mass), rated: Math.round(rated) }), mass > rated ? "bad" : "");
  return meterRow(statRow("mass", t("inv.load"), value, t("inv.loadTitle")), gaugeEl(mass / rated, { share }));
}

function isOnTruck(me: Vehicle, picked: GridItem | null): boolean {
  return picked?.kind === "part" && me.items.some((it) => it.id === picked.id) && isMounted(me.chassisId, picked);
}

function powerGauge(draw: number, full: number, gun: number | null, mounted: boolean): HTMLElement {
  if (full <= 0) return gaugeEl(0);
  if (gun === null) return gaugeEl(draw / full);
  return gaugeEl(draw / full, mounted ? { share: { left: (draw - gun) / full, width: gun / full } } : { after: { left: draw / full, width: gun / full } });
}

function powerRow(w: World, me: Vehicle, picked: GridItem | null): HTMLElement {
  const chip = powerChip(maxSpeedSteps(w, me), me);
  const capacity = workingEngineCapacity(me) ?? 0;
  const draw = gunDraw(me);
  const gun = drawOf(picked);
  const mounted = isOnTruck(me, picked);
  const adds = gun !== null && !mounted;
  const text = adds ? t("inv.powerAfter", { draw, gun, capacity }) : chip.ratio;
  return meterRow(statRow("power", t("icon.power"), statValueEl(text, chip.over ? "bad" : ""), chip.detail), powerGauge(draw, capacity, gun, mounted));
}

export function budgetGroup(w: World, me: Vehicle, picked: GridItem | null): HTMLElement {
  return el("div", { class: "well-group" }, loadRow(me, picked), powerRow(w, me, picked));
}

const TIP_TONE: Record<TipLine["tone"], string> = { base: "base", bad: "down", good: "up", plain: "" };

function speedValue(w: World, me: Vehicle): HTMLElement {
  const steps = maxSpeedSteps(w, me);
  const lines = getHudReadout(w).maxSpeedTip;
  return el(
    "span",
    { class: "stat-val has-cause", tabindex: 0 },
    t("speed.kph", { n: kph(steps[steps.length - 1].speed) }),
    el("div", { class: "tooltip cause-tip", role: "tooltip" }, ...lines.map((line) => el("div", { class: `tooltip-row ${TIP_TONE[line.tone]}`.trim() }, el("span", {}, line.label), el("span", { class: "num" }, line.value)))),
  );
}

function driveGroup(w: World, me: Vehicle): HTMLElement {
  const drive = driveStats(w, me);
  return el(
    "div",
    { class: "well-group" },
    statRow("speed", t("inv.topSpeed"), speedValue(w, me)),
    statRow("accel", t("stat.accel"), statValueEl(t("stat.value", { text: num(mps2(drive.accel), "dec1"), unit: t("unit.mps2") }))),
    statRow("turning", t("stat.turning"), statValueEl(t("stat.valueTight", { text: t("stat.span", { a: Math.round(drive.turnSlow / DEG), b: Math.round(drive.turnFast / DEG) }), unit: t("unit.deg") }))),
  );
}

function storesGroup(w: World, me: Vehicle): HTMLElement {
  return el(
    "div",
    { class: "well-group" },
    statRow("fuel", t("readout.fuel"), statValueEl(t("inv.fuelValue", { n: Math.round(fuelLiters(w.player.fuel)), cap: Math.round(fuelLiters(fuelCap(me))) }))),
    statRow("supplies", t("readout.supplies"), statValueEl(t("inv.suppliesValue", { n: Math.round(w.player.supplies), cap: Math.round(suppliesCap(me)) }))),
  );
}

type AbilityRow = { icon: IconName; label: Msg; value: Msg };

const percentUp = (factor = 1): Msg => t("chassis.row.percentUp", { n: Math.round((factor - 1) * 100) });
const plain = (n = 0): Msg => t("chassis.row.plus", { n });
const row = (icon: IconName, label: Msg, value: Msg): AbilityRow => ({ icon, label, value });

const ABILITY_ROWS: Record<ChassisAbility["id"], (a: ChassisAbility) => AbilityRow[]> = {
  bed: (a) => [row("rows", t("chassis.row.bedRows"), num(a.bedRows ?? 0, "int"))],
  nimble: (a) => [row("accel", t("stat.accel"), percentUp(a.accel)), row("spread", t("chassis.row.scatterOnIt"), t("chassis.row.degUp", { n: Number((((a.nimble ?? 0) * 180) / Math.PI).toFixed(1)) }))],
  racing: (a) => [row("speed", t("inv.topSpeed"), percentUp(a.topSpeed))],
  offRoad: (a) => [row("wheel", t("chassis.row.offRoadLoss"), t("chassis.row.none")), row("parts", t("chassis.row.roughWear"), t("chassis.row.percentDown", { n: 100 - Math.round((a.offRoadWear ?? 1) * 100) }))],
  armored: (a) => [row("armor", t("chassis.row.partArmor"), plain(a.partArmor))],
  gunMounts: (a) => [row("power", t("chassis.row.gunPower"), percentUp(a.gunPower))],
  battle: (a) => [row("armor", t("chassis.row.partArmor"), plain(a.partArmor)), row("power", t("chassis.row.gunPower"), percentUp(a.gunPower))],
  springs: (a) => [row("mass", t("chassis.row.mountedMass"), t("chassis.row.percent", { n: Math.round((a.mountedMass ?? 1) * 100) }))],
  openTop: (a) => [row("scanner", t("chassis.row.sight"), percentUp(a.sight)), row("range", t("chassis.row.gunRange"), percentUp(a.range))],
  tourer: (a) => [row("speed", t("inv.topSpeed"), percentUp(a.topSpeed)), row("scanner", t("chassis.row.sight"), percentUp(a.sight)), row("range", t("chassis.row.gunRange"), percentUp(a.range))],
  trailer: (a) => [
    row("arc", t("chassis.row.gunArc"), t("chassis.row.degUp", { n: a.arc ?? 0 })),
    row("reload", t("chassis.row.gunReload"), t("chassis.row.turnsDown", { n: a.reloadCut ?? 0 })),
    row("rows", t("chassis.row.cargoRows"), percentUp(a.cargoRows)),
    row("armor", t("chassis.row.deckArmor"), plain(a.deckArmor)),
  ],
};

export function abilityRows(chassisId: string): AbilityRow[] {
  const ability = chassisAbility(chassisId);
  return ability ? ABILITY_ROWS[ability.id](ability) : [];
}

function abilityGroup(chassisId: string): HTMLElement | null {
  const name = chassisAbilityName(chassisId);
  if (!name) return null;
  return el(
    "div",
    { class: "well-group", title: chassisAbilityLine(chassisId) ?? undefined },
    el("b", { class: "ability-name" }, name),
    ...abilityRows(chassisId).map((r) => statRow(r.icon, r.label, statValueEl(r.value))),
  );
}

export function truckGroups(w: World, me: Vehicle): (HTMLElement | null)[] {
  return [driveGroup(w, me), storesGroup(w, me), abilityGroup(me.chassisId)];
}
