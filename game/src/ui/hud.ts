
import { Drawers } from "./drawers";
import { keyLabel, phoneMode, RECENTER_KEY, touchMode } from "./input-mode";
import { uiSize } from "./ui-size";
import { escortStatus, type EscortContract } from "../sim/escort-job";
import { callError, DialoguePanel, type DialogueHost } from "./dialogue";
import { markError } from "../sim/detect";
import { hasExplorationMap, modeRules } from "../sim/settings";
import { playerCanAct } from "../sim/world";
import type { CrimeCase, Vehicle, World } from "../sim/types";
import { openCasesOn } from "../sim/crime";
import { workOf, type Work } from "../sim/states";
import { isAutoPatch } from "../sim/jobs";
import { bottomLeft, disabledWith, el, isBrowserChord, panel, rightDock, topCenter, topLeft, topRight, uiRoot } from "./dom";
import { LogPanel } from "./log";
import {
  claimRivalMark,
  escortStatusText,
  heldContractDue,
  contractSummary,
  surveyProgress,
  isNotable,
  surveyClueLines,
  surveyHowTo,
  eventText,
  formatNpcPass,
  workLabel,
  workProgress,
  formatNpcCargo,
  formatNpcLookOver,
  formatNpcMark,
  formatNpcTraits,
  wantedBounty,
  formatVehicleState,
  type LogLine,
  clock,
} from "./format";
import { FeedbackForm, type FeedbackKind } from "./game-menu";
import { getHudReadout, getRescueReadout, overdriveSwitch, type RescueReadout, type TipLine } from "./hud-readout";
import { createIcon, createSpeedDial, repairingPart } from "./cards";
import { aimMarks, TURN_PLAYING, type AimState } from "./weapons";
import { token } from "./tokens";
import { createSwitch } from "./switch";
import { Tips, type TipSwitch } from "./tips";
import { moneyEl } from "./units";
import { playerVehicle } from "../sim/damage";
import { playerGuard } from "../sim/hire";
import { affordableRanks, basicSkill, hasBasic, pendingPerkPairs } from "../sim/progress";
import { canLookOver } from "../sim/look-over";
import { douseBlock, type DouseBlock } from "../sim/engine-heat";
import { firstAidBlock, type FirstAidBlock } from "../sim/jobs";
import { firstAidTurns, firstAidTurnSupplies } from "../sim/health";
import { ENGINE_HEAT } from "../data/wear";
import type { RadioPanel } from "./radio";
import { HaulerGauge } from "./hauler-gauge";
import { type ConditionAim, TruckConditionView } from "./truck-condition-view";
import type * as THREE from "three";
import { TruckPortraits } from "../three/render/truckPortrait";
import { playerSees } from "../sim/vision";
import { bindAttr, setText } from "../text/language";
import { list, num, SPACE, t, verbatim, type Msg } from "../text/msg";
import { isMet, type Contract } from "../sim/market";
import { driverName, factionName, refusalText, setupText, siteName, templateName, vehicleTitle } from "../text/names";
import { stanceToward } from "../sim/relations";

export type ContextTarget =
  | { kind: 'aid'; id: string }
  | { kind: 'trade'; id: string }
  | { kind: 'parcel'; id: string }
  | { kind: 'shop' }
  | { kind: 'downed'; id: string }
  | { kind: 'stock'; id: string }
  | { kind: 'survey'; id: string; contractId: string }
  | { kind: 'loot'; id: string }
  | { kind: 'empty' }
  | { kind: 'outpost' };
export type ContextAction = { label: Msg; ready: boolean; target: ContextTarget; hint?: Msg; combat?: number };

export function contextKey(target: ContextTarget): string {
  return 'id' in target ? `${target.kind}:${target.id}` : target.kind;
}

function actionTitle(action: ContextAction): Msg | undefined {
  if (action.hint) return action.hint;
  if (action.combat !== undefined) return combatBlocked(action.combat);
  return action.ready ? undefined : t("hud.stopToUse");
}

