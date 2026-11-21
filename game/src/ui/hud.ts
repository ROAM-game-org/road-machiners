
import { ESCAPE, keyTip, RECENTER_KEY, touchMode } from "./input-mode";
import { LOOK_OVER } from "../data/npcs";
import { uiSize } from "./ui-size";
import { escortStatus, type EscortContract } from "../sim/escort-job";
import { callError, DialoguePanel, type DialogueHost } from "./dialogue";
import { markError } from "../sim/detect";
import { hasExplorationMap, modeRules } from "../sim/settings";
import type { CrimeCase, GameEvent, Vehicle, World, Refusal } from "../sim/types";
import { caseOwed, knownCasesOn } from "../sim/crime";
import { workOf, type Work } from "../sim/states";
import { isAutoPatch, type FirstAidBlock } from "../sim/jobs";
import { gaveUp } from "../sim/defeat";
import { bottomLeft, dashRail, disabledWith, el, markDisabled, panel, replaceChanged, rightColumn, rightDock, topCenter, topLeft, topRight, uiRoot } from "./dom";
import { DrivePanel, type CoolView, StatsStrip, SystemKeys, type SystemKey, type SystemKeyView, dialEnd, dashFit, wheelFrame } from "./dash/panels";
import { mountScrollWheels, SCROLL_SCREENS } from "./scroll-wheel";
import { closeKey, controls, panelHead, rockerButton, screen, screenLine, setAttrText, textKey, type RockerView } from "./dash/skin";
import type { FeedbackLinks } from "./game-menu";
import type { RadioDeck } from "./dash/panels";
import { fuelCap } from "../sim/stats";
import { LogPanel, readSavedLog, type SavedLog } from "./log";
import { logViewSetting } from "./log-setting";
import { eventEntry, leveled, type LogEntry, type LogLevel } from "./log-levels";
import {
  claimRivalMark,
  escortStatusText,
  dockSummary,
  guardLeavesIn,
  heldContractClock,
  heldContractDeadline,
  contractSummary,
  surveyProgress,
  isNotable,
  surveyClueLines,
  formatNpcPass,
  formatNpcCargo,
  formatNpcMarked,
  formatNpcTraits,
  wantedBounty,
  formatCardState,
  clock,
  stanceTag,
  caseVictimName,
} from "./format";
import { FEEDBACK_URL } from "../config";
import { gameContext } from "../three/error-report";
import { FeedbackForm } from "./feedback-form";
import { getHudReadout, getRescueReadout, overdriveSwitch, type Readout, type RescueReadout } from "./hud-readout";
import { createIcon, repairingPart } from "./cards";
import { aimMarks, orderLock, type AimState } from "./weapons";
import { token } from "./tokens";
import { bakedStrip } from "./dash/baked";
import { BAKED } from "./dash/baked";
import { placeDeviceCasts } from "./dash/skin";
import { Tips, type TipSwitch } from "./tips";
import { fuelLiters, hp, kph, moneyEl } from "./units";
import { isPlayerTruck, playerVehicle } from "../sim/damage";
import { playerGuard } from "../sim/hire";
import { affordableRanks, basicSkill, hasBasic, hasPerk, pendingPerkPairs } from "../sim/progress";
import { knowsCargo, lookOverError } from "../sim/look-over";
import { douseBlock, type DouseBlock } from "../sim/engine-heat";
import { firstAidTurnSupplies } from "../sim/health";
import { ENGINE_HEAT } from "../data/wear";
import type { RadioPanel } from "./radio";
import { HaulerGauge } from "./hauler-gauge";
import { type ConditionAim, TruckConditionView } from "./truck-condition-view";
import type * as THREE from "three";
import { PORTRAIT_STEP_MS, TruckPortraits } from "../three/render/truckPortrait";
import { GARAGE_STEP_MS, GarageRenders } from "../three/render/garageRender";
import { PixelReadback } from "../three/render/pixelReadback";
import type { GpuContext } from "../three/gpu-context";
import { backgroundNeeds } from "./garage-draw";
import { setText } from "../text/language";
import { list, SPACE, t, type Msg } from "../text/msg";
import { isLate, isMet, type Contract } from "../sim/market";
import { driverName, factionName, refusalText, siteName, templateName, vehicleTitle } from "../text/names";

export type ContextTarget =
  | { kind: 'aid'; id: string }
  | { kind: 'trade'; id: string }
  | { kind: 'parcel'; id: string }
  | { kind: 'shop' }
  | { kind: 'downed'; id: string }
  | { kind: 'stock'; id: string }
  | { kind: 'survey'; id: string; contractId: string }
  | { kind: 'loot'; id: string }
  | { kind: 'outpost' };
export type ContextAction = { label: Msg; ready: boolean; target: ContextTarget; hint?: Msg; combat?: number };

