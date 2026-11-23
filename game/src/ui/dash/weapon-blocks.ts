import { el } from "../dom";
import { createBareItemIcon, createIcon } from "../cards";
import { setData, setText, setAttrText, setFlag, showControl, plateKey, pressIfOn, isOff, type Lamp, lamp, rockerFace, WEAPONS_PLATE, amberTint } from "./skin";
import { BakedPart, type SpriteFrames } from "./baked";
import { BAKED } from "./baked";
import { deviceCast } from "./skin";
import { num, SPACE, t, type Msg } from "../../text/msg";
import type { UtilityState } from "../weapons";

const UTILITY_LAMPS: Record<UtilityState, Lamp> = {
  ready: "green",
  aiming: "amber",
  set: "amber",
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

export type AmmoCell = "loaded" | "refill" | "spent";

export type GunStatus = { kind: "aiming"; part: Msg; chance: Msg } | { kind: "noTarget" | "reloading" | "error" | "gotEm" };

export interface GunCellView {
  defId: string;
  name: Msg;
  cells: AmmoCell[] | null;
  status: GunStatus;
  picked: boolean;
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

export interface KeyView {
  title: Msg;
  reason: Msg | null;
}

export interface FireKeyView extends KeyView {
  on: boolean;
}

export interface WeaponsView {
  guns: GunCellView[];
  all: FireKeyView;
  auto: FireKeyView;
  reload: KeyView;
  hold: KeyView;
  utilities: UtilitySlotView[];
  pageTitle: (page: number, pages: number) => Msg;
}

export interface WeaponsLabels {
  all: Msg;
  autoFire: Msg;
}

export interface WeaponsSetup {
  labels: WeaponsLabels;
  onPickGun: (index: number) => void;
  onAll: () => void;
  onAuto: () => void;
  onReload: () => void;
  onHold: () => void;
  onUtility: (index: number) => void;
}

const STATUS_WORDS = { noTarget: "weapon.status.noTarget", reloading: "weapon.status.reloading", error: "weapon.status.error", gotEm: "weapon.status.gotEm" } as const;

function statusNode(status: GunStatus): HTMLElement {
  if (status.kind === "aiming") return el("span", { class: "gun-status" }, status.part, SPACE, el("span", { class: "gun-chance" }, status.chance));
  return el("span", { class: `gun-status status-${status.kind}` }, t(STATUS_WORDS[status.kind]));
}

class GunCard {
  readonly root: HTMLButtonElement;
  private readonly cells = el("span", { class: "gun-cells", "aria-hidden": "true" });
  private readonly status = el("span", { class: "gun-status-slot" });

  constructor(index: number, defId: string, name: Msg, onPick: () => void) {
    this.root = el(
      "button",
      { type: "button", class: "gun-card" },
      el("span", { class: "gun-number" }, num(index + 1, "int")),
      el("span", { class: "gun-shape", "aria-hidden": "true" }, createBareItemIcon(defId)),
      el("span", { class: "gun-name" }, name),
      el("span", { class: "gun-line" }, this.cells, this.status),
    ) as HTMLButtonElement;
    this.root.addEventListener("click", onPick);
  }

  update(view: GunCellView): void {
    setData(this.root, "status", view.status.kind);
    setFlag(this.root, "picked", view.picked);
    this.cells.replaceChildren(...(view.cells ?? []).map((cell) => el("i", { class: `gun-cell-pip ${cell}` })));
    this.status.replaceChildren(statusNode(view.status));
    showControl(this.root, { title: view.title, reason: null, key: view.key ?? undefined });
    setAttrText(this.root, "aria-label", view.title);
  }
}

function ghostCard(index: number): HTMLElement {
  return el("span", { class: "gun-card ghost", "aria-hidden": "true" }, el("span", { class: "gun-number" }, num(index + 1, "int")));
}

class UtilitySlot {
  readonly root: HTMLButtonElement;
  private readonly label = el("span", { class: "tape-print" });
  private readonly tape = el("span", { class: "slot-tape" });
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

function onPress(button: HTMLElement, show: (down: boolean) => void): void {
  button.addEventListener("pointerdown", () => show(!isOff(button)));
  for (const end of ["pointerup", "pointercancel", "pointerleave"]) button.addEventListener(end, () => show(false));
}

const WEAPONS_LAYOUT = { width: WEAPONS_PLATE.width, height: WEAPONS_PLATE.height, boxes: {} };

interface KeyZones {
  name: string;
  hit: string;
  face: string;
  faceDown: string;
}

const KEY_ZONES = {
  all: { name: "all", hit: "allHit", face: "allText", faceDown: "allTextDown" },
  reload: { name: "reload", hit: "reloadHit", face: "reloadIcon", faceDown: "reloadIconDown" },
  hold: { name: "hold", hit: "holdHit", face: "holdIcon", faceDown: "holdIconDown" },
} as const satisfies Record<string, KeyZones>;

class PressKey {
  readonly button: HTMLButtonElement;
  private down = false;

  constructor(plate: BakedPart, zones: KeyZones, label: Msg, action: () => void, face: HTMLElement, private readonly frames: SpriteFrames, private readonly frameOf: (down: boolean) => string) {
    this.button = plate.zone(plateKey(`baked-key ${zones.name}-key`, label, action), zones.hit);
    const sink = plate.follow(face, zones.face, zones.faceDown);
    onPress(this.button, (down) => {
      this.down = down;
      sink(down);
      this.show();
    });
  }

  show(): void {
    this.frames.show(this.frameOf(this.down));
  }
}

export class WeaponsPanel {
  readonly root: HTMLElement;
  private readonly plate = new BakedPart("weapons", BAKED.weapons, "weapons-plate", WEAPONS_LAYOUT);
  private readonly screen = el("div", { class: "gun-screen", role: "group" });
  private readonly grid = el("div", { class: "gun-grid" });
  private readonly pageMark: HTMLButtonElement;
  private readonly all: PressKey;
  private readonly reload: PressKey;
  private readonly hold: PressKey;
  private readonly auto: HTMLButtonElement;
  private readonly autoFrames: SpriteFrames;
  private readonly plates: SpriteFrames[];
  private cards: GunCard[] = [];
  private slots: UtilitySlot[] = [];
  private gunKey = "";
  private page = 0;
  private lastView: WeaponsView | null = null;

  constructor(private readonly setup: WeaponsSetup) {
    amberTint();
    const labels = setup.labels;
    this.plates = [0, 1, 2, 3].map((i) => this.plate.sprite(`slot${i}`, `slot${i}`));
    const keyFrames = this.plate.sprite("key", "key-up");
    this.all = new PressKey(this.plate, KEY_ZONES.all, labels.all, setup.onAll, el("span", { class: "key-print all-print", "aria-hidden": "true" }, labels.all), keyFrames, (down) => `key-${down ? "down" : "up"}`);
    this.reload = new PressKey(this.plate, KEY_ZONES.reload, t("weapon.reload"), setup.onReload, el("span", { class: "key-icon", "aria-hidden": "true" }, createIcon("reload")), this.plate.sprite("reload", "reload-up"), (down) => `reload-${down ? "down" : "up"}`);
    this.hold = new PressKey(this.plate, KEY_ZONES.hold, t("weapon.hold"), setup.onHold, el("span", { class: "key-icon", "aria-hidden": "true" }, createIcon("hold")), this.plate.sprite("hold", "hold-up"), (down) => `hold-${down ? "down" : "up"}`);
    this.autoFrames = this.plate.sprite("auto", "auto-off");
    this.auto = this.plate.zone(plateKey("baked-key auto-key", labels.autoFire, setup.onAuto), "autoHit");
    this.plate.zone(el("span", { class: "plate-label auto-label" }, labels.autoFire), "autoText");
    this.pageMark = el("button", { type: "button", class: "gun-page" }) as HTMLButtonElement;
    this.pageMark.addEventListener("click", () => this.flip());
    this.screen.append(this.grid, this.pageMark);
    this.plate.zone(this.screen, "screen");
    this.root = el("div", { class: "hud-weapons" }, deviceCast(), this.plate.root);
  }

  update(view: WeaponsView): void {
    this.lastView = view;
    this.drawGuns(view.guns);
    this.drawUtilities(view.utilities);
    this.autoFrames.show(view.auto.on ? "auto-on" : "auto-off");
    setFlag(this.auto, "on", view.auto.on);
    setFlag(this.all.button, "on", view.all.on);
    showControl(this.all.button, { title: view.all.title, reason: view.all.reason, key: "0" });
    showControl(this.reload.button, { title: t("weapon.reloadKeyHint"), reason: view.reload.reason });
    showControl(this.hold.button, { title: t("weapon.holdHint"), reason: view.hold.reason });
    this.auto.setAttribute("aria-pressed", String(view.auto.on));
    showControl(this.auto, { title: view.auto.title, reason: view.auto.reason, key: "Q" });
  }

  allKey(): HTMLElement {
    return this.all.button;
  }

  autoKey(): HTMLElement {
    return this.auto;
  }

  gunControl(i: number): HTMLElement | null {
    return this.cards[i]?.root ?? null;
  }

  utilityControl(i: number): HTMLElement | null {
    return this.slots[i]?.root ?? null;
  }

  private flip(): void {
    const pages = Math.ceil(this.cards.length / GUNS_PER_PAGE);
    this.page = (this.page + 1) % Math.max(1, pages);
    if (this.lastView) this.showPage(this.lastView);
  }

  private drawGuns(guns: GunCellView[]): void {
    const key = guns.map((gun) => gun.defId).join("|");
    if (key !== this.gunKey) {
      this.gunKey = key;
      this.cards = guns.map((gun, i) => new GunCard(i, gun.defId, gun.name, () => this.setup.onPickGun(i)));
      this.page = 0;
    }
    guns.forEach((gun, i) => this.cards[i].update(gun));
    this.page = Math.min(this.page, Math.max(0, Math.ceil(guns.length / GUNS_PER_PAGE) - 1));
    this.showPage(this.lastView!);
  }

  private showPage(view: WeaponsView): void {
    const pages = Math.max(1, Math.ceil(this.cards.length / GUNS_PER_PAGE));
    const first = this.page * GUNS_PER_PAGE;
    const shown = Array.from({ length: GUNS_PER_PAGE }, (_, i) => this.cards[first + i]?.root ?? ghostCard(first + i));
    if (shown.some((node, i) => this.grid.children[i] !== node)) this.grid.replaceChildren(...shown);
    setFlag(this.pageMark, "hidden", pages < 2);
    if (pages > 1) {
      setText(this.pageMark, t("hud.gunPage", { page: this.page + 1, pages }));
      setAttrText(this.pageMark, "title", view.pageTitle(this.page + 1, pages));
      setAttrText(this.pageMark, "aria-label", view.pageTitle(this.page + 1, pages));
    }
  }

  private drawUtilities(utilities: UtilitySlotView[]): void {
    if (utilities.length > UTILITY_SLOTS) throw new Error(`The utility strip holds ${UTILITY_SLOTS} slots, got ${utilities.length}`);
    while (this.slots.length < utilities.length) {
      const index = this.slots.length;
      const slot = new UtilitySlot(() => this.setup.onUtility(index));
      this.slots.push(slot);
      this.plate.zone(slot.root, `slot${index}`);
    }
    while (this.slots.length > utilities.length) this.plate.unzone(this.slots.pop()!.root);
    utilities.forEach((utility, i) => this.slots[i].update(utility));
    this.plates.forEach((frames, i) => (i < utilities.length ? frames.show(`slot${i}`) : frames.hide()));
  }
}