function douseMsg(w: World, block: DouseBlock | null): Msg | null {
  if (block === null) return null;
  if (block === "noBasic") return refusalText(w, { id: "needsBasic", skill: basicSkill("overdrive") });
  if (block === "noSupplies") return t("hud.needSupplies", { n: ENGINE_HEAT.douseSupplies });
  return t("hud.douseBlock.engineCool");
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
  isBusy: () => boolean;
  autoTravel: () => boolean;
  dialogue: DialogueHost;
  recenter: () => void;
  unpin: () => void;
  cardAction: (action: CardAction) => void;
  aimPart: (vehicleId: string, partId: string) => void;
  aimState: (vehicleId: string) => AimState;
};
export type CardAction = 'mark' | 'lookOver';
export type CameraMode = "centered" | "auto";

const TOAST_MS = 3500;
const CONDITION_ROWS = 12;

const TONE_CLASS: Record<TipLine['tone'], string> = { base: 'dim', bad: 'bad', good: 'good', plain: '' };

export class MaxSpeedView {
  private readonly text = el('span', { class: 'speed-max-text' });
  private readonly lines = el('div', { class: 'speed-lines' });
  readonly root = el(
    'span',
    { class: 'speed-max', tabindex: 0, 'aria-describedby': 'speed-breakdown' },
    this.text,
    el('div', { class: 'speed-tip tooltip', id: 'speed-breakdown', role: 'tooltip' }, this.lines),
  );

  private shown = '';

  render(maxSpeed: number, lines: TipLine[]): void {
    setText(this.text, num(maxSpeed, "int"));
    const key = JSON.stringify(lines);
    if (key === this.shown) return;
    this.shown = key;
    this.lines.replaceChildren(
      ...lines.map((line) => el('div', { class: 'speed-line' }, el('span', {}, line.label), el('span', { class: `num ${TONE_CLASS[line.tone]}` }, line.value))),
    );
  }
}

export function mapInstrument(w: World, busy: boolean, openMap: () => void): HTMLElement[] {
  if (!hasExplorationMap(w)) return [];
  return [
    el(
      "button",
      { class: "instrument-button", "aria-disabled": busy ? "true" : undefined, onclick: () => !busy && openMap(), title: busy ? TURN_PLAYING : keyLabel(t("map.full"), "K") },
      t("map.full"),
    ),
  ];
}

function readoutClass(r: { warning: boolean; danger?: boolean }): string {
  return ["resource", r.warning ? "alert" : "", r.danger ? "danger" : ""].filter(Boolean).join(" ");
}

export class Hud {
  private top = panel("instruments", bottomLeft());
  private clockSlot = el("div", { class: "instrument-clock", role: "timer", title: t("hud.clockTitle") });
  private dialSlot = el("div", { class: "speed-dial-slot" });
  private maxSpeed = new MaxSpeedView();
  private speedSlot = el("div", { class: "speedometer" }, this.dialSlot, this.maxSpeed.root);
  private readoutSlot = el("div", { class: "readouts" });
  private actionSlot = el("div", { class: "instrument-actions" });
  private readonly portraits: TruckPortraits;
  private readonly condition: TruckConditionView;
  private haulerGauge = new HaulerGauge();
  private readonly inspected: TruckConditionView;
  private readonly inspectedDraw: HTMLElement;
  private inspectedAimable = false;
  private infoColumn = el("div", { class: "info-column" });
  private contracts = panel("contracts dock-panel", rightDock());
  private wanted = panel("wanted dock-panel", rightDock());
  private log = new LogPanel();
  private info = panel("info");
  private infoBody = el("div", { class: "info-content" });
  private feedback = panel("feedback", topLeft());
  private feedbackForm = new FeedbackForm((text) => this.toast(text));
  private action = panel("action");
  private toastBox = panel("toast");
  private rescue = panel("rescue notice", topCenter());
  private knockedOut = panel("status-mark", topCenter());
  private truckStack = el("div", { class: "truck-stack", "data-drawer-frame": "truck" });
  private stranded = panel("stranded notice", this.truckStack);
  private recenter = panel("recenter", bottomLeft());
  private cameraSwitch = panel("camera-mode", topRight());
  private tips = new Tips(window.localStorage, topCenter(), () => this.toast(t("hud.tipsOff")));
  cameraMode: CameraMode = "auto";
  private readonly drawers = new Drawers(uiRoot(), () => this.drawerMoved());
  private toastTimer: number | null = null;

  private readonly dialogue: DialoguePanel;

