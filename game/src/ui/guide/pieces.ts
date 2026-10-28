import { devEl as el } from "../dom";
import { moneyEl } from "../units";

export interface Piece {
  name: string;
  note: string;
  build: () => HTMLElement;
}

const text = (tag: string, cls: string, words: string): HTMLElement => el(tag, { class: cls }, words);

const sample = (cls: string, words: string): HTMLElement => el("div", { class: cls }, words);

export const PIECES: Piece[] = [
  { name: ".panel", note: "The base of every HUD box.", build: () => sample("panel", "A panel") },
  { name: ".dialog", note: "The frame of a modal, the save panel and New game.", build: () => sample("dialog", "A dialog") },
  { name: ".dock-panel", note: "A panel of the right dock.", build: () => sample("dock-panel", "A dock panel") },
  { name: ".notice", note: "A box at the top middle that waits for a choice.", build: () => sample("notice panel", "A notice") },
  { name: ".panel-title", note: "The heading of a small HUD panel.", build: () => text("h3", "panel-title", "Title") },
  { name: "button", note: "The default button.", build: () => text("button", "", "Button") },
  { name: ".btn-s", note: "A small button, 24px high, for rows, cards and small panels.", build: () => text("button", "btn-s", "Small") },
  { name: ".btn-l", note: "A large button, 44px high, for a screen's main choice.", build: () => text("button", "btn-l", "Large") },
  { name: ".btn-danger", note: "A hostile action.", build: () => text("button", "btn-danger", "Danger") },
  { name: ".row", note: "A list line with a faint line under it.", build: () => sample("row", "A row") },
  { name: ".tile", note: "A boxed list item edged in its tone.", build: () => sample("tile", "A tile") },
  { name: ".chip", note: "A small boxed value.", build: () => text("span", "chip", "120 scrap") },
  { name: ".art-band", note: "A wide picture across the top of a page, with the place name and chips over its lower edge.", build: () => sample("art-band", "") },
  { name: ".ink-page", note: "The frame of the town page and of a quest in town: a band on top, then a heading, prose, an optional panel and numbered choices in a centered text column.", build: () => inkPage() },
  { name: ".tag", note: "An outlined word.", build: () => text("span", "tag", "buy") },
  { name: ".contract-clue", note: "One open survey place per line: the kind, then the posting shop's way there, then what it looks like. A found place has a tag last.", build: () => el("span", { class: "contract-clue" }, "Lookout, from Bowl: Leave by the east gate. Take the road to Nose, heading north-east. Where the road runs closest, leave the road and head south and a touch east, a fair way. A lone building on high ground. ", text("span", "tag", "found")) },
  { name: ".amount .coin", note: "Money from moneyEl(): the M's coin, then the number. Debt is in danger ink.", build: () => moneyEl(15) },
  { name: ".meter", note: "A bar that fills from the left.", build: () => meter("meter", 70) },
  { name: ".meter.progress", note: "A bar for timed work.", build: () => meter("meter progress", 40) },
  { name: ".meter.broken", note: "A bar of a broken part.", build: () => meter("meter broken", 100) },
  { name: ".selected", note: "The one look of a chosen item. A pressed button.on uses it too.", build: () => sample("selected tile", "Selected") },
  { name: '[aria-disabled="true"]', note: "A control that cannot be used now. It keeps hover and focus.", build: () => disabled() },
  { name: ".tooltip", note: "A note that opens over its anchor. It also gives a disabled reason.", build: () => sample("tooltip", "Need 12 M's more") },
  { name: ".tooltip-row", note: "Label on the left, value on the right, for breakdowns.", build: () => breakdown() },
  { name: ".map-view", note: "The map drawing, compass north up and turned to match the 3D view: explored ground on paper, discovered places and the truck. The minimap is a square panel with zoom and open buttons in its head row.", build: () => minimapPiece() },
  { name: ".key", note: "A keyboard key or a mouse button, drawn as a keycap.", build: () => text("kbd", "key", "Space") },
  { name: ".info-actions", note: "The action row of the truck card, right under the name line: Call, Look over and Mark as small buttons with their key drawn as a keycap off touch. A button the rules refuse stays, dimmed, with its reason.", build: () => infoActions() },
  { name: ".drawer-tabs", note: "The tab row of the phone layout: one word button per drawer, .selected on the open one and .marked for attention.", build: () => drawerTabs() },
  { name: ".log-strip", note: "The newest log line on one row above End turn on a phone. It never wraps, and a tap opens the Log drawer.", build: () => logStrip() },
  { name: ".option-switch", note: "A row of equal buttons that picks one value for a setting: the language and the UI size. aria-pressed marks the chosen one, and a value that cannot be used is aria-disabled with its reason.", build: () => optionSwitch() },
  { name: ".seen", note: "An option with nothing new behind it: a radio option or a talk choice the player has heard out. It fills with the sunk surface and keeps its ink, hover and focus.", build: () => seenOptions() },
  { name: ".num", note: "A number in the mono face.", build: () => text("span", "num", "1 240") },
];

