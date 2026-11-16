import "../style.css";
import "./atlas.css";
import { devEl as el, uiRoot } from "../dom";
import { t, verbatim, type Msg } from "../../text/msg";
import { DrivePanel, type DriveView, StatsStrip, SystemKeys, SYSTEM_KEYS, type StatsView, type SystemKey, type SystemKeyView } from "./panels";
import { WeaponsPanel, type GunCellView, type UtilitySlotView, type WeaponsView } from "./weapon-blocks";
import { RadioDeck, TIME_SPEEDS, type DeckView } from "./panels";
import type { UtilityState } from "../weapons";
import { KIT, paintSkin } from "./skin";
import { publicUrl } from "../../public-url";

const GUNS = ["mg", "autocannon", "flamer", "rocketRack", "gatling", "harpoon", "shotgun", "cannon", "sniperCannon"];
const ROUNDS = [480, 120, 240, 600, 24, 200, 12, 30, 8];
const UTILITIES = ["claymoreRam", "smokeMortar", "caltrops", "flareCannon"] as const;
const UTILITY_STATES: UtilityState[] = ["ready", "recharging", "armed", "blocked"];
const LOG = [
  "Day 01 12:43 MG turret fires at Dust Rat, 3/5 hit.",
  "Day 01 12:42 You honk.",
  "Day 01 12:40 Search done.",
  "Day 01 12:38 Dust Rat spotted.",
  "Day 01 12:31 Fuel bought, 40 L.",
  "Day 01 12:20 Left Pump Station.",
  "Day 01 12:02 Contract taken: scrap to Sunward.",
];

const state = {
  speed: 74,
  top: 160,
  fuel: 0.62,
  heat: 0.35,
  manual: false,
  lights: true,
  overdrive: false,
  guns: 6,
  picked: null as number | null,
  all: true,
  auto: true,
  utilities: 3,
  speedIndex: 0,
  money: 1250,
  supplies: 240,
  health: 100,
};

const say = (text: string): Msg => verbatim(text);

function rocker(on: boolean, title: string) {
  return { checked: on, title: say(title), reason: null, locked: false };
}

function driveView(): DriveView {
  return {
    speed: state.speed,
    top: state.top,
    max: 140,
    pace: 90,
    speedTitle: say(`Speed ${state.speed} km/h`),
    speedLines: [{ label: say("Engine"), value: say("+12 km/h"), tone: "good" }, { label: say("Cargo"), value: say("-8 km/h"), tone: "bad" }],
    fuel: state.fuel,
    fuelTitle: say(`Fuel ${Math.round(state.fuel * 100)}%`),
    fuelWarn: state.fuel < 0.15,
    heat: state.heat,
    heatTitle: say(`Engine heat ${Math.round(state.heat * 100)}%`),
    heatWarn: state.heat > 0.75,
    manual: rocker(state.manual, "Manual driving"),
    lights: rocker(state.lights, "Headlights"),
    overdrive: rocker(state.overdrive, "Overdrive"),
    cool: { title: say("Costs 1 supply"), reason: null, locked: false },
  };
}

function gunViews(): GunCellView[] {
  return Array.from({ length: state.guns }, (_, i) => ({
    defId: GUNS[i],
    rounds: GUNS[i] === "flamer" ? null : ROUNDS[i],
    light: i === 2 ? "wait" : i === 4 ? "fault" : "go",
    picked: state.picked === i,
    reloading: i === 1,
    title: say(`Gun ${i + 1}`),
    key: String(i + 1),
  }));
}

function utilityViews(): UtilitySlotView[] {
  return Array.from({ length: state.utilities }, (_, i) => ({
    defId: UTILITIES[i],
    label: t(`utility.short.${UTILITIES[i]}`),
    state: UTILITY_STATES[i],
    picked: false,
    title: say(UTILITIES[i]),
    key: null,
  }));
}