  private placeInfo = (): void => {
    if (this.info.style.display === "none" || this.info.getClientRects().length === 0) return;
    const gap = parseFloat(token("--hud-gap"));
    const top = uiSize().layerRect(topRight()).bottom + gap;
    this.info.style.top = `${top}px`;
    this.info.style.width = "";
    const slot = this.floorOfInfo() - gap - top;
    this.info.style.height = `${slot}px`;
    this.info.style.maxHeight = this.inspectedAimable && phoneMode() ? "none" : "";
    if (this.inspectedAimable) this.growForAim(top, slot);
    this.coverUnder(uiSize().layerRect(this.info).bottom);
    this.inspected.fitTo(this.inspectedDraw);
  };

  private drawerMoved(): void {
    requestAnimationFrame(this.placeInfo);
  }

  markCombat(on: boolean): void {
    this.drawers.mark("guns", on);
  }

  private floorOfInfo(): number {
    if (!phoneMode()) return uiSize().layerRect(this.radio.root).top;
    const open = this.drawers.open();
    const frame = open === null ? null : document.querySelector<HTMLElement>(`#ui [data-drawer-frame="${open}"]`);
    const card = uiSize().layerRect(this.info);
    const tops = [this.top, this.drawers.element, frame, this.recenter]
      .map((node) => (node ? uiSize().layerRect(node) : undefined))
      .filter((box) => box !== undefined && box.left < card.right && box.right > card.left)
      .map((box) => box!.top);
    return Math.min(...tops);
  }

  private aimCellPx(): number {
    return phoneMode() ? Math.max(32, 32 / uiSize().applied()) : parseFloat(token("--btn-h-s"));
  }

  private aimWidthCap(): number {
    const layer = uiSize().layerSize();
    const inset = parseFloat(getComputedStyle(this.info).right);
    const full = layer.width - 2 * inset;
    return layer.width < layer.height ? full : (full - parseFloat(token("--hud-gap"))) / 2;
  }

  private growForAim(top: number, slot: number): void {
    const need = this.inspected.boxFor(this.aimCellPx());
    const wider = need.width - this.inspectedDraw.clientWidth;
    const width = wider > 0 ? this.info.offsetWidth + wider : this.info.offsetWidth;
    if (phoneMode()) {
      this.info.style.width = `${Math.min(width, this.aimWidthCap())}px`;
      const fits = slot - this.inspectedDraw.clientHeight + need.height;
      this.info.style.height = `${Math.min(slot, Math.max(fits, 0))}px`;
      return;
    }
    if (wider > 0) this.info.style.width = `${width}px`;
    const tallest = uiSize().layerRect(this.log.root).bottom - top;
    this.info.style.height = `${tallest}px`;
    const fits = tallest - this.inspectedDraw.clientHeight + need.height;
    this.info.style.height = `${Math.min(tallest, Math.max(slot, fits))}px`;
  }

  private coverUnder(bottom: number | null): void {
    for (const below of [...rightDock().children, this.log.root] as HTMLElement[]) {
      below.style.visibility = bottom !== null && bottom > uiSize().layerRect(below).top ? "hidden" : "";
    }
  }