export function actionSlot(action: ContextAction | null, shown: unknown, status: Msg | null): "action" | "status" | "none" {
  if (action) return shown ? "none" : "action";
  return status && !shown ? "status" : "none";
}

export function contextKey(target: ContextTarget): string {
  return 'id' in target ? `${target.kind}:${target.id}` : target.kind;
}

export function actionBlockReason(action: ContextAction): Msg | undefined {
  if (action.hint) return action.hint;
  if (action.combat !== undefined) return combatBlocked(action.combat);
  return action.ready ? undefined : t("hud.stopToUse");
}

function douseMsg(w: World, block: DouseBlock | null): Msg | null {
  if (block === null) return null;
  if (block === "noBasic") return refusalText(w, { id: "needsBasic", skill: basicSkill("overdrive") });
  if (block === "noSupplies") return t("hud.needSupplies", { n: ENGINE_HEAT.douseSupplies });
  return null;
}

export interface DriveControls {
  manual: RockerView;
  lights: RockerView;
  overdrive: RockerView;
  cool: CoolView;
}

function rocker(lock: Msg | null, checked: boolean, title: Msg, reason: Msg | null = null, locked = false): RockerView {
  return { checked, title, reason: lock ?? reason, locked };
}

export function driveControlsOf(w: World, manual: boolean, headlights: boolean): DriveControls {
  const lock = orderLock(w);
  const od = overdriveSwitch(w);
  const block = douseBlock(w);
  return {
    manual: rocker(lock, manual, t("hud.manualTitle")),
    lights: rocker(lock, headlights, t("hud.lightsTitle")),
    overdrive: rocker(lock, od.checked, od.title, od.reason, od.locked),
    cool: { title: t("hud.coolTitle"), reason: lock ?? douseMsg(w, block), locked: block === "noBasic" },
  };
}

export function systemViewsOf(w: World): Record<SystemKey, SystemKeyView> {
  const marked = characterMarked(w);
  return {
    menu: { title: t("menu.menu"), reason: null, marked: false, key: "Esc" },
    car: { title: t("hud.inventoryTitle"), reason: null, marked: false, key: "I" },
    character: { title: marked ? t("hud.driverPerk") : t("hud.driver"), reason: null, marked, key: "C" },
    map: { title: t("map.full"), reason: mapBlock(w), marked: false, key: "M", hidden: !hasExplorationMap(w) },
    journal: { title: t("hud.journal"), reason: null, marked: false, key: "J" },
  };
}

function characterMarked(w: World): boolean {
  return pendingPerkPairs(w).length > 0 || affordableRanks(w).length > 0;
}

function mapBlock(w: World): Msg | null {
  return hasExplorationMap(w) ? null : t("hud.noMap");
}

export function firstAidMsg(w: World, block: FirstAidBlock | null): Msg | null {
  if (block === null) return null;
  if (block === "noBasic") return refusalText(w, { id: "needsBasic", skill: basicSkill("firstAid") });
  if (block === "noSupplies") return t("hud.needSupplies", { n: Math.ceil(firstAidTurnSupplies(w)) });
  const job = playerVehicle(w).job;
  if (block === "busy" && job) return refusalText(w, { id: "busy", job: job.kind });
  return refusalText(w, { id: block === "busy" ? "stopFirst" : block });
}

export const combatBlocked = (turns: number): Msg => t("hud.combatBlocked", { n: turns });

type HudActions = {
  openMenu: () => void;
  openInventory: () => void;
  openCharacter: () => void;
  openJournal: () => void;
  openMap: () => void;
  toggleManual: () => void;
  toggleAutoRepair: () => void;
  toggleOverdrive: () => void;
  toggleHeadlights: () => void;
  headlightsOn: () => boolean;
  douseEngine: () => void;
  firstAid: () => void;
  unhitch: () => void;
  setBeacon: (on: boolean) => void;
  endRun: () => void;
  autoTravel: () => boolean;
  dialogue: DialogueHost;
  recenter: () => void;
  unpin: () => void;
  cardAction: (action: CardAction) => void;
  aimPart: (vehicleId: string, partId: string) => void;
  aimState: (vehicleId: string) => AimState;
};
export type CardAction = 'mark' | 'lookOver';

const TOAST_MS = 3500;
const CONDITION_LENGTH_M = 7.8;