function inkPage(): HTMLElement {
  const choice = (words: string, reason: string | null = null): HTMLElement =>
    el("button", { class: "quest-choice", ...(reason ? { "aria-disabled": "true", title: reason } : {}) }, reason ? el("span", { class: "quest-check" }, reason) : null, words);
  return el(
    "div",
    { class: "ink-page" },
    el("div", { class: "ink-band" }, el("div", { class: "art-band" })),
    el(
      "div",
      { class: "ink-body" },
      el("div", { class: "ink-head" }, text("h2", "quest-place", "Nose"), text("p", "qt-line", "The hull leans over the sheds like a cliff that rusts.")),
      el("div", { class: "ink-choices quest-choices" }, choice("1. Go to the garage"), choice("2. See who is parked", "No drivers in sight"), choice("3. Drive on")),
    ),
  );
}

function seenOptions(): HTMLElement {
  const option = (words: string, extra = ""): HTMLElement => el("button", { class: `dialogue-option${extra}` }, words);
  return el("div", { class: "dialogue-options" }, option("1. About the road…"), option("2. Want to trade?", " seen"), option("3. Hang up."));
}

function minimapPiece(): HTMLElement {
  const button = (label: string) => text("button", "btn-s", label);
  const head = el("div", { class: "minimap-head" }, button("−"), button("+"), text("button", "log-expand", "⤢"));
  return el("div", { class: "panel minimap" }, head, el("div", { class: "minimap-body" }, sample("map-view", "")));
}

function disabled(): HTMLElement {
  const button = text("button", "", "Buy");
  button.setAttribute("aria-disabled", "true");
  return button;
}

function infoActions(): HTMLElement {
  const look = el("button", { class: "btn-s" }, "Look over", el("kbd", { class: "key" }, "B"));
  const mark = el("button", { class: "btn-s" }, "Mark", el("kbd", { class: "key" }, "N"));
  mark.setAttribute("aria-disabled", "true");
  return el("div", { class: "info-actions" }, look, mark);
}

function drawerTabs(): HTMLElement {
  const tab = (cls: string, label: string): HTMLElement => el("button", { class: `btn-l ${cls}` }, label);
  return el("div", { class: "drawer-tabs" }, tab("selected", "Truck"), tab("marked", "Guns"), tab("", "Radio"), tab("", "Log"));
}

function logStrip(): HTMLElement {
  return el("div", { class: "panel log-strip" }, el("div", { class: "" }, "You find yourself stranded in an unfamiliar land. Not your finest moment."));
}

function breakdown(): HTMLElement {
  const row = (label: string, value: string, tone: string): HTMLElement => el("div", { class: `tooltip-row ${tone}` }, el("span", {}, label), el("span", { class: "num" }, value));
  return el("div", { class: "tooltip" }, row("Base", "120 km/h", "base"), row("Load", "−10 km/h", "down"), row("Tailwind", "+5 km/h", "up"));
}

function meter(cls: string, percent: number): HTMLElement {
  const fill = el("span", {});
  fill.style.width = `${percent}%`;
  return el("div", { class: cls }, fill);
}

function optionSwitch(): HTMLElement {
  const choice = (words: string, pressed: boolean, off = false): HTMLElement =>
    el("button", { class: "num", "aria-pressed": String(pressed), ...(off ? { "aria-disabled": "true", title: "Too big for this screen" } : {}) }, words);
  return el("div", { class: "option-switch", role: "group" }, choice("80%", false), choice("100%", true), choice("130%", false, true));
}
