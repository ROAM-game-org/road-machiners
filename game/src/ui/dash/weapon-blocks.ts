import { el } from "../dom";
import { createBareItemIcon } from "../cards";
import { setData, setText, setAttrText, setFlag, showControl, plateKey, pressIfOn, type Lamp, kitPiece, keyCap, lamp, Plate, rockerFace, WEAPONS_PLATE, amberTint } from "./skin";
import type { FireBlock } from "../../sim/combat";
import { num, type Msg } from "../../text/msg";
import type { UtilityState } from "../weapons";

export type GunLight = "go" | "wait" | "fault" | "off";

const FAULT_BLOCKS: readonly FireBlock[] = ["disabled", "shutDown", "out"];
const HOLD_BLOCKS: readonly FireBlock[] = ["noTarget"];

export function gunLight(block: FireBlock | null): GunLight {
  if (block === null) return "go";
  if (FAULT_BLOCKS.includes(block)) return "fault";
  if (HOLD_BLOCKS.includes(block)) return "off";
  return "wait";
}

const UTILITY_LAMPS: Record<UtilityState, Lamp> = {
  ready: "green",
  aiming: "amber",
  set: "green",
  armed: "amber",
  recharging: "red",
  blocked: "off",
};

export function utilityLamp(state: UtilityState): Lamp {
  return UTILITY_LAMPS[state];
}

export function utilityEngaged(state: UtilityState): boolean {
  return state === "aiming" || state === "set" || state === "armed";
}

export const GUNS_PER_PAGE = 6;

export function gunPage(picked: number | null, pickedBefore: number | null, page: number, count: number): number {
  const pages = Math.max(1, Math.ceil(count / GUNS_PER_PAGE));
  if (picked !== null && picked !== pickedBefore) return Math.floor(picked / GUNS_PER_PAGE);
  return Math.min(page, pages - 1);
}

export const UTILITY_SLOTS = 4;

export interface GunCellView {
  defId: string;
  rounds: number | null;
  light: GunLight;
  picked: boolean;
  reloading: boolean;
  title: Msg;
  key: string | null;
}

export interface UtilitySlotView {
  defId: string;
  label: Msg;
  state: UtilityState;
  picked: boolean;
  title: Msg;
  key: string | null;
}

export interface FireKeyView {
  on: boolean;
  title: Msg;
  reason: Msg | null;
}

export interface WeaponsView {
  guns: GunCellView[];
  all: FireKeyView;
  auto: FireKeyView;
  utilities: UtilitySlotView[];
  pageTitle: (page: number, pages: number) => Msg;
}

export interface WeaponsLabels {
  allFire: Msg;
  autoFire: Msg;
}

export interface WeaponsSetup {
  labels: WeaponsLabels;
  onPickGun: (index: number) => void;
  onAll: () => void;
  onAuto: () => void;
  onUtility: (index: number) => void;
}

class GunCell {
  readonly root: HTMLButtonElement;
  private readonly rounds = el("span", { class: "gun-rounds" });

  constructor(index: number, defId: string, onPick: () => void) {
    this.root = el(
      "button",
      { type: "button", class: "gun-cell" },
      el("span", { class: "gun-number" }, num(index + 1, "int")),
      el("span", { class: "gun-shape", "aria-hidden": "true" }, createBareItemIcon(defId)),
      el("span", { class: "gun-belt", "aria-hidden": "true" }),
      this.rounds,
    ) as HTMLButtonElement;
    this.root.addEventListener("click", onPick);
  }

  update(view: GunCellView): void {
    setData(this.root, "light", view.light);
    setFlag(this.root, "picked", view.picked);
    setFlag(this.root, "reloading", view.reloading);
    setFlag(this.root, "beltless", view.rounds === null);
    if (view.rounds !== null) setText(this.rounds, num(view.rounds, "int"));
    else this.rounds.replaceChildren();
    showControl(this.root, { title: view.title, reason: null, key: view.key ?? undefined });
    setAttrText(this.root, "aria-label", view.title);
  }
}

class UtilitySlot {
  readonly root: HTMLButtonElement;
  private readonly label = el("span", { class: "tape-print" });
  private readonly tape = kitPiece("tape", "slot-tape");
  private readonly lamp = lamp("slot-lamp");
  private readonly rocker = el("span", { class: "rocker-socket slot-rocker" }, rockerFace());

  constructor(onPick: () => void) {
    this.tape.append(this.label);
    this.root = el("button", { type: "button", class: "utility-slot-key", role: "switch" }, this.tape, this.lamp, this.rocker) as HTMLButtonElement;
    this.root.addEventListener("click", pressIfOn(this.root, onPick));
  }

