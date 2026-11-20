import { actionRow, costItem, createIcon, gaugeEl, statRow, statValueEl } from "../cards";
import { chipEl } from "../chip";
import { devEl as el, el as msgEl } from "../dom";
import { speedKey } from "../travel-speed";
import { SPACE, t, verbatim, type Msg } from "../../text/msg";
import { moneyEl, moneyMsg, priceTag, pricedEl } from "../units";
import { workMeterBar } from "../work-meter";
import { textKey } from "../dash/skin";

export interface Piece {
  name: string;
  note: string;
  build: () => HTMLElement;
}

const text = (tag: string, cls: string, words: string): HTMLElement => el(tag, { class: cls }, words);

const chipSample = (): HTMLElement =>
  el("span", { class: "chips" }, chipEl(verbatim("Scout pickup"), { icon: "truck" }), chipEl(verbatim("1,680 / 3,840 kg"), { icon: "mass", readout: true }));

const sample = (cls: string, words: string): HTMLElement => el("div", { class: cls }, words);

const confirmSample = (): HTMLElement =>
  el("div", { class: "dialog confirm-dialog" }, el("p", { class: "screen-block" }, "End the run here? It cannot be undone."), el("div", { class: "confirm-buttons" }, text("button", "", "Cancel"), text("button", "btn-danger", "End run")));

const wellRows = (): HTMLElement => statRow("mass", verbatim("Load"), statValueEl(verbatim("1,680 / 3,840 kg")));

const gaugeSample = (): HTMLElement => gaugeEl(0.5, { share: { left: 0.3, width: 0.2 }, after: { left: 0.5, width: 0.15 } });

const actionSample = (): HTMLElement =>
  el("div", { class: "action-rows" }, ...actionRow(text("button", "btn-s", "Patch"), [costItem("clock", verbatim("4")), costItem("parts", verbatim("−2"), "bad")]), ...actionRow(text("button", "btn-s", "Rotate"), []));

