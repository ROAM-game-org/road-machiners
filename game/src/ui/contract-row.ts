import { PARCEL } from "../data/goods";
import { isLate, isMet, type Contract } from "../sim/market";
import { vehicleStats } from "../sim/stats";
import type { World } from "../sim/types";
import { PLUS, SPACE, t } from "../text/msg";
import { createBareItemIcon, createIcon } from "./cards";
import { el, type Child } from "./dom";
import { claimRivalMark, contractSummary, contractWindow, escortLeaves, escortStatusText, heldContractClock, heldContractDue, rescueWhere, surveyClueLines, surveyWayLines, vehicleName } from "./format";
import { kph, moneyEl } from "./units";

const CONTRACT_ICON: Record<Contract["kind"], () => HTMLElement> = {
  haul: () => createIcon("cargo"),
  procure: () => createIcon("cargo"),
  claim: () => createIcon("parts"),
  search: () => createBareItemIcon(PARCEL.id),
  survey: () => createIcon("scanner"),
  escort: () => createIcon("truck"),
  rescue: () => createIcon("truck"),
};

export function contractIcon(kind: Contract["kind"]): HTMLElement {
  return CONTRACT_ICON[kind]();
}

function threatPips(threat: number): HTMLElement {
  return el("div", { class: "skill-level threat", title: t("contract.threat", { n: threat }) }, ...Array.from({ length: 3 }, (_, i) => el("i", { class: i < threat ? "on" : "" })));
}

function escortDetail(w: World, c: Extract<Contract, { kind: "escort" }>): Child[] {
  const trader = w.vehicles.find((v) => v.id === c.client);
  if (!trader) return [];
  return [el("span", {}, t("contract.trader", { who: vehicleName(w, c.client), n: kph(vehicleStats(w, trader).maxSpeed) })), threatPips(c.threat)];
}

function surveyLine(w: World, c: Contract, posted: boolean): HTMLElement | null {
  if (c.kind !== "survey") return null;
  return el("span", { class: "dim" }, ...(posted ? surveyClueLines(c) : surveyWayLines(w, c)));
}

function escortClock(w: World, c: Extract<Contract, { kind: "escort" }>, posted: boolean): HTMLElement {
  if (posted) return el("span", { class: "price", title: t("contract.leavesTitle", { n: Math.max(0, c.deadline - w.turn) }) }, createIcon("clock"), escortLeaves(c));
  const status = escortStatusText(w, c);
  return status ? el("span", { class: "price dim", title: heldContractDue(c) }, createIcon("clock"), status) : el("span", {});
}

export function contractRow(w: World, c: Contract, action: HTMLElement, posted = false): HTMLElement {
  return jobRow(w, c, { action, posted, clue: true });
}

export function heldContractRow(w: World, c: Contract): HTMLElement {
  return jobRow(w, c, { action: null, posted: false, clue: false });
}

type RowShape = { action: HTMLElement | null; posted: boolean; clue: boolean };

function jobRow(w: World, c: Contract, { action, posted, clue }: RowShape): HTMLElement {
  const met = isMet(c);
  const clock = c.kind === "escort" ? escortClock(w, c, posted) : posted
    ? el("span", { class: "price", title: t("contract.windowTitle", { n: c.window }) }, createIcon("clock"), contractWindow(c))
    : el("span", { class: "price", title: met ? undefined : t("contract.dueTitle", { n: c.deadline - w.turn }) }, createIcon("clock"), heldContractClock(w, c));
  return el(
    "div",
    { class: "job" },
    CONTRACT_ICON[c.kind](),
    c.kind === "escort" && posted
      ? el("div", { class: "job-what" }, el("span", {}, contractSummary(c)), el("div", { class: "job-detail dim" }, ...escortDetail(w, c)))
      : contractSummaryCell(w, c, clue, posted),
    isLate(w, c) ? el("span", { class: "price bad" }, t("contract.late")) : el("span", { class: "price good" }, PLUS, moneyEl(c.reward)),
    clock,
    action,
  );
}

function contractSummaryCell(w: World, c: Contract, clue: boolean, posted: boolean): HTMLElement {
  if (c.kind !== "rescue") return el("span", {}, contractSummary(c), clue ? surveyLine(w, c, posted) : null, claimRivalMark(w, c));
  const need = el("span", { class: "tag", title: t("contract.rescueAlt") }, t(`contract.need.${c.need}`));
  return el("span", {}, need, SPACE, contractSummary(c), c.fulfilled ? null : el("div", { class: "dim" }, rescueWhere(c)));
}