export class Hud {
  private readonly drive: DrivePanel;
  private playedSpeed: number | null = null;
  private settledSpeed = 0;
  private readonly stats = new StatsStrip(t("hud.kg"));
  private readonly system: SystemKeys;
  private readonly portraits: TruckPortraits;
  readonly garage: GarageRenders;
  private garageWorld: World | null = null;
  private readonly condition: TruckConditionView;
  private haulerGauge = new HaulerGauge();
  private readonly inspected: TruckConditionView;
  private readonly inspectedDraw: HTMLElement;
  private inspectedId: string | null = null;
  private readonly zoomOutKey = el("button", { class: "hud-key icon-key", title: t("map.zoomOut"), "aria-label": t("map.zoomOut"), onclick: () => this.inspected.zoomStep(-1) }, createIcon("minus"));
  private readonly zoomInKey = el("button", { class: "hud-key icon-key", title: t("map.zoomIn"), "aria-label": t("map.zoomIn"), onclick: () => this.inspected.zoomStep(1) }, createIcon("plus"));
  private readonly zoomKeys = el("div", { class: "hud-keybed info-zoom" }, this.zoomOutKey, this.zoomInKey);
  private infoColumn = el("div", { class: "info-column" });
  private contracts = panel("contracts dock-panel hud-panel", rightDock());
  private wanted = panel("wanted dock-panel hud-panel", rightDock());
  private log = new LogPanel();
  private info = panel("info hud-panel");
  private infoBody = el("div", { class: "info-content" });
  private feedbackForm = new FeedbackForm(uiRoot(), (text) => this.toast(text), (url, init) => fetch(url, init), FEEDBACK_URL, gameContext);
  private action = panel("action");
  private siteStatus = panel("status-mark site-status hud-panel");
  private toastBox = panel("toast hud-panel");

  private toastScreen = this.toastBox.appendChild(el("p", { class: "metal-line" }));
  private rescue = panel("rescue notice hud-panel", topCenter());
  private knockedOut = panel("status-mark hud-panel", topCenter());
  private truckStack = el("div", { class: "truck-stack" });
  private stranded = panel("stranded notice hud-panel", this.truckStack);
  private recenter = panel("recenter", bottomLeft());
  private tips = new Tips(window.localStorage, topCenter(), () => this.toast(t("hud.tipsOff")));
  private toastTimer: number | null = null;

  private readonly dialogue: DialoguePanel;

  private side: HTMLElement | null = null;
  private sideWasShown = false;
  private infoPlacedFor: string | null = null;
  private placeWatch: ResizeObserver | null = null;

  private sideShown(): boolean {
    return this.side !== null && this.side.style.display !== "none" && this.side.classList.contains("journal-side");
  }

  private infoShown(): boolean {
    return this.info.style.display !== "none";
  }

  private fitDash = (): void => {
    const n = (name: string): number => parseFloat(token(name));
    const fit = dashFit(uiSize().layerSize(), { drive: n("--hud-drive-n"), weapons: n("--hud-weapons-n"), radio: n("--hud-radio-n"), tray: n("--hud-tray-h"), gap: n("--hud-gap") });
    uiRoot().style.setProperty("--hud-zoom", String(fit.zoom));
    uiRoot().style.setProperty("--hud-row-gap", `${fit.gap}px`);
  };

  placeSide = (node: HTMLElement | null = this.side): void => {
    this.side = node;
    this.sideWasShown = this.sideShown();
    if (this.side) this.side.style.visibility = "";
    if (!this.sideShown()) {
      this.side?.style.removeProperty("top");
      this.side?.style.removeProperty("height");
      return this.coverUnder(this.infoShown() ? uiSize().layerRect(this.info).bottom : null);
    }
    const side = this.side!;
    side.style.visibility = this.infoShown() ? "hidden" : "";
    const top = uiSize().layerRect(topRight()).bottom + parseFloat(token("--hud-gap"));
    side.style.top = `${top}px`;
    side.style.height = `${Math.max(this.sideFloor(side) - top, 0)}px`;
    if (!this.infoShown()) this.coverUnder(uiSize().layerRect(side).bottom);
  };

  sideMoved(node: HTMLElement): void {
    if (node !== this.side) {
      this.placeWatch?.observe(node);
      this.placeSide(node);
    } else if (this.sideShown() !== this.sideWasShown) this.placeSide();
  }

  private clearOfDock(floor: number, card: HTMLElement): number {
    const deck = uiSize().layerRect(this.deck.root);
    return deck.left < uiSize().layerRect(card).right ? Math.min(floor, deck.top - parseFloat(token("--hud-gap"))) : floor;
  }

  private sideFloor(side: HTMLElement): number {
    return this.clearOfDock(uiSize().layerSize().height, side);
  }

  private placeInfo = (): void => {
    if (this.info.style.display === "none" || this.info.getClientRects().length === 0) return;
    const gap = parseFloat(token("--hud-gap"));
    const top = uiSize().layerRect(topRight()).bottom + gap;
    this.info.style.top = `${top}px`;
    this.info.style.maxHeight = `${this.clearOfDock(this.floorOfInfo(), this.info) - top}px`;
    this.coverUnder(uiSize().layerRect(this.info).bottom);
    this.placeSide();
    this.inspected.fitTo(this.inspectedDraw);
  };

