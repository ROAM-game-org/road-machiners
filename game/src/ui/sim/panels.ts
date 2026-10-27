import type { Card, CardRow, CardSection, Hud } from "../../sim/progression/sim-mode";
import { devEl as el } from "../dom";
import { RunChart, SERIES, swatch } from "./run-chart";

const OPEN_SECTIONS = ["Goals", "States", "Contracts", "Foes in sight"];
const WEAK_CONDITION = 40;
const HUD_STATES: Record<string, string | undefined> = { knockedOut: "Knocked out", dead: "Dead" };

export class PlayerPanel {
  private readonly clock = el("span", { class: "sim-clock num" });
  private readonly money = el("span", { class: "sim-big num" });
  private readonly worth = el("span", { class: "sim-big num" });
  private readonly xp = el("span", { class: "sim-big num" });
  private readonly doing = el("div", { class: "sim-doing" });
  readonly chart: RunChart;
  readonly root: HTMLElement;

  constructor(clockText: (turn: number) => string, private readonly clockOf: (turn: number) => string, open: () => void) {
    this.chart = new RunChart(clockText);
    const title = el("span", { class: "sim-card-title sim-link", role: "button", tabindex: 0, title: "Open your truck's card", onclick: open }, "Your truck");
    this.root = el("div", { class: "sim-player panel" },
      el("div", { class: "sim-head" }, title, this.clock),
      this.doing,
      el("div", { class: "sim-player-stats" }, cell("Money", this.money, SERIES.money), cell("Net worth", this.worth, SERIES.worth), cell("XP", this.xp, SERIES.xp)),
      this.chart.root);
  }

  show(turn: number, hud: Hud): void {
    this.clock.textContent = this.clockOf(turn);
    this.money.textContent = hud.money;
    this.worth.textContent = hud.worth;
    this.xp.textContent = String(hud.xp);
    const state = HUD_STATES[hud.state];
    this.doing.replaceChildren(...(state ? [el("span", { class: "tag bad" }, state)] : []), hud.doing);
  }
}

function cell(name: string, value: HTMLElement, look: string): HTMLElement {
  return el("div", { class: "sim-cell" }, el("span", { class: "sim-label" }, swatch(look), name), value);
}

function stat([name, value]: CardRow): HTMLElement {
  return el("div", { class: "sim-cell" }, el("span", { class: "sim-label" }, name), el("span", { class: "sim-value num" }, value), name === "Condition" ? conditionMeter(value) : null);
}

function conditionMeter(value: string): HTMLElement {
  const percent = parseInt(value, 10);
  if (Number.isNaN(percent)) throw new Error(`Condition "${value}" is not a percent`);
  const bar = el("span");
  bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  return el("div", { class: percent < WEAK_CONDITION ? "meter s broken" : "meter s" }, bar);
}

function fact([name, value]: CardRow): HTMLElement[] {
  return [el("span", { class: "sim-label" }, name), el("span", { class: "sim-fact" }, value)];
}

function row([name, value]: CardRow): HTMLElement {
  return el("div", { class: "sim-row" }, el("span", {}, name), el("span", { class: "num" }, value));
}

export class CardView {
  readonly root = el("div", { class: "sim-card panel" });
  private readonly opened = new Map<string, boolean>();

  show(card: Card | null): void {
    if (!card) return this.root.replaceChildren(el("div", { class: "dim" }, "Click a truck or a log line"));
    const parts = [
      el("div", { class: "sim-head" }, el("span", { class: "sim-card-title", title: card.id }, card.title), el("span", { class: "sim-tags" }, ...card.tags.map((tag) => el("span", { class: "tag" }, tag)))),
      card.doing ? el("div", { class: "sim-doing" }, card.doing) : null,
      card.stats.length > 0 ? el("div", { class: "sim-stats" }, ...card.stats.map(stat)) : null,
      card.facts.length > 0 ? el("div", { class: "sim-facts" }, ...card.facts.flatMap(fact)) : null,
      ...card.sections.map((s) => this.fold(s)),
    ];
    this.root.replaceChildren(...parts.filter((p): p is HTMLElement => p !== null));
  }

  private fold(section: CardSection): HTMLElement | null {
    const body = [...section.lines.map((line) => el("div", { class: "sim-line" }, line)), ...section.rows.map(row)];
    if (body.length === 0) return null;
    const open = this.opened.get(section.name) ?? OPEN_SECTIONS.includes(section.name);
    const fold = el("details", { class: "sim-fold", open }, el("summary", {}, section.name, el("span", { class: "dim num" }, ` ${body.length}`)), ...body) as HTMLDetailsElement;
    fold.addEventListener("toggle", () => this.opened.set(section.name, fold.open));
    return fold;
  }
}
