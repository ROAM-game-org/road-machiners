import { devEl, panel } from "../../ui/dom";
import { KNOBS, TUNING, setTuning, tuningOn, type Knob, type TuningKey } from "./inkTuning";

type Group = { title: string; keys: TuningKey[]; gate?: TuningKey };

type Row = { key: TuningKey; node: HTMLElement; control: HTMLInputElement; sync(): void };

export const LOOK_GROUPS: Group[] = [
  { title: "Ground", keys: ["color", "materialContrast", "surround", "farMarks", "heightTint", "edgeSoft", "edgeWobble", "waveSize", "halo", "tufts", "edgeShadow", "edgeShadowWidth"] },
  { title: "Relief", keys: ["relief", "litFace", "cliffStreaks"] },
  { title: "Crest lines", keys: ["crestLine", "crestWidth", "crestFold"] },
  { title: "Shadows", keys: ["shadeCut", "shadeDark", "shadeShift", "castDark", "shadeLine"] },
  { title: "Strokes", keys: ["hatch", "hatchPx"] },
  { title: "Objects", keys: ["objectHatch", "outline"] },
  { title: "Effects", keys: ["fxInk", "smokeLines", "smokeSize"] },
  { title: "Dust", keys: ["dustSize", "dustAmount", "plumeOpacity", "dustEdge", "dustThin", "dustThick", "dustTint", "dustShade", "dustShadeReach", "dustBands", "dustBandStep", "dustBandShade", "dustLines", "dustStreaks", "dustStreakPx", "dustStreakDark"] },
  { title: "Smoke screen", keys: ["bankShade", "bankLines", "bankCool"] },
  { title: "Fire", keys: ["fireEdge", "fireBandStep", "fireLines", "fireLinePx", "fireTongue", "fireTongueSize", "fireTongueSpeed"] },
  { title: "Elevation lines", keys: ["contour", "contourStep", "contourSoft", "contourOpacity", "contourCross"], gate: "contour" },
  { title: "Screen", keys: ["crt"] },
];

export function checkLookGroups(groups: Group[]): void {
  const listed = groups.flatMap((g) => g.keys);
  for (const key of Object.keys(KNOBS) as TuningKey[]) {
    const count = listed.filter((k) => k === key).length;
    if (count !== 1) throw new Error(`Look menu lists knob ${key} ${count} times, expected once`);
  }
}

function isSwitch(knob: Knob): boolean {
  return knob.min === 0 && knob.max === 1 && knob.step === 1;
}

export function valueText(knob: Knob, value: number): string {
  const decimals = String(knob.step).split(".")[1]?.length ?? 0;
  const number = value.toFixed(decimals);
  if (knob.unit === undefined) return number;
  return knob.unit === "°" ? `${number}°` : `${number} ${knob.unit}`;
}

function switchRow(key: TuningKey, changed: () => void): Row {
  const knob = KNOBS[key];
  const control = devEl("input", { type: "checkbox", id: `look-${key}` }) as HTMLInputElement;
  const node = devEl("div", { class: "look-row" }, devEl("label", { for: control.id }, knob.label), control);
  const sync = (): void => {
    control.checked = TUNING[key].value === 1;
    node.classList.toggle("changed", TUNING[key].value !== knob.start);
  };
  control.addEventListener("change", () => {
    setTuning(key, control.checked ? 1 : 0);
    changed();
  });
  return { key, node, control, sync };
}

function sliderRow(key: TuningKey, changed: () => void): Row {
  const knob = KNOBS[key];
  const control = devEl("input", { type: "range", id: `look-${key}`, min: knob.min, max: knob.max, step: knob.step }) as HTMLInputElement;
  const startAt = (knob.start - knob.min) / (knob.max - knob.min);
  const shown = devEl("span", { class: "look-value" });
  const node = devEl(
    "div",
    { class: "look-row" },
    devEl("label", { for: control.id }, knob.label),
    devEl("div", { class: "look-slider" }, control, devEl("span", { class: "look-start", style: `--start-at: ${startAt}` })),
    shown,
  );
  const sync = (): void => {
    control.value = String(TUNING[key].value);
    shown.textContent = valueText(knob, TUNING[key].value);
    node.classList.toggle("changed", TUNING[key].value !== knob.start);
  };
  control.addEventListener("input", () => {
    setTuning(key, Number(control.value));
    changed();
  });
  return { key, node, control, sync };
}

function groupSection(group: Group, rows: Row[], refresh: () => void): HTMLElement {
  const section = devEl("details", { class: "look-group", open: true }, devEl("summary", {}, group.title));
  for (const key of group.keys) {
    const row = isSwitch(KNOBS[key]) ? switchRow(key, refresh) : sliderRow(key, refresh);
    rows.push(row);
    section.append(row.node);
  }
  return section;
}

function refreshRows(rows: Row[]): void {
  for (const row of rows) row.sync();
  for (const group of LOOK_GROUPS) {
    if (group.gate === undefined) continue;
    const off = TUNING[group.gate].value === 0;
    const gated = rows.filter((row) => group.keys.includes(row.key) && row.key !== group.gate);
    for (const row of gated) {
      row.control.disabled = off;
      row.node.setAttribute("aria-disabled", String(off));
    }
  }
}

export function mountLookMenu(host: HTMLElement): { toggle(): boolean } {
  checkLookGroups(LOOK_GROUPS);
  const box = panel("look-menu", host);
  box.hidden = !tuningOn();
  const rows: Row[] = [];
  const refresh = (): void => refreshRows(rows);
  const reset = (): void => {
    for (const key of Object.keys(KNOBS) as TuningKey[]) setTuning(key, KNOBS[key].start);
    refresh();
  };
  const head = devEl(
    "div",
    { class: "look-head" },
    devEl("h3", {}, "Look"),
    devEl("button", { class: "look-reset", onclick: reset }, "Reset"),
    devEl("button", { class: "look-close", onclick: () => (box.hidden = true) }, "Close"),
  );
  const body = devEl("div", { class: "look-body" }, ...LOOK_GROUPS.map((group) => groupSection(group, rows, refresh)));
  box.append(head, body);
  refresh();
  const letKeysThrough = (): void => {
    if (document.activeElement instanceof HTMLElement && box.contains(document.activeElement)) document.activeElement.blur();
  };
  box.addEventListener("click", letKeysThrough);
  box.addEventListener("change", letKeysThrough);
  return {
    toggle() {
      box.hidden = !box.hidden;
      return !box.hidden;
    },
  };
}