  constructor(private actions: HudActions, private radio: RadioPanel, renderer: THREE.WebGLRenderer) {
    this.portraits = new TruckPortraits(renderer);
    this.condition = new TruckConditionView(this.portraits, CONDITION_ROWS);
    this.inspected = new TruckConditionView(this.portraits, null);
    this.inspectedDraw = el("div", { class: "info-draw" }, this.inspected.root);
    const openLog = () => this.drawers.toggle("log");
    this.log.strip.root.addEventListener("click", openLog);
    this.log.strip.root.addEventListener("keydown", (e) => {
      if (e.code !== "Enter" && e.code !== "Space") return;
      e.preventDefault();
      openLog();
    });
    this.truckStack.append(this.condition.root, this.haulerGauge.root);
    bottomLeft().append(this.truckStack);
    this.dialogue = new DialoguePanel(actions.dialogue);
    this.info.style.display = "none";
    this.info.append(this.infoBody);
    this.contracts.style.display = "none";
    new ResizeObserver(this.placeInfo).observe(rightDock());
    new ResizeObserver(this.placeInfo).observe(this.inspectedDraw);
    window.addEventListener("resize", this.placeInfo);
    this.toastBox.style.display = "none";
    this.rescue.style.display = "none";
    this.knockedOut.style.display = "none";
    this.knockedOut.append(el("span", { class: "bad" }, t("actBlock.knockedOut")));
    this.stranded.style.display = "none";
    this.recenter.style.display = "none";
    this.recenter.append(el("button", { onclick: () => actions.recenter() }, t("hud.recenter"), el("kbd", { class: "key no-touch" }, verbatim(RECENTER_KEY))));
    this.showCameraMode();
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyV" && !isBrowserChord(e) && !document.activeElement?.matches("input, select, textarea")) this.toggleCameraMode();
    });
    const feedbackMenu = el("details", {});
    const feedbackEntry = (kind: FeedbackKind, text: Msg) =>
      el(
        "button",
        {
          class: "btn-s",
          onclick: () => {
            feedbackMenu.removeAttribute("open");
            this.feedbackForm.open(kind);
          },
        },
        text,
      );
    feedbackMenu.append(
      el(
        "summary",
        { title: t("hud.feedbackTitle"), "aria-label": t("hud.feedbackTitle") },
        t("hud.feedbackMark"),
      ),
      feedbackEntry("bug", t("hud.reportBug")),
      feedbackEntry("idea", t("hud.requestFeature")),
    );
    this.feedback.append(feedbackMenu);
    window.addEventListener("keydown", (e) => {
      if (e.code !== "Escape") return;
      feedbackMenu.removeAttribute("open");
    });
  }

  toggleCameraMode(): void {
    this.cameraMode = this.cameraMode === "auto" ? "centered" : "auto";
    this.showCameraMode();
  }

  cameraModeLabel(): Msg {
    return this.cameraMode === "auto" ? t("hud.camAuto") : t("hud.camCentered");
  }

  openFeedback(): void {
    this.feedbackForm.open("bug");
  }

  private showCameraMode(): void {
    this.cameraSwitch.replaceChildren(
      createSwitch({
        on: t("hud.camAuto"),
        off: t("hud.camCentered"),
        checked: this.cameraMode === "auto",
        key: "V",
        title: t("hud.camTitle"),
        onclick: () => this.toggleCameraMode(),
      }),
    );
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
    setText(this.toastBox, text);
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
  ): void {
    const me = playerVehicle(world);
    const shown = shownWork(action, workOf(world, me));
    this.action.style.display = action || shown ? "" : "none";
    if (shown) this.renderWork(shown, workLabel(world, me, shown));
    else if (action) this.renderActionButton(action, count, index, onUse, onCycle);
  }

  private renderWork(work: Work, label: Msg): void {
    const progress = Math.round(workProgress(work) * 100);
    this.action.replaceChildren(
      el(
        "span",
        { class: "job-label" },
        t("hud.workLeft", { label, n: work.turnsLeft }),
      ),
      el(
        "span",
        {
          class: "job-bar meter progress",
          role: "progressbar",
          "aria-label": t("hud.workProgress", { label }),
          "aria-valuemin": "0",
          "aria-valuemax": "100",
          "aria-valuenow": String(progress),
        },
        el("span", { style: `width:${progress}%` }),
      ),
    );
  }

  private renderActionButton(action: ContextAction, count: number, index: number, onUse: () => void, onCycle: (step: 1 | -1) => void): void {
    const use = el(
      "button",
      {
        ...disabledWith(action.ready ? null : (actionTitle(action) ?? null), onUse),
        class: action.combat !== undefined ? "btn-danger" : "",
      },
      action.hint || touchMode() ? action.label : t("hud.actionKey", { label: action.label }),
    );
    const cycle = (step: 1 | -1, glyph: Msg, key: string) =>
      el("button", { class: "cycle", title: touchMode() ? undefined : t("hud.cycleKey", { key }), onclick: () => onCycle(step) }, glyph);
    this.action.replaceChildren(
      ...(count > 1
        ? [cycle(-1, t("hud.prevMark"), "←"), use, el("span", { class: "count" }, t("hud.count", { n: index + 1, of: count })), cycle(1, t("hud.nextMark"), "→")]
        : [use]),
    );
  }

  renderRescue(w: World): void {
    this.dialogue.render(w);
    const r = getRescueReadout(w);
    this.knockedOut.style.display = rescueOf(r, "knockedOut") ? "" : "none";
    this.renderMiddle(rescueOf(r, "towed") ?? rescueOf(r, "dragged"));
    this.renderStranded(rescueOf(r, "stranded"));
  }

  private renderMiddle(r: Extract<RescueReadout, { kind: "towed" | "dragged" }> | null): void {
    this.rescue.style.display = r ? "" : "none";
    if (!r) return this.rescue.replaceChildren();
    this.rescue.replaceChildren(
      el("h3", {}, t("hud.underTow")),
      ...(r.kind === "towed" ? [el("div", {}, t("hud.towsYou", { who: r.tower, town: r.town })), el("div", { class: "dim" }, t("hud.fee"), SPACE, moneyEl(r.fee))] : []),
      el(
        "div",
        { class: "rescue-buttons" },
        el("button", { onclick: () => this.actions.unhitch() }, t("hud.unhitch")),
      ),
    );
  }

  private renderStranded(r: Extract<RescueReadout, { kind: "stranded" }> | null): void {
    this.stranded.style.display = r ? "" : "none";
    if (!r) return this.stranded.replaceChildren();
    this.stranded.replaceChildren(
      el("h3", {}, t("hud.stranded")),
      ...(r.beacon || !r.reason ? [] : [el("div", { class: "dim" }, r.reason)]),
      el(
        "div",
        { class: "rescue-buttons" },
        r.canEnd
          ? el("button", { class: "btn-danger", onclick: () => this.actions.endRun() }, t("hud.endRun"))
          : createSwitch({
              on: t("hud.beaconOn"),
              off: t("hud.beaconOff"),
              checked: r.beacon,
              title: t("hud.beaconTitle"),
              onclick: () => this.actions.setBeacon(!r.beacon),
            }),
      ),
    );
  }

  private renderWanted(w: World): void {
    const cases = openCasesOn(w, w.player.vehicleId);
    this.wanted.style.display = cases.length > 0 ? "" : "none";
    if (cases.length === 0) return this.wanted.replaceChildren();
    const owed = cases.reduce((sum, c) => sum + c.owed, 0);
    this.wanted.tabIndex = 0;
    this.wanted.replaceChildren(
      el("div", { class: "wanted-cases" }, ...cases.map((c) => wantedRow(w, c))),
      el("div", { class: "wanted-head" }, el("span", { class: "panel-title" }, t("hud.wanted")), el("span", { class: "num wanted-owed" }, moneyEl(owed))),
    );
  }

  private renderContracts(w: World): void {
    const guard = playerGuard(w);
    if (w.player.contracts.length === 0 && guard === null) {
      this.contracts.style.display = "none";
      return;
    }
    this.contracts.style.display = "";
    this.contracts.replaceChildren(
      el("h3", { class: "panel-title" }, t("hud.contracts")),
      ...w.player.contracts.map((c) => heldContractLine(w, c)),
      ...(guard ? [guardLine(w, guard.merc, guard.turnsLeft)] : []),
    );
  }

  private engineButtons(w: World, busy: boolean): HTMLElement[] {
    const od = overdriveSwitch(w);
    const lock = busy ? TURN_PLAYING : null;
    const headlights = createSwitch({
      on: t("hud.lightsOn"),
      off: t("hud.lightsOff"),
      checked: this.actions.headlightsOn(),
      key: "L",
      title: t("hud.lightsTitle"),
      onclick: () => this.actions.toggleHeadlights(),
    });
    const overdrive = createSwitch({
      on: t("hud.overdrive"),
      off: t("hud.overdriveOff"),
      checked: od.checked,
      key: "O",
      reason: lock ?? od.reason,
      locked: od.locked,
      title: od.title,
      onclick: () => this.actions.toggleOverdrive(),
    });
    const douse = this.douseButton(w, lock);
    return [headlights, overdrive, douse, this.firstAidButton(w, lock)];
  }

  private douseButton(w: World, lock: Msg | null): HTMLElement {
    const block = douseBlock(w);
    const reason = lock ?? douseMsg(w, block);
    return el(
      "button",
      {
        class: "instrument-button",
        "aria-disabled": reason === null ? undefined : "true",
        onclick: () => reason === null && this.actions.douseEngine(),
        title: reason ?? keyLabel(t("hud.costsSupplies", { n: ENGINE_HEAT.douseSupplies }), "G"),
      },
      block === "noBasic" ? createIcon("lock") : null,
      t("hud.douse"),
    );
  }

  private firstAidButton(w: World, lock: Msg | null): HTMLElement {
    const block = firstAidBlock(w);
    const reason = lock ?? firstAidMsg(w, block);
    const cost = Math.ceil(firstAidTurns(w) * firstAidTurnSupplies(w));
    return el(
      "button",
      {
        class: "instrument-button",
        "aria-disabled": reason === null ? undefined : "true",
        onclick: () => reason === null && this.actions.firstAid(),
        title: reason ?? keyLabel(t("hud.costsSupplies", { n: cost }), "U"),
      },
      block === "noBasic" ? createIcon("lock") : null,
      t("hud.firstAid"),
    );
  }

  private characterButton(w: World, busy: boolean): HTMLElement {
    const marked = pendingPerkPairs(w).length > 0 || affordableRanks(w).length > 0;
    return el(
      "button",
      {
        class: "instrument-button",
        "data-action": "character",
        "aria-disabled": busy ? "true" : undefined,
        onclick: () => !busy && this.actions.openCharacter(),
        title: busy ? TURN_PLAYING : keyLabel(marked ? t("hud.characterMarked") : t("hud.character"), "C"),
      },
      marked ? t("hud.driverMarked") : t("hud.driver"),
    );
  }

  private hornButton(w: World): HTMLElement {
    const reason = playerCanAct(w) ? null : refusalText(w, { id: "cannotAct" });
    return el("button", { class: "instrument-button touch-only", ...disabledWith(reason, () => this.dialogue.honk()) }, t("hud.horn"));
  }

  private journalButton(busy: boolean): HTMLElement {
    return el(
      "button",
      { class: "instrument-button", disabled: busy, onclick: () => this.actions.openJournal(), title: keyLabel(t("journal.hint"), "J") },
      t("hud.journal"),
    );
  }

  renderTop(w: World): void {
    const readout = getHudReadout(w);
    const busy = this.actions.isBusy();
    this.condition.render(playerVehicle(w), w.player.paint, undefined, repairingPart(w, playerVehicle(w)));
    this.haulerGauge.render(w);
    this.renderContracts(w);
    this.renderWanted(w);
    this.tips.update(w, this.actions.autoTravel());
    if (!this.top.firstChild) this.top.append(this.clockSlot, this.speedSlot, this.readoutSlot, this.actionSlot);
    this.renderClock(readout.clock);
    this.renderSpeedometer(readout, busy);
    this.fillReadouts(readout);
    this.renderActions(w, readout.manual, busy);
  }

  private renderClock(clock: ReturnType<typeof getHudReadout>["clock"]): void {
    bindAttr(this.clockSlot, "aria-label", t("hud.clockLabel", { when: clock.full }));
    this.clockSlot.replaceChildren(
      el("span", { class: "clock-day" }, el("span", {}, el("span", {}, clock.dayLabel)), el("span", {}, el("span", {}, clock.day))),
      el("span", { class: "clock-time" }, el("span", {}, clock.time)),
    );
  }

  private renderSpeedometer(readout: ReturnType<typeof getHudReadout>, busy: boolean): void {
    const dial = el(
      "button",
      {
        class: "truck-instrument",
        title: keyLabel(t("hud.inventoryTitle"), "I"),
        "aria-label": t("hud.inventoryLabel"),
        disabled: busy,
        onclick: () => this.actions.openInventory(),
      },
      createSpeedDial(readout.speed, readout.maxSpeed),
      el("span", { class: "speed-value" }, num(readout.speed, "int")),
      createIcon("truck"),
    );
    this.dialSlot.replaceChildren(dial);
    this.maxSpeed.render(readout.maxSpeed, readout.maxSpeedTip);
  }

  private fillReadouts(readout: ReturnType<typeof getHudReadout>): void {
    this.readoutSlot.replaceChildren(
      ...readout.resources.map((resource) =>
        el(
          "span",
          {
            class: readoutClass(resource),
            title: resource.tip ?? resource.label,
            "aria-label": resource.warning ? t("hud.readoutWarning", { label: resource.label, value: resource.value }) : t("hud.readout", { label: resource.label, value: resource.value }),
            "data-resource": resource.id,
          },
          resource.icon ? createIcon(resource.icon) : null,
          el("strong", {}, resource.balance !== undefined ? moneyEl(resource.balance) : resource.value),
        ),
      ),
      ...readout.survival.map((entry) =>
        el(
          "span",
          {
            class: `resource ${entry.warning ? "alert" : ""}`,
            title: entry.label,
            "data-resource": entry.id,
          },
          entry.icon ? createIcon(entry.icon) : null,
          el("strong", {}, entry.value),
          entry.progress !== undefined
            ? el(
                "span",
                {
                  class: "meter s progress",
                  role: "progressbar",
                  "aria-label": t("readout.engineHeat"),
                  "aria-valuenow": String(Math.round(entry.progress * 100)),
                },
                el("span", { style: `width:${Math.round(entry.progress * 100)}%` }),
              )
            : null,
        ),
      ),
    );
  }

  private renderActions(w: World, manual: boolean, busy: boolean): void {
    this.actionSlot.replaceChildren(
      createSwitch({
        on: t("hud.manual"),
        off: t("hud.route"),
        checked: manual,
        key: "R",
        reason: busy ? TURN_PLAYING : null,
        title: t("hud.manualTitle"),
        onclick: () => this.actions.toggleManual(),
      }),
      createSwitch({
        on: t("hud.autoPatch"),
        off: t("hud.noPatch"),
        checked: w.player.autoRepair,
        key: "P",
        reason: busy ? TURN_PLAYING : null,
        title: t("hud.autoPatchTitle"),
        onclick: () => this.actions.toggleAutoRepair(),
      }),
      ...this.engineButtons(w, busy),
      this.characterButton(w, busy),
      ...mapInstrument(w, busy, () => this.actions.openMap()),
      this.journalButton(busy),
      ...(modeRules(w).radio ? [this.hornButton(w)] : []),
    );
  }

  private cardButtons(w: World, v: Vehicle): HTMLElement {
    const own = v.faction === "player";
    const call = !own && v.brain && modeRules(w).radio ? [el("button", { class: "btn-s", ...disabledWith(callError(w, v.id), () => this.dialogue.callInspected()) }, t("card.call"))] : [];
    const refusal = markError(w, v.id);
    const mark = own ? [] : [el("button", { class: "btn-s", ...disabledWith(refusal && refusalText(w, refusal), () => this.actions.cardAction("mark")) }, t("card.mark"))];
    const close = el("button", { class: "btn-s", "aria-label": t("card.unpin"), title: t("card.unpin"), onclick: () => this.actions.unpin() }, t("hint.closeMark"));
    return el("span", { class: "info-touch touch-only" }, ...call, ...this.lookOverButton(w, v), ...mark, close);
  }

  private lookOverButton(w: World, v: Vehicle): HTMLElement[] {
    if (v.faction === "player" || !hasBasic(w, "lookOver")) return [];
    const refusal = canLookOver(w, playerVehicle(w), v);
    return [el("button", { class: "btn-s", ...disabledWith(refusal && refusalText(w, refusal), () => this.actions.cardAction("lookOver")) }, t("card.lookOver"))];
  }

  flushHorn(): void {
    this.dialogue.flushHorn();
  }

  pushEvents(w: World): void {
    const lines: LogLine[] = [];
    for (const e of w.events) {
      const line = eventText(w, e);
      if (!line) continue;
      lines.push(line);
      if (isNotable(e)) this.toast(line.text);
    }
    this.log.add(w.turn, lines);
    if (w.events.some((e) => e.t === 'sunwardFallen')) this.toast(t('log.sunwardFallen'));
    this.radio.hear(w);
  }

  logTexts(): string[] {
    return this.log.texts;
  }

  refuse(text: Msg): void {
    this.toast(text, true);
  }

  note(w: World, text: Msg, cls: string): void {
    this.log.add(w.turn, [{ text, cls }]);
  }

  private aimOf(w: World, v: Vehicle): ConditionAim | undefined {
    if (v.id === playerVehicle(w).id) return undefined;
    if (this.actions.aimState(v.id).locked) return undefined;
    return { marks: aimMarks(w, v.id), pick: (partId) => this.actions.aimPart(v.id, partId) };
  }

  showInfo(w: World, v: Vehicle | null, hostile: boolean): void {
    this.portraits.forget(new Set([playerVehicle(w).id, ...w.vehicles.filter((x) => playerSees(w, x.pos)).map((x) => x.id)]));
    if (!v) {
      this.info.style.display = "none";
      this.coverUnder(null);
      return;
    }
    const aim = this.aimOf(w, v);
    this.inspectedAimable = aim !== undefined;
    this.inspected.render(v, w.player.paint, aim);
    this.info.style.display = "";
    this.infoBody.replaceChildren(
      infoHead(w, v, hostile, this.cardButtons(w, v)),
      el("div", { class: "info-state" }, wantedMark(w, v), formatVehicleState(w, v)),
      ...quietLines(w, v).map((line) => el("div", { class: "info-state info-quiet" }, line)),
      el("div", { class: "info-body" }, this.inspectedDraw, this.infoColumn),
    );
    this.placeInfo();
  }
}