  update(view: UtilitySlotView): void {
    const engaged = utilityEngaged(view.state);
    setText(this.label, view.label);
    setData(this.root, "state", view.state);
    setData(this.lamp, "lamp", utilityLamp(view.state));
    setFlag(this.root, "picked", view.picked);
    setFlag(this.rocker, "on", engaged || view.picked);
    this.root.setAttribute("aria-checked", String(engaged || view.picked));
    showControl(this.root, { title: view.title, reason: view.state === "blocked" ? view.title : null, key: view.key ?? undefined });
  }
}

export class WeaponsPanel {
  readonly root: HTMLElement;
  private readonly plate = new Plate(WEAPONS_PLATE, "weapons-plate");
  private readonly screen = el("div", { class: "gun-screen", role: "group" });
  private readonly grid = el("div", { class: "gun-grid" });
  private readonly pageMark: HTMLButtonElement;
  private readonly all: HTMLButtonElement;
  private readonly auto: HTMLButtonElement;
  private readonly autoRocker: HTMLElement;
  private readonly strip = el("div", { class: "utility-strip" });
  private cells: GunCell[] = [];
  private slots: UtilitySlot[] = [];
  private gunKey = "";
  private page = 0;
  private picked: number | null = null;
  private lastView: WeaponsView | null = null;

  constructor(private readonly setup: WeaponsSetup) {
    amberTint();
    const labels = setup.labels;
    this.pageMark = el("button", { type: "button", class: "gun-page" }) as HTMLButtonElement;
    this.pageMark.addEventListener("click", () => this.flip());
    this.screen.append(this.grid, this.pageMark);
    this.plate.place(this.screen, "screen");
    this.all = this.plate.place(keyCap("all-key", labels.allFire, setup.onAll, el("span", { class: "key-print" }, labels.allFire)), "allKey");
    this.auto = this.plate.place(plateKey("auto-key", labels.autoFire, setup.onAuto), "autoBox");
    this.autoRocker = this.plate.pin(el("span", { class: "rocker-socket auto-rocker" }, rockerFace()), "autoLever");
    this.plate.pin(el("span", { class: "plate-label auto-label" }, labels.autoFire), "autoLabel");
    this.plate.place(this.strip, "strip");
    this.root = el("div", { class: "hud-weapons" }, this.plate.root);
  }

  update(view: WeaponsView): void {
    this.lastView = view;
    this.drawGuns(view.guns);
    this.drawUtilities(view.utilities);
    setFlag(this.autoRocker, "on", view.auto.on);
    setFlag(this.all, "on", view.all.on);
    showControl(this.all, { title: view.all.title, reason: view.all.reason, key: "0" });
    this.auto.setAttribute("aria-pressed", String(view.auto.on));
    showControl(this.auto, { title: view.auto.title, reason: view.auto.reason, key: "Q" });
  }

  private flip(): void {
    const pages = Math.ceil(this.cells.length / GUNS_PER_PAGE);
    this.page = (this.page + 1) % Math.max(1, pages);
    if (this.lastView) this.showPage(this.lastView);
  }

  private drawGuns(guns: GunCellView[]): void {
    const key = guns.map((gun) => gun.defId).join("|");
    if (key !== this.gunKey) {
      this.gunKey = key;
      this.cells = guns.map((gun, i) => new GunCell(i, gun.defId, () => this.setup.onPickGun(i)));
      this.page = 0;
    }
    guns.forEach((gun, i) => this.cells[i].update(gun));
    const found = guns.findIndex((gun) => gun.picked);
    const picked = found < 0 ? null : found;
    this.page = gunPage(picked, this.picked, this.page, guns.length);
    this.picked = picked;
    this.showPage(this.lastView!);
  }

  private showPage(view: WeaponsView): void {
    const pages = Math.max(1, Math.ceil(this.cells.length / GUNS_PER_PAGE));
    const shown = this.cells.slice(this.page * GUNS_PER_PAGE, (this.page + 1) * GUNS_PER_PAGE);
    if (shown.some((cell, i) => this.grid.children[i] !== cell.root) || this.grid.childElementCount !== shown.length) this.grid.replaceChildren(...shown.map((cell) => cell.root));
    setFlag(this.pageMark, "hidden", pages < 2);
    if (pages > 1) {
      setText(this.pageMark, view.pageTitle(this.page + 1, pages));
      setAttrText(this.pageMark, "title", view.pageTitle(this.page + 1, pages));
    }
  }

  private drawUtilities(utilities: UtilitySlotView[]): void {
    if (utilities.length > UTILITY_SLOTS) throw new Error(`The utility strip holds ${UTILITY_SLOTS} slots, got ${utilities.length}`);
    while (this.slots.length < utilities.length) {
      const index = this.slots.length;
      const slot = new UtilitySlot(() => this.setup.onUtility(index));
      this.slots.push(slot);
      this.strip.append(slot.root);
    }
    while (this.slots.length > utilities.length) this.slots.pop()!.root.remove();
    utilities.forEach((utility, i) => this.slots[i].update(utility));
    setData(this.strip, "count", String(utilities.length));
  }
}