  private placeQueued = false;

  private placeSoon(): void {
    if (this.placeQueued) return;
    this.placeQueued = true;
    requestAnimationFrame(() => {
      this.placeQueued = false;
      this.placeDock();
      this.placeInfo();
      this.placeSide();
      this.capCondition();
      placeDeviceCasts();
    });
  }

  private placeDock(): void {
    const gap = parseFloat(token("--hud-gap"));
    const top = uiSize().layerRect(topRight()).bottom + gap;
    rightDock().style.maxHeight = `${Math.max(uiSize().layerRect(this.deck.root).top - gap - top, 0)}px`;
  }

  private capCondition(): void {
    const others = uiSize().layerRect(this.truckStack).height - uiSize().layerRect(this.condition.root).height;
    this.condition.capHeight(this.conditionRoom() - others);
  }

  private conditionRoom(): number {
    const top = uiSize().layerRect(topLeft()).bottom + parseFloat(token("--hud-gap"));
    return uiSize().layerRect(bottomLeft()).top - parseFloat(token("--space-4")) - top;
  }

  private floorOfInfo(): number {
    return uiSize().layerRect(this.deck.root).top;
  }


  private coverUnder(bottom: number | null): void {
    for (const below of [...rightDock().children] as HTMLElement[]) {
      below.style.visibility = bottom !== null && bottom > uiSize().layerRect(below).top ? "hidden" : "";
    }
  }

  constructor(private actions: HudActions, private radio: RadioPanel, private deck: RadioDeck, renderer: THREE.WebGLRenderer, gpu: GpuContext) {
    this.followLogView();
    this.drive = new DrivePanel({
      labels: { manual: t("hud.manual"), lights: t("hud.lightsOn"), overdrive: t("hud.overdrive"), cool: t("hud.coolKey"), speedUnit: t("hud.kph") },
      onManual: () => actions.toggleManual(),
      onLights: () => actions.toggleHeadlights(),
      onOverdrive: () => actions.toggleOverdrive(),
      onCool: () => actions.douseEngine(),
    });
    this.system = new SystemKeys(
      { map: t("map.full"), journal: t("hud.journal"), car: t("hud.inventoryTitle"), character: t("hud.character"), menu: t("menu.menu") },
      { map: () => actions.openMap(), journal: () => actions.openJournal(), car: () => actions.openInventory(), character: () => actions.openCharacter(), menu: () => actions.openMenu() },
    );
    topLeft().prepend(this.stats.root);
    topRight().prepend(this.system.root);
    const rail = dashRail();
    if (!rail.firstChild) rail.append(bakedStrip("rail", BAKED.rail));
    bottomLeft().prepend(this.drive.root);
    this.deck.talk.append(radio.root);
    this.deck.log.append(this.log.root);
    this.deck.bindLog(this.log.lines);
    mountScrollWheels(uiRoot(), SCROLL_SCREENS, wheelFrame);
    rightColumn().append(this.deck.root);
    const readback = new PixelReadback(renderer, gpu);
    this.portraits = new TruckPortraits(renderer, gpu, readback);
    this.garage = new GarageRenders(renderer, gpu, readback);
    this.condition = new TruckConditionView(this.portraits, CONDITION_LENGTH_M);
    this.inspected = new TruckConditionView(this.portraits, CONDITION_LENGTH_M, { magnify: (state) => this.markZoomKeys(state) });
    this.portraits.onReady((vehicleId) => {
      if (vehicleId === this.inspectedId) this.placeInfo();
    });
    this.inspectedDraw = el("div", { class: "info-draw" }, this.inspected.root);
    this.truckStack.append(this.condition.root, this.haulerGauge.root);
    bottomLeft().append(this.truckStack);
    this.dialogue = new DialoguePanel(actions.dialogue);
    this.info.style.display = "none";
    this.info.append(this.infoBody);
    this.contracts.style.display = "none";
    const placeWatch = new ResizeObserver(() => this.placeSoon());
    this.placeWatch = placeWatch;
    const watched = [rightDock(), this.inspectedDraw, bottomLeft(), topRight(), topLeft(), this.deck.root, this.info, this.truckStack, this.condition.root, this.contracts, this.wanted];
    watched.forEach((node) => placeWatch.observe(node));
    this.fitDash();
    window.addEventListener("resize", this.fitDash);
    uiSize().subscribe(this.fitDash);
    window.addEventListener("resize", this.placeInfo);
    window.addEventListener("resize", () => this.placeSide());
    window.addEventListener("resize", () => this.placeSoon());
    this.toastBox.style.display = "none";
    this.rescue.style.display = "none";
    this.knockedOut.style.display = "none";
    this.siteStatus.style.display = "none";
    this.stranded.style.display = "none";
    this.recenter.style.display = "none";
    this.recenter.append(el("div", { class: "tooltip hover-tip recenter-tip", role: "button", onclick: () => actions.recenter() }, keyTip(t("hud.recenter"), RECENTER_KEY)));
  }