function weaponsView(): WeaponsView {
  return {
    guns: gunViews(),
    all: { on: state.all, title: say("All guns fire"), reason: null },
    auto: { on: state.auto, title: say("Auto fire"), reason: null },
    utilities: utilityViews(),
    pageTitle: (page, pages) => t("hud.gunPage", { page, pages }),
  };
}

function deckView(): DeckView {
  return {
    clock: { day: 1, hour: 12, minute: 43, title: say("Day 1, 12:43") },
    speed: { index: state.speedIndex, title: say(`Time speed ${TIME_SPEEDS[state.speedIndex]}x`), reason: null, running: false },
    turn: { title: say("End turn"), label: t("turn.space"), disabled: false, auto: false },
    offAir: false,
  };
}

function statsView(): StatsView {
  return {
    money: state.money,
    moneyTitle: say("Money"),
    supplies: state.supplies,
    suppliesTitle: say("Supplies"),
    suppliesTone: "base",
    health: state.health,
    healthTitle: say("Driver health"),
  };
}

function systemViews(): Record<SystemKey, SystemKeyView> {
  return Object.fromEntries(SYSTEM_KEYS.map((name) => [name, { title: say(name), reason: null, marked: name === "character" }])) as Record<SystemKey, SystemKeyView>;
}

function flip(key: "manual" | "lights" | "overdrive" | "auto"): void {
  state[key] = !state[key];
}

const drive = new DrivePanel({
  labels: {
    manual: t("hud.manual"),
    lights: t("hud.lightsOn"),
    overdrive: t("hud.overdrive"),
    cool: t("hud.coolKey"),
    speedUnit: t("hud.kph"),
  },
  onManual: () => flip("manual"),
  onLights: () => flip("lights"),
  onOverdrive: () => flip("overdrive"),
  onCool: () => (state.heat = Math.max(0, state.heat - 0.2)),
});

const weapons = new WeaponsPanel({
  labels: { allFire: t("hud.allFire"), autoFire: t("weapon.autoFire") },
  onPickGun: (i) => {
    state.picked = state.picked === i ? null : i;
    state.all = state.picked === null;
  },
  onAll: () => {
    state.picked = null;
    state.all = true;
  },
  onAuto: () => flip("auto"),
  onUtility: () => undefined,
});

const deck = new RadioDeck({
  dayWord: t("clock.dayWord"),
  turnLabel: t("turn.end"),
  speedLabel: (speed) => t("turn.speed.value", { n: speed }),
  onSpeed: (i) => (state.speedIndex = i),
  onTurnPress: () => undefined,
  onTurnRelease: () => undefined,
});

const stats = new StatsStrip(t("hud.kg"));
const system = new SystemKeys(
  { map: t("map.full"), journal: t("hud.journal"), car: t("hud.inventoryTitle"), character: t("hud.character"), menu: t("menu.menu") },
  { map: () => undefined, journal: () => undefined, car: () => undefined, character: () => undefined, menu: () => undefined },
);

function refresh(): void {
  drive.update(driveView());
  weapons.update(weaponsView());
  deck.update(deckView());
  stats.update(statsView());
  system.update(systemViews());
}

function fillDeck(): void {
  deck.talk.append(el("div", {}, "WOT 66.7 FM"), el("div", {}, "My producer says we need a sponsor. I told him we need a producer."));
  const lines = el("div", { class: "log-lines" }, ...LOG.map((line) => el("div", {}, line)));
  deck.log.append(lines);
  deck.bindLog(lines);
}

const DRAG_SLOP_PX = 4;

function swallowNextClick(node: HTMLElement): void {
  const swallow = (e: Event): void => {
    e.stopPropagation();
    e.preventDefault();
  };
  node.addEventListener("click", swallow, { capture: true });
  setTimeout(() => node.removeEventListener("click", swallow, { capture: true }), 0);
}