export const PIECES: Piece[] = [
  { name: ".panel", note: "The base of every HUD box.", build: () => sample("panel", "A panel") },
  { name: ".dialog", note: "The frame of a modal, the save panel and New game.", build: () => sample("dialog", "A dialog") },
  { name: ".confirm-dialog", note: "The yes or no question of a command that throws away progress, in the center, with Cancel and a danger yes button.", build: confirmSample },
  { name: ".dock-panel", note: "A panel of the right dock.", build: () => sample("dock-panel", "A dock panel") },
  { name: ".notice", note: "A box at the top middle that waits for a choice.", build: () => sample("notice panel", "A notice") },
  { name: ".screen-block", note: "A screen set into a window, one per block of changing content.", build: () => sample("screen-block", "Changing content") },
  { name: ".screen-line", note: "One choice the game wrote, on a screen, with its number first.", build: () => el("div", { class: "screen-block" }, text("button", "screen-line", "1. Ask about the road"), text("button", "screen-line selected", "2. Picked line"), text("button", "screen-line seen", "3. Read before")) },
  { name: ".screen-btn", note: "The action of one line of a list, drawn on its screen.", build: () => el("div", { class: "screen-block" }, text("button", "screen-btn", "Accept"), " ", text("button", "screen-btn selected", "Picked")) },
  { name: ".tape", note: "A name from the game used as a heading on metal.", build: () => text("span", "tape", "Scout pickup") },
  { name: ".panel-title", note: "The heading of a small HUD panel.", build: () => text("h3", "panel-title", "Title") },
  { name: "button", note: "The default button.", build: () => text("button", "", "Button") },
  { name: ".btn-s", note: "A small button, 24px high, for rows, cards and small panels.", build: () => text("button", "btn-s", "Small") },
  { name: ".btn-l", note: "A large button, 44px high, for a screen's main choice.", build: () => text("button", "btn-l", "Large") },
  { name: ".btn-danger", note: "A hostile action.", build: () => text("button", "btn-danger", "Danger") },
  { name: ".row", note: "A list line on a screen, set apart from the next by space.", build: () => sample("row", "A row") },
  { name: ".tile", note: "A boxed list item edged in its tone.", build: () => sample("tile", "A tile") },
  { name: ".chip", note: "A small boxed value.", build: chipSample },
  { name: ".art-band", note: "A wide picture across the top of a page, with the place name and chips over its lower edge.", build: () => sample("art-band", "") },
  { name: ".ink-page", note: "The frame of the town page and of a quest in town: a band on top, then a scrolling region with a heading, prose, an optional panel and numbered choices in a centered text column, and a foot pinned under it that holds the way out and the status line.", build: () => inkPage() },
  { name: ".tag", note: "An outlined word.", build: () => text("span", "tag", "buy") },
  { name: ".spent", note: "A row whose own action is done. It keeps its slot, dimmed, with a past-tense tag where the button was, until the player leaves the list.", build: () => el("div", { class: "row spent" }, "A part ", text("span", "tag", "Sold")) },
  { name: ".contract-clue", note: "One open survey place per line: the kind, then the posting shop's way there, then what it looks like. A found place has a tag last.", build: () => el("span", { class: "contract-clue" }, "Lookout, from Bowl: Leave by the east gate. Take the road to Nose, heading north-east. Where the road enters square D5, leave the road and head south and a touch east, a fair way. A lone building on high ground. ", text("span", "tag", "found")) },
  { name: ".way-steps", note: "A numbered list of directions: one step per item, the number in caption ink on a fixed column, text wrapping under its own text.", build: () => el("ol", { class: "way-steps" }, el("li", {}, "Leave by the east gate."), el("li", {}, "Take the road to Nose, heading north-east. That stretch takes half an hour or more."), el("li", {}, "Where the road enters square D5, leave the road and head south and a touch east."))},
  { name: ".amount .coin", note: "Money from moneyEl(): the M's coin, then the number. Debt is in danger ink.", build: () => moneyEl(15) },
  { name: ".meter", note: "A bar that fills from the left.", build: () => meter("meter", 70) },
  { name: ".meter.progress", note: "A bar for timed work.", build: () => meter("meter progress", 40) },
  { name: ".meter.notched", note: "A bar of timed work, one cell per turn up to 12 turns and a smooth fill beyond. Filled cells are turns done, and the count sits in its title.", build: () => workMeterBar({ turnsLeft: 5, total: 8 }, verbatim("Search")) },
  { name: ".meter.broken", note: "A bar of a broken part.", build: () => meter("meter broken", 100) },
  { name: ".well", note: "The sunk surface of a thin side column on a working screen, holding .well-group blocks. The middle column stays open.", build: () => el("div", { class: "well" }, el("div", { class: "well-group" }, wellRows())) },
  { name: ".well-group", note: "One tight group of rows inside a well. Space between groups is wide.", build: () => el("div", { class: "well-group" }, wellRows()) },
  { name: ".stat-row", note: "The one row form: icon, label, value at the right edge.", build: wellRows },
  { name: ".meter-row", note: "A stat row with its bar under it.", build: () => el("div", { class: "meter-row" }, wellRows(), gaugeSample()) },
  { name: ".gauge", note: "A bar on a well, with a track lighter than the well. An accent span marks the picked part's share, and a dashed one a share a choice would add.", build: gaugeSample },
  { name: ".action-rows", note: "One same-width verb button per row, then the cost as icon and number, or the reason it is off.", build: actionSample },
  { name: ".cost", note: "What an action costs: icons and numbers, with the words in its tooltip.", build: actionSample },
  { name: ".cost-item", note: "One icon and number of a cost.", build: actionSample },
  { name: ".selected", note: "The one look of a chosen item. A pressed button.on uses it too.", build: () => sample("selected tile", "Selected") },
  { name: '[aria-disabled="true"]', note: "A control that cannot be used now. It keeps hover and focus.", build: () => disabled() },
  { name: ".tooltip", note: "A note that opens over its anchor. It also gives a disabled reason.", build: () => sample("tooltip", "Need 12 M's more") },
  { name: ".tooltip-row", note: "Label on the left, value on the right, for breakdowns.", build: () => breakdown() },
  { name: ".map-view", note: "The map drawing, compass north up and turned to match the 3D view: explored ground on paper, discovered places and the truck. The minimap is a square panel with zoom and open buttons in its head row.", build: () => minimapPiece() },
  { name: ".key", note: "A keyboard key or a mouse button, drawn as a keycap.", build: () => text("kbd", "key", "Space") },
  { name: ".info-actions", note: "The action row of the truck card, right under the name line: Call, Look over and Mark as small buttons with their key drawn as a keycap off touch. A button the rules refuse stays, dimmed, with its reason.", build: () => infoActions() },
  { name: ".option-switch", note: "A row of equal buttons that picks one value for a setting: the language and the UI size. aria-pressed marks the chosen one, and a value that cannot be used is aria-disabled with its reason.", build: () => optionSwitch() },
  { name: ".speed-keys", note: "The travel speed control above End turn: a slower key, an LCD with the speed in turns per second and a faster key, built from the radio's transport key. The LCD is lit while automatic travel plays and faint while the pick waits. A key at the end of the range is aria-disabled with its reason.", build: () => speedKeys() },
  { name: ".seen", note: "An option with nothing new behind it: a radio option or a talk choice the player has heard out. It prints in faint screen ink and keeps its hover and focus.", build: () => seenOptions() },
  { name: ".num", note: "A number in the mono face.", build: () => text("span", "num", "1 240") },
];