function rescueOf<K extends RescueReadout["kind"]>(r: RescueReadout | null, kind: K): Extract<RescueReadout, { kind: K }> | null {
  return r?.kind === kind ? (r as Extract<RescueReadout, { kind: K }>) : null;
}

function infoHead(w: World, v: Vehicle, hostile: boolean, buttons: HTMLElement): HTMLElement {
  const quiet = [v.brain ? templateName(v.brain.templateId) : null, factionName(v.faction)].filter((part) => part !== null);
  const quietText = list(quiet);
  return el(
    "div",
    { class: "info-head" },
    el("span", { class: "info-name" }, v.brain ? driverName(v) : vehicleTitle(w, v)),
    el("span", { class: "info-quiet", title: quietText }, quietText),
    ...(v.faction === "player" ? [] : [el("span", { class: `tag ${hostile ? "bad" : "dim"}` }, stanceTag(w, v, hostile))]),
    buttons,
  );
}

function wantedMark(w: World, v: Vehicle): HTMLElement | null {
  const owed = wantedBounty(w, v);
  return owed === null ? null : el("span", { class: "info-wanted" }, el("span", { class: "tag dim" }, t("hud.wanted")), el("span", { class: "num" }, moneyEl(owed)));
}

function stanceTag(w: World, v: Vehicle, hostile: boolean): Msg {
  if (hostile) return t("hud.tagHostile");
  const band = stanceToward(w, v);
  if (band === "neutral") return t("hud.tagNeutral");
  return t(`band.${band === "allied" ? "friendly" : band}`);
}