  systemKey(name: SystemKey): HTMLButtonElement {
    return this.system.button(name);
  }

  feedbackOpen(): boolean {
    return this.feedbackForm.isOpen();
  }

  openFeedback(): void {
    this.feedbackForm.open("bug");
  }

  feedbackLinks(): FeedbackLinks {
    return { report: () => this.openFeedback(), reportOpen: () => this.feedbackOpen() };
  }

  showSpeed(speed: number | null): void {
    if (speed === null && this.playedSpeed === null) return;
    this.playedSpeed = speed;
    this.drive.showSpeed(speed ?? this.settledSpeed);
  }

  showRecenter(on: boolean): void {
    this.recenter.style.display = on ? "" : "none";
  }

  tipSwitch(): TipSwitch {
    return { isOn: () => this.tips.isOn(), setOn: (on) => this.tips.setOn(on) };
  }

  getInspectionRoot(): HTMLElement {
    return this.info;
  }

  getExchangeRoot(): HTMLElement {
    return this.infoColumn;
  }

  private toast(text: Msg, refusal = false): void {
    setText(this.toastScreen, text);
    this.toastBox.classList.toggle("bad", refusal);
    this.toastBox.style.display = "";
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(
      () => (this.toastBox.style.display = "none"),
      TOAST_MS,
    );
  }

  renderAction(
    action: ContextAction | null,
    count: number,
    index: number,
    world: World,
    onUse: () => void,
    onCycle: (step: 1 | -1) => void,
    status: Msg | null,
  ): void {
    const me = playerVehicle(world);
    const shown = shownWork(action, workOf(world, me));
    const slot = actionSlot(action, shown, status);
    this.action.style.display = slot === "action" ? "" : "none";
    this.siteStatus.style.display = slot === "status" ? "" : "none";
    if (slot === "action" && action) this.renderActionButton(action, count, index, onUse, onCycle);
    if (slot === "status" && status) replaceChanged(this.siteStatus, screen(screenLine("dim", status)));
  }

  private renderActionButton(action: ContextAction, count: number, index: number, onUse: () => void, onCycle: (step: 1 | -1) => void): void {
    const use = el(
      "button",
      {
        ...disabledWith(action.ready ? null : (actionBlockReason(action) ?? null), onUse),
        title: keyTip(action.label, "E"),
        class: action.combat !== undefined ? "hud-key on" : "hud-key",
      },
      el("span", { class: "key-label" }, action.label),
    );
    const cycle = (step: 1 | -1, icon: "prev" | "next", key: string) =>
      el("button", { class: "hud-key icon-key cycle", title: touchMode() ? undefined : t("hud.cycleKey", { key }), "aria-label": t(icon === "prev" ? "icon.prev" : "icon.next"), onclick: () => onCycle(step) }, createIcon(icon));
    replaceChanged(
      this.action,
      ...(count > 1
        ? [cycle(-1, "prev", "←"), use, el("span", { class: "count hud-engraved" }, t("hud.count", { n: index + 1, of: count })), cycle(1, "next", "→")]
        : [use]),
    );
  }

  renderRescue(w: World, callShown = true): void {
    this.dialogue.render(w, callShown);
    const r = getRescueReadout(w);
    const down = rescueOf(r, "knockedOut");
    this.knockedOut.style.display = down ? "" : "none";
    if (down) this.knockedOut.replaceChildren(screen(screenLine("bad", t(gaveUp(playerVehicle(w)) ? "npc.gaveUp" : "actBlock.knockedOut"))));
    this.renderMiddle(rescueOf(r, "towed") ?? rescueOf(r, "dragged"));
    this.renderStranded(rescueOf(r, "stranded"));
  }

  private renderMiddle(r: Extract<RescueReadout, { kind: "towed" | "dragged" }> | null): void {
    this.rescue.style.display = r ? "" : "none";
    if (!r) return this.rescue.replaceChildren();
    this.rescue.replaceChildren(
      panelHead(t("hud.underTow")),
      ...(r.kind === "towed" ? [screen(screenLine(null, t("hud.towsYou", { who: r.tower, town: r.town })), screenLine("dim", t("hud.fee"), SPACE, moneyEl(r.fee)))] : []),
      controls(textKey(t("hud.unhitch"), { onclick: () => this.actions.unhitch() })),
    );
  }

