
import { PARTS, type PartDef } from "../data/parts";
import { say } from "../text/language";
import { ESCAPE, keyTip } from "./input-mode";
import { t } from "../text/msg";
import { CheatError, give } from "../sim/cheats";
import { chargeFor, gunFor } from "../sim/factory";
import { mountCellsOf } from "../sim/grid";
import type { PartInstance, World } from "../sim/types";
import { maxHp } from "../sim/wear";
import { compareBase, partCard } from "./cards";
import { devEl as el, panel } from "./dom";
import type { UiHost } from "./host";
import { InventoryView } from "./inventory";
import { truckChips } from "./chip";
import { filterIcon, kindFilter, STOCK_FILTERS, type StockFilter } from "./garage-tabs";

const KIND_ORDER = STOCK_FILTERS.filter((f): f is Exclude<StockFilter, "all"> => f !== "all");

function shopParts(): PartDef[] {
  const rank = (d: PartDef) => KIND_ORDER.indexOf(kindFilter(d.kind));
  return Object.values(PARTS)
    .filter((d) => d.kind !== "core" && d.kind !== "relic")
    .sort((a, b) => rank(a) - rank(b) || a.tier - b.tier || a.id.localeCompare(b.id));
}

function sample(defId: string): PartInstance {
  const part: PartInstance = { id: `fullshop-${defId}`, defId, hp: 0, wear: 0, ...gunFor(defId), ...chargeFor(defId) };
  return { ...part, hp: maxHp(part) };
}

export class FullShopScreen {
  readonly root = panel("modal dialog");
  private filter: StockFilter = "all";
  private error = "";
  private readonly inventory: InventoryView;
  private readonly parts = shopParts();

  constructor(private host: UiHost) {
    this.root.classList.add("town-screen");
    this.root.style.display = "none";
    window.addEventListener("resize", () => this.render());
    this.inventory = new InventoryView(host, () => this.render(), true, true);
  }

  isOpen(): boolean {
    return this.root.style.display !== "none";
  }

  open(): void {
    this.root.style.display = "";
    this.error = "";
    this.render();
  }

  close(): void {
    this.inventory.clearSelection();
    this.root.style.display = "none";
    this.root.replaceChildren();
  }

  render(): void {
    if (!this.isOpen()) return;
    const w = this.host.world();
    const truckBody = el("div", { class: "truck-body" }, this.inventory.render());
    const truck = el("div", { class: "town-truck" }, el("div", { class: "town-band" }, this.inventory.keysEl), truckBody);
    const shop = el(
      "div",
      { class: "town-shop" },
      el("div", { class: "town-band" }, el("div", { class: "tabs sub" }, ...this.filterButtons())),
      el("div", { class: "shop-body screen-block" }, el("div", { class: "cards" }, ...this.cards(w))),
    );
    this.root.replaceChildren(
      el("button", { class: "close", title: say(keyTip(t("trade.leave"), ESCAPE.key)), onclick: () => this.close() }, say(t("trade.leave"))),
      el("h3", {}, say(t("fullShop.title")), truckChips(w)),
      el("div", { class: "town-split banded" }, truck, shop),
      el("div", { class: "outpost-foot" }, el("div", { class: "bad" }, this.error)),
    );
    this.inventory.fitTo(truckBody);
  }

  private cards(w: World): HTMLElement[] {
    const shown = this.parts.filter((d) => this.filter === "all" || kindFilter(d.kind) === this.filter);
    return shown.map((d) => {
      const part = sample(d.id);
      return partCard({
        world: w,
        part,
        base: compareBase(this.inventory.selectedPart(), part),
        action: el("button", { class: "screen-btn", onclick: () => this.take(w, d.id) }, say(t("fullShop.take"))),
        onHover: this.hintMounts(d.id),
      });
    });
  }

  private take(w: World, defId: string): void {
    try {
      this.host.apply(give(w, defId, 1));
      this.error = "";
    } catch (err) {
      if (!(err instanceof CheatError)) throw err;
      this.error = err.message;
    }
    this.render();
  }

  private hintMounts(defId: string): (on: boolean) => void {
    return (on) => this.inventory.hintMounts(on ? mountCellsOf(defId) : null);
  }

  private filterButtons(): HTMLElement[] {
    return STOCK_FILTERS.map((f) =>
      el(
        "button",
        {
          class: this.filter === f ? "on" : "",
          title: say(t(`trade.filter.${f}`)),
          onclick: () => {
            this.filter = f;
            this.render();
          },
        },
        f === "all" ? say(t("trade.filter.all")) : filterIcon(f),
      ),
    );
  }
}
