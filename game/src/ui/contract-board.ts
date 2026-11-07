import { CONTRACTS } from "../data/market";
import { playerVehicle } from "../sim/damage";
import { escortBlocked, escortFit } from "../sim/escort-job";
import { freeCells } from "../sim/grid";
import { goodStock, haulShort, searchRefusal, shopState, spareGoods, type Contract, type SearchRefusal } from "../sim/market";
import type { World } from "../sim/types";
import { refusalText } from "../text/names";
import { t, type Msg } from "../text/msg";
import { createIcon } from "./cards";
import { el } from "./dom";

export function haulRefusal(w: World, c: Contract): Msg | null {
  if (c.kind !== "haul") return null;
  if (w.player.money < 0) return t("contract.inDebt");
  const free = freeCells(playerVehicle(w));
  if (free < c.units) return t("contract.cellsShort", { n: c.units, free });
  if (haulShort(w, c)) return t("contract.noStock", { n: goodStock(shopState(w, c.shop), c.good) });
  return null;
}

export function escortRefusal(w: World, c: Contract): Msg | null {
  if (c.kind !== "escort") return null;
  const blocked = escortBlocked(w, c);
  if (blocked === "escorting") return t("contract.alreadyEscorting");
  if (blocked !== "weak") return null;
  const fit = escortFit(w, c);
  return t("contract.needsStronger", { win: Math.round(fit.win * 100), need: Math.round(fit.need * 100) });
}

export function searchRefusalText(w: World, refusal: SearchRefusal | null): Msg | null {
  if (refusal === null) return null;
  return refusal === "oneSearch" ? t("contract.oneSearch") : refusalText(w, { id: refusal });
}

export function boardFull(w: World): boolean {
  return w.player.contracts.length >= CONTRACTS.maxActive;
}

export function fullBoardReason(): Msg {
  return t("contract.full", { n: CONTRACTS.maxActive });
}

export function ownRefusal(w: World, c: Contract): Msg | null {
  return haulRefusal(w, c) ?? escortRefusal(w, c) ?? searchRefusalText(w, searchRefusal(w, c));
}

export function acceptRefusal(w: World, c: Contract, full: boolean): Msg | null {
  if (full) return fullBoardReason();
  return ownRefusal(w, c);
}

function needEl(icon: "cells" | "cargo" | "star", tone: "bad" | "", text: Msg, reason: Msg | null): HTMLElement {
  return el("span", { class: `need price ${tone}`.trim(), title: reason ?? undefined }, createIcon(icon), text);
}

export function needCell(w: World, c: Contract): HTMLElement | null {
  const me = playerVehicle(w);
  if (c.kind === "haul") {
    const free = freeCells(me);
    return needEl("cells", free < c.units ? "bad" : "", t("contract.needCells", { n: c.units }), haulRefusal(w, c));
  }
  if (c.kind === "search") {
    const refusal = searchRefusal(w, c);
    return needEl("cells", refusal === "noCargoRoom" ? "bad" : "", t("contract.needCells", { n: 1 }), searchRefusalText(w, refusal));
  }
  if (c.kind === "procure") {
    const spare = spareGoods(w, me, c.good);
    return needEl("cargo", spare < c.units ? "bad" : "", t("contract.needSpare", { n: c.units, spare }), null);
  }
  if (c.kind === "escort") {
    const fit = escortFit(w, c);
    return needEl("star", fit.fit ? "" : "bad", t("contract.needWin", { win: Math.round(fit.win * 100), need: Math.round(fit.need * 100) }), escortRefusal(w, c));
  }
  if (c.kind === "rescue") return el("span", { class: "tag", title: t("contract.rescueAlt") }, t(`contract.need.${c.need}`));
  return null;
}