  private renderStranded(r: Extract<RescueReadout, { kind: "stranded" }> | null): void {
    this.stranded.style.display = r ? "" : "none";
    if (!r) return this.stranded.replaceChildren();
    this.stranded.replaceChildren(
      panelHead(t("hud.stranded")),
      ...(r.reason ? [screen(screenLine(null, r.reason))] : []),
      controls(r.canEnd ? textKey(t("hud.endRun"), { onclick: () => this.actions.endRun() }, true) : beaconRocker(r.beacon, () => this.actions.setBeacon(!r.beacon))),
    );
  }

  private renderWanted(w: World): void {
    const cases = knownCasesOn(w, w.player.vehicleId);
    this.wanted.style.display = cases.length > 0 ? "" : "none";
    if (cases.length === 0) return this.wanted.replaceChildren();
    const owed = cases.reduce((sum, c) => sum + caseOwed(c), 0);
    this.wanted.tabIndex = 0;
    replaceChanged(
      this.wanted,
      el("div", { class: "wanted-cases" }, ...cases.map((c) => wantedRow(w, c))),
      panelHead(t("hud.wanted")),
      screen(screenLine("bad", el("span", { class: "num wanted-owed" }, moneyEl(owed)))),
    );
  }

  private renderContracts(w: World): void {
    const guard = playerGuard(w);
    if (w.player.contracts.length === 0 && guard === null) {
      this.contracts.style.display = "none";
      return;
    }
    this.contracts.style.display = "";
    replaceChanged(
      this.contracts,
      panelHead(t("hud.contracts")),
      screen(...w.player.contracts.map((c) => heldContractLine(w, c)), ...(guard ? [guardLine(w, guard.merc, guard.turnsLeft)] : [])),
    );
  }

  renderTop(w: World, live: World): void {
    const readout = getHudReadout(w);
    this.condition.render(playerVehicle(w), w.player.paint, undefined, repairingPart(w, playerVehicle(w)));
    this.haulerGauge.render(w);
    this.renderContracts(w);
    this.renderWanted(w);
    this.tips.update(w, this.actions.autoTravel());
    requestAnimationFrame(() => this.tips.place());
    const me = playerVehicle(live);
    const pace = me.order && me.order.kind !== "brake" ? me.order.pace : undefined;
    const mark = me.direct ? me.setSpeed : pace;
    this.renderDrive(w, readout, mark === undefined ? null : kph(mark));
    this.renderStats(w, readout);
    this.system.update(systemViewsOf(w));
  }

  private renderDrive(w: World, readout: ReturnType<typeof getHudReadout>, pace: number | null): void {
    const fuel = readout.resources.find((r) => r.id === "fuel")!;
    const engine = readout.survival.find((r) => r.id === "engine")!;
    const p = w.player;
    this.settledSpeed = readout.speed;
    this.drive.update({
      speed: this.playedSpeed ?? readout.speed,
      top: dialEnd(readout.dialTop),
      max: readout.maxSpeed,
      pace,
      speedTitle: t("hud.speedTitle", { n: readout.speed, top: readout.maxSpeed }),
      speedLines: readout.maxSpeedTip,
      fuel: p.fuel / fuelCap(playerVehicle(w)),
      fuelTitle: t("hud.fuelTitle", { label: fuel.label, level: fuelLiters(p.fuel), tank: fuelLiters(fuelCap(playerVehicle(w))) }),
      fuelWarn: fuel.warning,
      heat: p.engineHeat,
      heatTitle: t("hud.readout", { label: t("readout.engineHeat"), value: engine.value }),
      heatWarn: engine.warning,
      ...driveControlsOf(w, readout.manual, this.actions.headlightsOn()),
    });
  }

  private renderStats(w: World, readout: ReturnType<typeof getHudReadout>): void {
    const of = (id: string) => readout.resources.find((r) => r.id === id)!;
    const money = of("money");
    const supplies = of("supplies");
    const titled = (r: Readout) => (r.warning ? t("hud.readoutWarning", { label: r.label, value: r.value }) : t("hud.readout", { label: r.label, value: r.value }));
    this.stats.update({
      money: money.balance!,
      moneyTitle: titled(money),
      supplies: Math.round(w.player.supplies),
      suppliesTitle: t("readout.supplies"),
      suppliesTone: supplies.warning ? "warn" : "base",
      health: hp(w.player.health),
      healthTitle: t("hud.driverHealth"),
    });
  }

  private cardButtons(w: World, v: Vehicle): HTMLElement | null {
    return cardActions(w, v, {
      call: () => this.dialogue.callInspected(),
      act: (action) => this.actions.cardAction(action),
    });
  }

  flushHorn(): void {
    this.dialogue.flushHorn();
  }

  pushEvents(w: World, events: readonly GameEvent[] = w.events): void {
    this.logHeld(w, events);
    if (w.events.some((e) => e.t === 'sunwardFallen')) this.toast(t('log.sunwardFallen'));
    this.radio.hear(w);
  }