function inkPage(): HTMLElement {
  const choice = (words: string, reason: string | null = null): HTMLElement =>
    el("button", { class: "quest-choice screen-line", ...(reason ? { "aria-disabled": "true", title: reason } : {}) }, reason ? el("span", { class: "quest-check" }, reason) : null, words);
  return el(
    "div",
    { class: "ink-page" },
    el("div", { class: "ink-band" }, el("div", { class: "art-band" })),
    el(
      "div",
      { class: "ink-body" },
      el(
        "div",
        { class: "ink-scroll" },
        el("div", { class: "ink-head" }, text("h2", "quest-place tape", "Nose compound"), text("p", "qt-line screen-block", "The hull leans over the sheds like a cliff that rusts.")),
        el("div", { class: "ink-choices quest-choices screen-block" }, choice("1. Machiners' yard"), choice("2. Do odd jobs for 4 hours", "For drivers under 100 M")),
      ),
      el("div", { class: "ink-foot" }, text("button", "quest-choice compact", "3. Drive on"), text("div", "ink-status bad", "")),
    ),
  );
}

function seenOptions(): HTMLElement {
  const option = (words: string, extra = ""): HTMLElement => el("button", { class: `dialogue-option screen-line${extra}` }, words);
  return el("div", { class: "dialogue-options screen-block" }, option("1. About the road…"), option("2. Want to trade?", " seen"), option("3. Hang up."));
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

function breakdown(): HTMLElement {
  const row = (label: string, value: string, tone: string): HTMLElement => el("div", { class: `tooltip-row ${tone}` }, el("span", {}, label), el("span", { class: "num" }, value));
  return el("div", { class: "tooltip" }, row("Base", "120 km/h", "base"), row("Load", "−10 km/h", "down"), row("Tailwind", "+5 km/h", "up"));
}

function meter(cls: string, percent: number): HTMLElement {
  const fill = el("span", {});
  fill.style.width = `${percent}%`;
  return el("div", { class: cls }, fill);
}

function speedKeys(): HTMLElement {
  return el("div", { class: "speed-keys", role: "group" }, speedKey("slower", () => {}), el("span", { class: "speed-lcd running" }, "16x"), speedKey("faster", () => {}));
}

function optionSwitch(): HTMLElement {
  const choice = (words: string, pressed: boolean, off = false): HTMLElement =>
    el("button", { class: "num", "aria-pressed": String(pressed), ...(off ? { "aria-disabled": "true", title: "Too big for this screen" } : {}) }, words);
  return el("div", { class: "option-switch", role: "group" }, choice("80%", false), choice("100%", true), choice("130%", false, true));
}

export interface KitState {
  name: string;
  note: string;
  build: () => HTMLElement[];
}

const kitKey = (label: Msg, cls = "", attrs: Record<string, string> = {}): HTMLElement => msgEl("button", { class: cls, ...attrs }, label);

const offKey = (label: Msg | HTMLElement, reason: Msg): HTMLElement => msgEl("button", { "aria-disabled": "true", title: reason }, label);

const kitTile = (cls: string, label: Msg): HTMLElement => msgEl("div", { class: `tile ${cls}`.trim() }, label);

export const STATES: KitState[] = [
  { name: "rest", note: "Can be used.", build: () => [kitKey(t("goods.buy")), kitTile("", t("inv.title"))] },
  { name: "hover", note: "Point at them. A key keeps its look, a tile lights its edge.", build: () => [kitKey(t("goods.buy")), kitTile("", t("inv.title"))] },
  { name: "focus", note: "The first key takes focus when the sheet opens.", build: () => [kitKey(t("goods.buy"), "kit-focus")] },
  { name: "selected", note: "A key that is on takes the lit cap. A tile takes the accent.", build: () => [kitKey(t("menu.save"), "on"), kitTile("selected", t("inv.title"))] },
  { name: "planned", note: "The dashed share a choice would add.", build: () => [gaugeEl(0.4, { after: { left: 0.4, width: 0.25 } })] },
  { name: "working", note: "Timed work in progress.", build: () => [workMeterBar({ turnsLeft: 3, total: 8 }, t("inv.title"))] },
  { name: "disabled", note: "The cap stays and the print dims. Hover gives the reason.", build: () => [offKey(t("trade.repairAllVerb"), t("options.uiSizeTooBig"))] },
  { name: "spent", note: "The row stays with a past-tense tag.", build: () => [msgEl("div", { class: "row spent" }, t("inv.title"), SPACE, msgEl("span", { class: "tag" }, t("trade.done.sold")))] },
  { name: "seen", note: "Nothing new behind it.", build: () => [msgEl("button", { class: "quest-choice seen" }, t("menu.continue"))] },
  { name: "unaffordable", note: "The price takes danger ink.", build: () => [offKey(pricedEl(t("goods.buy"), priceTag(544, false)), t("trade.needMore", { price: moneyMsg(344) }))] },
  { name: "locked", note: "The lock comes before the word.", build: () => [msgEl("button", { "aria-disabled": "true" }, createIcon("lock"), t("goods.buy"))] },
];

function windowHead(): HTMLElement {
  return msgEl("div", { class: "kit-head" }, msgEl("h3", {}, t("inv.title")), kitKey(t("inv.close"), "close"));
}

function windowWell(): HTMLElement {
  return msgEl(
    "div",
    { class: "well" },
    msgEl("div", { class: "well-group" }, msgEl("div", { class: "kit-offer" }, msgEl("span", {}, t("trade.repairAllVerb")), kitKey(t("contract.accept"), "screen-btn"))),
    msgEl("div", { class: "well-group" }, msgEl("div", { class: "meter-row" }, statRow("mass", t("stat.mass"), statValueEl(verbatim("1,680 / 3,840 kg"))), gaugeEl(0.44, { share: { left: 0.3, width: 0.14 } }))),
    msgEl("div", { class: "well-group" }, statRow("mass", t("inv.condition"), statValueEl(verbatim("38/38"))), statRow("mass", t("options.uiSize"), statValueEl(verbatim("100%")))),
  );
}

function windowKeys(): HTMLElement {
  return msgEl(
    "div",
    { class: "kit-keys" },
    kitKey(t("confirm.cancel")),
    offKey(t("trade.repairAllVerb"), t("options.uiSizeTooBig")),
    textKey(t("hud.endRun"), {}, true),
    kitKey(t("contract.accept"), "btn-l"),
  );
}

export function kitWindow(): HTMLElement {
  return msgEl(
    "div",
    { class: "dialog modal kit-window" },
    windowHead(),
    msgEl("div", { class: "tabs" }, kitKey(t("menu.save"), "on"), kitKey(t("menu.load")), kitKey(t("menu.options"))),
    msgEl("h3", { class: "tape kit-tape" }, verbatim("Scout pickup")),
    msgEl("div", { class: "kit-body" }, windowWell(), msgEl("div", { class: "kit-side" }, msgEl("input", { type: "text", value: "1,680 kg" }), msgEl("select", {}, msgEl("option", {}, t("menu.newGame"))), msgEl("p", { class: "screen-block" }, t("menu.bootUnfinished")))),
    windowKeys(),
  );
}
