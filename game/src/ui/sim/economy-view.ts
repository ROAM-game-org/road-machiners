import type { EconGood, EconNews, Economy, EconShop } from "../../sim/progression/sim-economy";
import type { Sample } from "../../sim/progression/sim-mode";
import { devEl as el } from "../dom";
import { moneyAmount } from "../units";
import { lineAlertsOf, MarketHistory, needsOf, type LineAlert, type Need } from "./economy-reads";
import { goodTokens, levelOf, type Focus } from "./economy-draw";
import { goodLink, goodPage, levelTone, stockSpark, priceSpark, toneClass, townLink, townPage, tradeRows, type Ctx, type Nav, type Tone } from "./economy-pages";

type Page = { kind: "all" } | { kind: "town"; id: string } | { kind: "good"; id: string };
type Lens = "stock" | "price";

const LENSES: { lens: Lens; label: string }[] = [{ lens: "stock", label: "Stock" }, { lens: "price", label: "Price" }];
const PRICE_GAP = { dear: 1.25, cheap: 0.8 };
const ALL: Page = { kind: "all" };
const LEVEL_TONE = { empty: "bad", short: "warn", ok: "" } as const;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function samePage(a: Page, b: Page): boolean {
  return a.kind === b.kind && (a.kind === "all" || a.id === (b as { id: string }).id);
}

function newsLine(ctx: Ctx, n: EconNews): HTMLElement {
  const when = n.hoursAgo < 1 ? "Now" : `${n.hoursAgo} h ago`;
  return el("li", { onclick: () => ctx.nav.good(n.good) }, el("span", { class: "sim-when num" }, when), el("span", {}, `${n.kindText}: ${n.units} ${n.goodName}, ${n.from} to ${n.to}`));
}

function needRow(ctx: Ctx, need: Need): HTMLElement {
  const status = need.empty ? `Empty ${need.hours} h` : `Short ${need.hours} h`;
  return el("div", { class: "sim-need" },
    goodLink(ctx, need.good.good, need.good.name),
    townLink(ctx, need.shop),
    el("span", { class: toneClass("num", need.empty ? "bad" : "warn") }, status),
    stockSpark(ctx, need.shop, need.good, "row"),
    el("span", { class: "sim-why dim" }, need.why));
}

function lineAlertRow(ctx: Ctx, alert: LineAlert): HTMLElement {
  return el("div", { class: "sim-need line" },
    townLink(ctx, alert.shop),
    el("span", { class: "tag bad" }, alert.line.runText),
    el("span", { class: "sim-why dim" }, alert.why));
}

function summaryOf(needs: Need[], alerts: LineAlert[]): HTMLElement {
  const empty = needs.filter((n) => n.empty).length;
  const parts = [
    empty > 0 ? el("span", { class: "bad" }, `${empty} empty`) : null,
    needs.length - empty > 0 ? el("span", { class: "warn" }, `${needs.length - empty} short`) : null,
    alerts.length > 0 ? el("span", { class: "warn" }, `${alerts.length} ${alerts.length === 1 ? "line" : "lines"} off`) : null,
  ].filter((p) => p !== null);
  return el("div", { class: "sim-summary" }, ...(parts.length > 0 ? parts : [el("span", { class: "good" }, "Nothing short")]));
}

export class EconomyView {
  readonly root = el("div", { class: "sim-economy panel" });
  readonly history = new MarketHistory();
  private economy: Economy | null = null;
  private page: Page = ALL;
  private previous: Page = ALL;
  private lens: Lens = "stock";

  constructor(private readonly picked: () => void, private readonly openTruck: (id: string) => void) {
    this.root.append(el("div", { class: "dim" }, "Waiting for the economy"));
  }

  get shown(): Economy | null {
    return this.economy;
  }

  get focus(): Focus {
    return { town: this.page.kind === "town" ? this.page.id : null, good: this.page.kind === "good" ? this.page.id : null };
  }

  show(economy: Economy): void {
    this.economy = economy;
    this.render(true);
  }

  resetHistory(samples: Sample[]): void {
    this.history.reset(samples);
  }

  go(page: Page): void {
    if (samePage(page, this.page)) return;
    this.previous = this.page;
    this.page = page;
    this.render(false);
    this.picked();
  }

  selectTown(id: string | null): void {
    this.go(id === null ? ALL : { kind: "town", id });
  }

  private context(economy: Economy): Ctx {
    const nav: Nav = { town: (id) => this.go({ kind: "town", id }), good: (id) => this.go({ kind: "good", id }), truck: this.openTruck };
    return { economy, history: this.history, colors: goodTokens(economy), nav };
  }