  logHeld(w: World, events: readonly GameEvent[]): void {
    const lines: LogEntry[] = [];
    for (const e of events) {
      const line = eventEntry(w, e);
      if (!line) continue;
      lines.push(line);
      if (isNotable(e) && !w.player.quests.live) this.toast(line.text);
    }
    this.log.add(w.turn, lines);
  }

  savedLog(): SavedLog {
    return this.log.saved();
  }

  restoreLog(saved: unknown): void {
    this.log.restore(readSavedLog(saved));
  }

  private followLogView(): void {
    const setting = logViewSetting();
    this.log.view(setting.view());
    setting.subscribe(() => this.log.view(setting.view()));
  }

  logTexts(): string[] {
    return this.log.texts;
  }

  refuse(text: Msg): void {
    this.toast(text, true);
  }

  note(w: World, text: Msg, cls: string, level: LogLevel): void {
    this.log.add(w.turn, [leveled({ text, cls }, level)]);
  }

  private aimOf(w: World, v: Vehicle): ConditionAim | undefined {
    if (isPlayerTruck(w, v)) return undefined;
    if (this.actions.aimState(v.id).locked) return undefined;
    return { marks: aimMarks(w, v.id), pick: (partId) => this.actions.aimPart(v.id, partId) };
  }

  private wantPortraits(w: World, focus: Vehicle | null): void {
    const me = playerVehicle(w);
    const opened = focus && focus.id !== me.id ? [focus] : [];
    this.portraits.want([me], opened, focus?.id ?? null, w.player.paint);
    if (this.garageWorld !== w) this.garage.want(backgroundNeeds(w));
    this.garageWorld = w;
  }

  stepPortraits(playing: boolean, garageShown: boolean): void {
    this.portraits.step(PORTRAIT_STEP_MS, playing);
    if (garageShown && !playing) this.garage.step(GARAGE_STEP_MS);
  }

  portraitSettled(vehicleId: string): boolean {
    return this.portraits.settled(vehicleId);
  }

  private infoHead(w: World, v: Vehicle, pinned: boolean): HTMLElement {
    const head = panelHead(v.brain ? driverName(v) : vehicleTitle(w, v));
    head.append(this.zoomKeys);
    if (!pinned) return head;
    const key = closeKey({ label: t("card.unpin"), onClose: () => this.actions.unpin() });
    setAttrText(key, "title", keyTip(t("card.unpin"), ESCAPE.key));
    head.append(key);
    return head;
  }

  private markZoomKeys(state: { canZoomIn: boolean; canZoomOut: boolean }): void {
    markDisabled(this.zoomInKey, state.canZoomIn ? null : t("map.zoomedIn"));
    markDisabled(this.zoomOutKey, state.canZoomOut ? null : t("card.zoomedOut"));
  }

  showInfo(w: World, v: Vehicle | null, hostile: boolean, pinned = false): void {
    if (v && (v.id !== this.inspectedId || this.info.style.display === "none")) this.inspected.resetZoom();
    this.inspectedId = v?.id ?? null;
    this.wantPortraits(w, v);
    if (!v) {
      this.info.style.display = "none";
      if (this.infoPlacedFor !== null) this.placeSide();
      this.infoPlacedFor = null;
      return;
    }
    const aim = this.aimOf(w, v);
    this.inspected.render(v, w.player.paint, aim);
    this.info.style.display = "";
    this.infoBody.replaceChildren(
      this.infoHead(w, v, pinned),
      screen(infoFacts(w, v, hostile), el("div", { class: "info-state" }, wantedMark(w, v), formatCardState(w, v)), ...quietLines(w, v).map((line) => screenLine("dim", line))),
      el("div", { class: "info-body" }, this.inspectedDraw, this.infoColumn),
      this.cardButtons(w, v) ?? controls(),
    );
    if (v.id !== this.infoPlacedFor) this.placeInfo();
    this.infoPlacedFor = v.id;
  }
}

function beaconRocker(on: boolean, flip: () => void): HTMLElement {
  const rocker = rockerButton(t("hud.beaconTitle"));
  rocker.setAttribute("aria-checked", String(on));
  rocker.classList.toggle("on", on);
  setAttrText(rocker, "title", t("hud.beaconTitle"));
  rocker.addEventListener("click", flip);
  return el("span", { class: "beacon-switch" }, rocker, el("span", { class: "hud-engraved" }, t(on ? "hud.beaconOn" : "hud.beaconOff")));
}

function rescueOf<K extends RescueReadout["kind"]>(r: RescueReadout | null, kind: K): Extract<RescueReadout, { kind: K }> | null {
  return r?.kind === kind ? (r as Extract<RescueReadout, { kind: K }>) : null;
}

