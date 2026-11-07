import { PARCEL } from "../data/goods";
import type { Threat } from "../data/market";
import { isLate, type Contract } from "../sim/market";
import { surveyThreat } from "../sim/survey";
import { vehicleStats } from "../sim/stats";
import type { World } from "../sim/types";
import { PLUS, SPACE, t, type Msg, type PlainKey } from "../text/msg";
import { createBareItemIcon, createIcon } from "./cards";
import { el, type Child } from "./dom";
import { claimRivalMark, contractSummary, contractWindow, dockSummary, escortLeaves, escortLeavesIn, escortStatusText, heldContractClock, heldContractDeadline, rescueWhere, surveyClueTip, surveyOpenSquares, surveyProgress, vehicleName } from "./format";
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

const THREAT_TONE: Record<Threat, string> = { 1: "dim", 2: "", 3: "bad" };

const ROAD_WORDS: Record<Threat, PlainKey> = { 1: "contract.road.safe", 2: "contract.road.risky", 3: "contract.road.dangerous" };

const GROUND_WORDS: Record<Threat, PlainKey> = { 1: "contract.ground.safe", 2: "contract.ground.risky", 3: "contract.ground.dangerous" };

function threatTag(threat: number, words: Record<Threat, PlainKey>): HTMLElement {
  if (threat !== 1 && threat !== 2 && threat !== 3) throw new Error(`threat ${threat} is not 1, 2 or 3`);
  return el("span", { class: ["tag", THREAT_TONE[threat]].join(" ").trim() }, t(words[threat]));
}

function escortDetail(w: World, c: Extract<Contract, { kind: "escort" }>): Child[] {
  const trader = w.vehicles.find((v) => v.id === c.client);
  if (!trader) return [];
  return [el("span", { class: "dim" }, t("contract.trader", { who: vehicleName(w, c.client), n: kph(vehicleStats(w, trader).maxSpeed) })), threatTag(c.threat, ROAD_WORDS)];
}

function escortClock(w: World, c: Extract<Contract, { kind: "escort" }>, posted: boolean): HTMLElement {
  if (posted) return el("span", { class: "price", title: escortLeaves(c) }, createIcon("clock"), escortLeavesIn(w, c));
  const status = escortStatusText(w, c);
  return status ? el("span", { class: "price dim", title: t("contract.noDeadline") }, createIcon("clock"), status) : el("span", {});
}

export function heldContractRow(w: World, c: Contract): HTMLElement {
  const title = el("span", {}, titleEl(c, dockSummary(c)), ...(c.kind === "survey" ? [SPACE, threatTag(surveyThreat(w, c), GROUND_WORDS)] : []), claimRivalMark(w, c));
  return el("div", { class: "job held" }, CONTRACT_ICON[c.kind](), el("div", { class: "job-what" }, title), el("div", { class: "job-meta" }, heldClock(w, c), payEl(w, c)));
}

function payEl(w: World, c: Contract): HTMLElement {
  return isLate(w, c) ? el("span", { class: "price bad" }, t("contract.late")) : el("span", { class: "price good" }, PLUS, moneyEl(c.reward));
}

function heldClock(w: World, c: Contract): HTMLElement {
  if (c.kind === "escort") return escortClock(w, c, false);
  return el("span", { class: "price", title: heldContractDeadline(w, c) ?? undefined }, createIcon("clock"), heldContractClock(w, c));
}

function postedClock(w: World, c: Contract): HTMLElement {
  if (c.kind === "escort") return escortClock(w, c, true);
  return el("span", { class: "price", title: t("contract.windowTitle", { n: c.window }) }, createIcon("clock"), contractWindow(c));
}

function offerCaption(w: World, c: Contract): HTMLElement | null {
  if (c.kind === "escort") return el("div", { class: "job-caption" }, ...escortDetail(w, c));
  if (c.kind === "survey") return el("div", { class: "job-caption", title: surveyClueTip(c) }, threatTag(surveyThreat(w, c), GROUND_WORDS), SPACE, el("span", { class: "dim" }, surveyOpenSquares(c)));
  if (c.kind === "rescue") return c.fulfilled ? null : el("div", { class: "job-caption dim" }, rescueWhere(c));
  return claimRivalMark(w, c);
}

function titleEl(c: Contract, summary: Msg, title?: Msg, tagged = true): HTMLElement {
  if (c.kind !== "rescue" || !tagged) return el("span", { class: "job-title", title }, summary);
  return el("span", { class: "job-title", title }, el("span", { class: "tag", title: t("contract.rescueAlt") }, t(`contract.need.${c.need}`)), SPACE, summary);
}

export function offerRow(w: World, c: Contract, accept: HTMLElement, need: HTMLElement | null): HTMLElement {
  return el("div", { class: "job offer" }, CONTRACT_ICON[c.kind](), el("div", { class: "job-what" }, titleEl(c, contractSummary(c), undefined, false), offerCaption(w, c)), el("div", { class: "job-meta" }, ...(need ? [need] : []), postedClock(w, c), payEl(w, c)), accept);
}

export function boardHeldRow(w: World, c: Contract, action: HTMLElement): HTMLElement {
  const title = titleEl(c, dockSummary(c), c.kind === "survey" ? surveyClueTip(c) : undefined);
  const progress = c.kind === "survey" ? el("div", { class: "job-caption dim" }, surveyProgress(c)) : claimRivalMark(w, c);
  return el("div", { class: "job held" }, CONTRACT_ICON[c.kind](), el("div", { class: "job-what" }, title, progress), el("div", { class: "job-meta" }, heldClock(w, c), payEl(w, c)), action);
}
