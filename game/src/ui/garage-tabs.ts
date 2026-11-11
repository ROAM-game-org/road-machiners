import type { TruckPaint } from "../data/chassis";
import { partDef, type PartKind } from "../data/parts";
import { playerVehicle } from "../sim/damage";
import { mountCellsOf } from "../sim/grid";
import { spareParts } from "../sim/inventory";
import type { PartInstance, Vehicle, World } from "../sim/types";
import { num, t, type Msg } from "../text/msg";
import { compareBase, createIcon, type IconName } from "./cards";
import { el } from "./dom";
import { GOODS_COLUMNS } from "./format";
import type { InventoryView } from "./inventory";
import type { PartRow, PartRows } from "./part-rows";
import type { RowSlots } from "./row-slots";
import { caption, lotLabel, livePaintPlan, paintTab, planWithSlot, reasonButton, sellButton } from "./shop-rows";

export type GarageTab = "buyParts" | "sellParts" | "trucks" | "paint";

export const GARAGE_TABS: GarageTab[] = ["buyParts", "sellParts", "trucks", "paint"];

export type StockFilter = "all" | Exclude<PartKind, "core" | "accessory">;

export function kindFilter(kind: PartKind): Exclude<StockFilter, "all"> {
  if (kind === "core") throw new Error("Built-in parts are never in stock");
  return kind === "accessory" ? "armor" : kind;
}

export const STOCK_FILTERS: StockFilter[] = ["all", "weapon", "engine", "armor", "cargo", "scanner", "store", "utility"];

export const FILTER_ICON: Record<Exclude<StockFilter, "all">, IconName> = {
  engine: "engine",
  armor: "armor",
  cargo: "cargo",
  scanner: "scanner",
  store: "store",
  utility: "utility",
  weapon: "gun",
};

export const filterIcon = (f: Exclude<StockFilter, "all">): HTMLElement => createIcon(FILTER_ICON[f]);

export function stockCount(stock: PartInstance[], f: StockFilter): number {
  return filteredStock(stock, f).length;
}

export function filteredStock(stock: PartInstance[], f: StockFilter): PartInstance[] {
  return f === "all" ? stock : stock.filter((p) => kindFilter(partDef(p.defId).kind) === f);
}

export function stockFilterChips(stock: PartInstance[], current: StockFilter, pick: (f: StockFilter) => void): HTMLElement {
  return el("div", { class: "tabs sub" }, ...STOCK_FILTERS.map((f) => stockFilterChip(f, stockCount(stock, f), current === f, pick)));
}

function stockFilterChip(f: StockFilter, count: number, on: boolean, pick: (f: StockFilter) => void): HTMLElement {
  const empty = count === 0 && f !== "all";
  return el(
    "button",
    {
      class: on ? "on" : "",
      title: empty ? t("trade.filterEmpty", { kind: t(`trade.filter.${f}`) }) : t(`trade.filter.${f}`),
      "aria-disabled": empty ? "true" : undefined,
      onclick: () => {
        if (!empty) pick(f);
      },
    },
    f === "all" ? t("trade.filter.all") : filterIcon(f),
    el("span", { class: "count" }, num(count, "int")),
  );
}

export type GarageList = { rows: PartRows; slots: RowSlots; inventory: InventoryView };

export function partList(list: GarageList, key: string, rows: PartRow[], empty: Msg): HTMLElement {
  return rows.length || list.slots.has(key) ? list.rows.list(key, rows) : el("div", { class: "dim" }, empty);
}

export function garagePartRow(w: World, list: GarageList, p: PartInstance, action: HTMLElement, done: Msg): PartRow {
  return {
    world: w,
    part: p,
    base: compareBase(list.inventory.selectedPart(), p),
    action,
    done,
    onHover: (on) => list.inventory.hintMounts(on ? mountCellsOf(p.defId) : null),
  };
}

export function sellableParts(w: World, truck: Vehicle): PartInstance[] {
  return [...w.player.storage, ...spareParts(truck)];
}

export type SellPartsBody = {
  w: World;
  truck: Vehicle;
  list: GarageList;
  price: (p: PartInstance) => number;
  sell: (p: PartInstance) => void;
};

export function sellPartsBody(body: SellPartsBody): HTMLElement {
  const rows = sellableParts(body.w, body.truck).map((p) =>
    garagePartRow(body.w, body.list, p, sellButton(t("goods.sell"), body.price(p), () => body.sell(p)), t("trade.done.sold")),
  );
  return el("div", {}, partList(body.list, "sell", rows, t("trade.noSpares")));
}

export type PaintBody = {
  w: World;
  plan: TruckPaint | null;
  setPlan: (plan: TruckPaint | null) => void;
  buy: (plan: TruckPaint | null) => HTMLElement | null;
};

export function paintBody(body: PaintBody): HTMLElement {
  const current = body.w.player.paint;
  const plan = livePaintPlan(current, body.plan);
  return paintTab({
    current,
    plan,
    chassisId: playerVehicle(body.w).chassisId,
    pick: (slot, id) => body.setPlan(planWithSlot(current, body.plan, slot, id)),
    pickScheme: (scheme) => body.setPlan({ ...scheme }),
    buy: body.buy(plan),
  });
}

export type GoodSell = {
  good: string;
  one: number;
  all: number | null;
  reason: Msg | null;
  sellOne: () => void;
  sellAll: () => void;
};

export function goodSellCell(sell: GoodSell): HTMLElement {
  return el(
    "div",
    { class: "trade sell" },
    caption(GOODS_COLUMNS.sell),
    reasonButton([lotLabel(t("trade.minus", { n: 1 }), sell.one)], sell.sellOne, sell.reason, `${sell.good}:sell1`),
    reasonButton([lotLabel(t("trade.all"), sell.all)], sell.sellAll, sell.reason, `${sell.good}:sellAll`),
  );
}