function quietLines(w: World, v: Vehicle): Msg[] {
  if (!v.brain) return [];
  return [formatNpcPass(w, v), formatNpcTraits(w, v), formatNpcCargo(w, v), formatNpcLookOver(w, v), formatNpcMark(w, v)].filter((line) => line !== null);
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
    el('span', {}, contractSummary(c), survey ? el('span', { class: 'dim' }, SPACE, surveyProgress(c), ...surveyClueLines(c), surveyHowTo(c)) : null, claimRivalMark(w, c)),
    c.kind === 'escort' ? escortLine(w, c) : el('span', { class: 'num' }, heldContractDue(c)),
  );
}

function guardLine(w: World, merc: Vehicle, turnsLeft: number): HTMLElement {
  return el(
    "div",
    { class: "contract-line" },
    el("span", {}, t("hud.guard", { name: driverName(merc) })),
    el("span", { class: "num" }, t("contract.leaves", { when: clock(w.turn + turnsLeft).full })),
  );
}

function escortLine(w: World, c: EscortContract): HTMLElement | null {
  const status = escortStatusText(w, c);
  return status ? el("span", { class: escortStatus(w, c) === "apart" ? "num bad" : "num dim" }, status) : null;
}

function wantedRow(w: World, c: CrimeCase): HTMLElement {
  const victim = w.vehicles.find((v) => v.id === c.victim);
  const label = t(`desk.case.${c.offense}`, { victim: victim ? vehicleTitle(w, victim) : t("log.someDriver") });
  return el("div", { class: "tooltip-row" }, el("span", {}, label), el("span", { class: "num" }, t("hud.wantedFiled", { site: siteName(c.site), when: clock(c.turn).full })));
}