  private back(economy: Economy): { label: string; go: () => void } {
    const before = this.previous;
    const label = before.kind === "all" ? "All towns" : this.nameOf(economy, before);
    return { label, go: () => this.go(before) };
  }

  private nameOf(economy: Economy, page: Page): string {
    if (page.kind === "town") return economy.shops.find((s) => s.id === page.id)!.name;
    return page.kind === "good" ? economy.shops.flatMap((s) => s.goods).find((g) => g.good === page.id)!.name : "All towns";
  }

  private render(keepScroll: boolean): void {
    const economy = this.economy;
    if (!economy) return;
    const scroll = keepScroll ? this.root.scrollTop : 0;
    this.root.replaceChildren(this.body(economy));
    this.root.scrollTop = scroll;
  }

  private body(economy: Economy): HTMLElement {
    const ctx = this.context(economy);
    const page = this.page;
    if (page.kind === "town") return townPage(ctx, economy.shops.find((s) => s.id === page.id)!, this.back(economy));
    if (page.kind === "good") return goodPage(ctx, page.id, this.back(economy));
    return this.overview(ctx);
  }

  private overview(ctx: Ctx): HTMLElement {
    const needs = needsOf(ctx.economy, this.history);
    const alerts = lineAlertsOf(ctx.economy);
    return el("div", { class: "sim-econ-body" },
      summaryOf(needs, alerts),
      needs.length + alerts.length > 0 ? el("div", { class: "sim-econ-group" }, ...needs.map((n) => needRow(ctx, n)), ...alerts.map((a) => lineAlertRow(ctx, a))) : null,
      this.grid(ctx),
      el("span", { class: "sim-label" }, "Best trades"),
      tradeRows(ctx, ctx.economy.trades),
      this.news(ctx));
  }

  private grid(ctx: Ctx): HTMLElement {
    const goods = new Map<string, string>();
    for (const shop of ctx.economy.shops) for (const g of shop.goods) goods.set(g.good, g.name);
    const rows = [...goods].sort((a, b) => a[1].localeCompare(b[1]));
    const head = el("tr", {}, el("th", {}, this.lensSwitch()), ...ctx.economy.shops.map((s) => el("th", { class: toneClass("sim-town", LEVEL_TONE[levelOf(s, null)]) }, townLink(ctx, s))));
    const body = rows.map(([id, name]) => el("tr", {}, el("th", { class: "sim-good-head" }, goodLink(ctx, id, name)), ...ctx.economy.shops.map((s) => this.cell(ctx, s, id))));
    return el("div", { class: "sim-econ-scroll" }, el("table", { class: "sim-econ-table sim-grid" }, el("thead", {}, head), el("tbody", {}, ...body)));
  }

  private lensSwitch(): HTMLElement {
    const buttons = LENSES.map((l) => el("button", { class: "btn-s", "aria-pressed": String(l.lens === this.lens), onclick: () => this.setLens(l.lens) }, l.label));
    return el("div", { class: "option-switch" }, ...buttons);
  }

  private setLens(lens: Lens): void {
    this.lens = lens;
    this.render(true);
  }

  private cell(ctx: Ctx, shop: EconShop, goodId: string): HTMLElement {
    const good = shop.goods.find((g) => g.good === goodId);
    if (!good) return el("td", { class: "sim-empty" });
    const price = this.lens === "price";
    const tags = good.tags.length > 0 ? `. ${good.tags.map((t) => t.text).join(", ")}` : "";
    const title = `${good.name}, ${shop.name}: ${good.stock} of ${good.target}, buy ${good.buyText}, sell ${good.sellText}${tags}`;
    const look = price ? this.priceLook(ctx, good) : levelTone(good);
    return el("td", { class: toneClass("sim-econ-cell", look), title, onclick: () => ctx.nav.town(shop.id) },
      el("span", { class: "num" }, price ? moneyAmount(good.buy) : String(good.stock)),
      price ? priceSpark(ctx, shop, good, "cell") : stockSpark(ctx, shop, good, "cell"));
  }

  private priceLook(ctx: Ctx, good: EconGood): Tone {
    const middle = median(ctx.economy.shops.flatMap((s) => s.goods.filter((g) => g.good === good.good).map((g) => g.buy)));
    if (good.buy >= middle * PRICE_GAP.dear) return "warn";
    return good.buy <= middle * PRICE_GAP.cheap ? "good" : "";
  }

  private news(ctx: Ctx): HTMLElement {
    if (ctx.economy.news.length === 0) return el("div", { class: "dim" }, "No road news");
    return el("div", { class: "sim-econ-group" }, el("span", { class: "sim-label" }, "Road news"), el("ul", { class: "sim-news" }, ...ctx.economy.news.map((n) => newsLine(ctx, n))));
  }
}