function infoFacts(w: World, v: Vehicle, hostile: boolean): HTMLElement | null {
  if (v.faction === "player") return null;
  const quiet = [v.brain ? templateName(v.brain.templateId) : null, factionName(v.faction)].filter((part) => part !== null);
  return el("div", { class: "info-facts" }, el("span", { class: "dim" }, list(quiet)), el("span", { class: `tag ${hostile ? "bad" : "dim"}` }, stanceTag(w, v, hostile)));
}

export interface CardHandlers {
  call: () => void;
  act: (action: "mark" | "lookOver") => void;
}

function actionButton(label: Msg, key: string, refusal: Msg | null, onclick: () => void, tip: Msg = label): HTMLElement[] {
  return [el("button", { class: "hud-key", ...disabledWith(refusal, onclick), title: keyTip(refusal ?? tip, key) }, el("span", { class: "key-label" }, label))];
}

export function cardActions(w: World, v: Vehicle, handlers: CardHandlers): HTMLElement | null {
  const buttons: HTMLElement[] = v.faction === "player" ? [] : otherTruckButtons(w, v, handlers);
  return buttons.length === 0 ? null : el("div", { class: "info-actions hud-controls", "data-count": buttons.filter((b) => b.tagName === "BUTTON").length }, ...buttons);
}

function otherTruckButtons(w: World, v: Vehicle, handlers: CardHandlers): HTMLElement[] {
  const buttons: HTMLElement[] = [];
  if (v.brain && modeRules(w).radio) buttons.push(...actionButton(t("card.call"), "T", callError(w, v.id), handlers.call));
  if (hasBasic(w, "lookOver")) buttons.push(...lookOverButton(w, v, handlers));
  if (hasPerk(w, "spotter")) buttons.push(...actionButton(t("card.mark"), "N", reasonOf(w, markError(w, v.id)), () => handlers.act("mark")));
  return buttons;
}

function lookOverButton(w: World, v: Vehicle, handlers: CardHandlers): HTMLElement[] {
  if (knowsCargo(w, playerVehicle(w), v)) return actionButton(t("card.lookOver"), "B", null, () => handlers.act("lookOver"));
  return actionButton(t("card.lookOver"), "B", reasonOf(w, lookOverError(w, v.id)), () => handlers.act("lookOver"), t("card.lookOverTip", { n: LOOK_OVER.turns }));
}

function reasonOf(w: World, refusal: Refusal | null): Msg | null {
  return refusal && refusalText(w, refusal);
}

function wantedMark(w: World, v: Vehicle): HTMLElement | null {
  const owed = wantedBounty(w, v);
  return owed === null ? null : el("span", { class: "info-wanted" }, el("span", { class: "tag dim" }, t("hud.wanted")), el("span", { class: "num" }, moneyEl(owed)));
}

function quietLines(w: World, v: Vehicle): Msg[] {
  if (!v.brain) return [];
  return [formatNpcPass(w, v), formatNpcTraits(w, v), formatNpcCargo(w, v), formatNpcMarked(w, v)].filter((line) => line !== null);
}

function shownWork(action: ContextAction | null, work: Work | null): Work | null {
  const blocks = work?.from === "job" && !isAutoPatch(work.job);
  return action && !action.hint && !blocks ? null : work;
}

export function heldContractLine(w: World, c: Contract): HTMLElement {
  const survey = c.kind === 'survey' && !isMet(c);
  return el(
    'div',
    { class: 'contract-line' },
    el('span', {}, survey ? contractSummary(c) : dockSummary(c), survey ? el('span', { class: 'dim' }, SPACE, surveyProgress(c), ...surveyClueLines(c)) : null, claimRivalMark(w, c)),
    c.kind === 'escort' ? escortLine(w, c) : el('span', { class: isLate(w, c) ? 'num bad' : 'num', title: heldContractDeadline(w, c) ?? undefined }, heldContractClock(w, c)),
  );
}

function guardLine(w: World, merc: Vehicle, turnsLeft: number): HTMLElement {
  return el(
    "div",
    { class: "contract-line" },
    el("span", {}, t("hud.guard", { name: driverName(merc) })),
    el("span", { class: "num", title: t("contract.leaves", { when: clock(w.turn + turnsLeft).full }) }, guardLeavesIn(w, turnsLeft)),
  );
}

function escortLine(w: World, c: EscortContract): HTMLElement | null {
  const status = escortStatusText(w, c);
  return status ? el("span", { class: escortStatus(w, c) === "apart" ? "num bad" : "num dim" }, status) : null;
}

function wantedRow(w: World, c: CrimeCase): HTMLElement {
  const label = t(`desk.case.${c.offense}`, { victim: caseVictimName(w, c) });
  return el("div", { class: "tooltip-row" }, el("span", {}, label), el("span", { class: "num" }, t("hud.wantedFiled", { site: siteName(c.site), when: clock(c.turn).full })));
}