function dragWithin(node: HTMLElement, stage: HTMLElement): void {
  node.addEventListener("pointerdown", (down) => {
    if (down.button !== 0 || !down.altKey) return;
    const frame = stage.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    let moved = false;
    const move = (e: PointerEvent): void => {
      const dx = e.clientX - down.clientX;
      const dy = e.clientY - down.clientY;
      if (!moved && Math.hypot(dx, dy) < DRAG_SLOP_PX) return;
      moved = true;
      Object.assign(node.style, { left: `${box.left - frame.left + dx}px`, top: `${box.top - frame.top + dy}px`, right: "auto", bottom: "auto" });
    };
    const drop = (): void => {
      window.removeEventListener("pointermove", move);
      if (moved) swallowNextClick(node);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", drop, { once: true });
  });
}

function assembled(): HTMLElement {
  const slot = (cls: string, panel: HTMLElement): HTMLElement => el("div", { class: `assembled-slot ${cls}` }, panel);
  const stage = el(
    "div",
    { class: "assembled-stage" },
    slot("slot-stats", stats.root),
    slot("slot-buttons", system.root),
    slot("slot-drive", drive.root),
    slot("slot-weapons", weapons.root),
    slot("slot-radio", deck.root),
    el("div", { class: "assembled-ghost ghost-card" }, "Cursor card or notice"),
    el("div", { class: "assembled-ghost ghost-toast" }, "Toast"),
  );
  for (const piece of stage.children) dragWithin(piece as HTMLElement, stage);
  return el("section", { class: "assembled-view" }, stage, el("p", { class: "assembled-hint" }, "Alt-drag a panel to move it."));
}

function control(label: string, input: HTMLInputElement, onInput: (value: string) => void): HTMLElement {
  input.addEventListener("input", () => {
    onInput(input.value);
    refresh();
  });
  return el("label", { class: "atlas-control" }, label, input);
}

function range(label: string, min: number, max: number, step: number, value: number, onValue: (value: number) => void): HTMLElement {
  return control(label, el("input", { type: "range", min, max, step, value }) as HTMLInputElement, (v) => onValue(Number(v)));
}

function housingPicker(): HTMLElement {
  const root = document.documentElement;
  const start = getComputedStyle(root).getPropertyValue("--hud-housing").trim();
  return control("Housing color", el("input", { type: "color", value: start }) as HTMLInputElement, (v) => {
    root.style.setProperty("--hud-housing", v);
    void paintSkin(root);
  });
}

function controls(): HTMLElement {
  return el(
    "section",
    { class: "atlas-panel-controls" },
    housingPicker(),
    range("Speed", 0, 300, 1, state.speed, (v) => (state.speed = v)),
    range("Dial end", 60, 300, 20, state.top, (v) => (state.top = v)),
    range("Fuel", 0, 1, 0.01, state.fuel, (v) => (state.fuel = v)),
    range("Engine heat", 0, 1, 0.01, state.heat, (v) => (state.heat = v)),
    range("Guns", 0, 9, 1, state.guns, (v) => {
      state.guns = v;
      state.picked = null;
    }),
    range("Utilities", 0, 4, 1, state.utilities, (v) => (state.utilities = v)),
    range("Money", -500, 99999, 1, state.money, (v) => (state.money = v)),
    range("Supplies", 0, 999, 1, state.supplies, (v) => (state.supplies = v)),
    range("Health", 0, 100, 1, state.health, (v) => (state.health = v)),
  );
}

function artSheet(): HTMLElement {
  const names = ["drive", "weapons", "radio", ...Object.values(KIT).map((piece) => piece.art)];
  return el(
    "section",
    { class: "art-sheet" },
    el("h2", {}, "Plates and kit pieces"),
    el("div", { class: "art-sheet-grid" }, ...names.map((name) => el("figure", {}, el("img", { src: publicUrl(`hud/${name}.webp`), alt: "" }), el("figcaption", {}, name)))),
  );
}

function render(): void {
  const root = uiRoot();
  root.classList.add("dash-atlas");
  fillDeck();
  void paintSkin();
  root.append(assembled(), controls(), artSheet());
  refresh();
  window.setInterval(refresh, 250);
}

render();
