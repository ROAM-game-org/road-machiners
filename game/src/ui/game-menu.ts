
import { closeLabel, phoneMode, touchMode } from "./input-mode";
import { ERROR_REPORT_BUILD, ERROR_REPORT_URL, FEEDBACK_URL } from "../config";
import { modeRulesOf } from "../sim/settings";
import type { ModeRules, WorldSetup } from "../sim/types";
import { setupText } from "../text/names";
import { bindAttr, setText, unbindAttr } from "../text/language";
import { t, verbatim, type Msg } from "../text/msg";
import { gameContext, gzip, type GameContext, type ReportContext } from "../three/error-report";
import { el, isBrowserChord, panel, topRight } from "./dom";
import { versionLabel } from "./hud-readout";
import { isNewGameOpen, openNewGame, type NewGameActions } from "./new-game";
import { OptionsPanel } from "./options";
import type { SoundSettings } from "./sound";
import { SavePanel, type SavePanelActions } from "./save-panel";
import type { TipSwitch } from "./tips";

export type GameMenuActions = SavePanelActions & {
  hasSave: () => boolean;
  newGame: NewGameActions;
  unstuck: { reason: () => Msg | null; run: () => void };
};

export type MenuEntry = "new" | "save" | "load" | "unstuck" | "options" | "tips" | "help" | "camera" | "report";

export type PhoneMenuLinks = { cameraLabel: () => Msg; toggleCamera: () => void; report: () => void };

const ENTRIES: { entry: MenuEntry; label: Msg }[] = [
  { entry: "new", label: t("menu.newGame") },
  { entry: "save", label: t("menu.save") },
  { entry: "load", label: t("menu.load") },
  { entry: "unstuck", label: t("menu.unstuck") },
  { entry: "options", label: t("menu.options") },
  { entry: "tips", label: t("menu.showTips") },
  { entry: "help", label: t("menu.help") },
  { entry: "camera", label: t("hud.camAuto") },
  { entry: "report", label: t("hud.feedbackTitle") },
];

const PHONE_ENTRIES: MenuEntry[] = ["camera", "report"];

type KeyCap = string | Msg;
type Control = { keys: KeyCap[]; on?: Msg; does: Msg; needs?: "radio" };
type ControlGroup = { title: Msg; controls: Control[] };

const click = t("help.key.click");

export const CONTROLS: ControlGroup[] = [
  {
    title: t("help.group.drive"),
    controls: [
      { keys: [click], on: t("help.on.ground"), does: t("help.does.driveByRoad") },
      { keys: [t("help.key.shift"), click], on: t("help.on.ground"), does: t("help.does.stopThere") },
      { keys: [t("help.key.space")], does: t("help.does.driveOrPause") },
      { keys: [t("help.key.holdSpace")], does: t("help.does.fastForward") },
      { keys: [click], on: t("help.on.yourTruck"), does: t("help.does.brake") },
      { keys: ["R"], does: t("help.does.manual") },
      { keys: ["P"], does: t("help.does.autoPatch") },
    ],
  },
  {
    title: t("help.group.places"),
    controls: [
      { keys: [click], on: t("help.on.townOrSite"), does: t("help.does.stopAtPad") },
      { keys: ["E"], on: t("help.on.pad"), does: t("help.does.padWork") },
      { keys: ["T"], does: t("help.does.radio"), needs: "radio" },
      { keys: ["1", "9"], does: t("help.does.reply"), needs: "radio" },
      { keys: ["H"], does: t("help.does.honk"), needs: "radio" },
    ],
  },
  {
    title: t("help.group.fight"),
    controls: [
      { keys: [click], on: t("help.on.truck"), does: t("help.does.inspectOrAim") },
      { keys: ["1", "4"], does: t("help.does.pickWeapon") },
      { keys: ["0"], does: t("help.does.allWeapons") },
      { keys: ["Q"], does: t("help.does.autoFire") },
      { keys: ["X"], does: t("help.does.showWeapons") },
    ],
  },
  {
    title: t("help.group.view"),
    controls: [
      { keys: ["W", "A", "S", "D"], does: t("help.does.pan") },
      { keys: [t("help.key.rightDrag")], does: t("help.does.pan") },
      { keys: [t("help.key.wheel")], does: t("help.does.zoom") },
      { keys: ["F"], does: t("help.does.center") },
      { keys: ["V"], does: t("help.does.camera") },
      { keys: ["I"], does: t("help.does.inventory") },
      { keys: ["R"], on: t("help.on.inventory"), does: t("help.does.turnItem") },
      { keys: ["C"], does: t("help.does.character") },
      { keys: ["J"], does: t("help.does.journal") },
      { keys: ["M"], does: t("help.does.map") },
    ],
  },
];

const TOUCH_CONTROLS: ControlGroup[] = [
  {
    title: t("help.group.touch"),
    controls: [
      { keys: [t("help.key.tap")], on: t("help.on.ground"), does: t("help.does.driveByRoad") },
      { keys: [t("help.key.hold")], on: t("help.on.ground"), does: t("help.does.stopThere") },
      { keys: [t("help.key.drag")], does: t("help.does.moveView") },
      { keys: [t("help.key.pinch")], does: t("help.does.zoom") },
      { keys: [t("help.key.tap")], on: t("help.on.truck"), does: t("help.does.look") },
      { keys: [t("help.key.tapAgain")], on: t("help.on.truck"), does: t("help.does.aimGun") },
      { keys: [t("help.key.hold")], on: t("help.on.control"), does: t("help.does.why") },
    ],
  },
];

export function controlsFor(rules: ModeRules, touch = false): ControlGroup[] {
  if (touch) return TOUCH_CONTROLS;
  return CONTROLS.map((group) => ({ ...group, controls: group.controls.filter((c) => !c.needs || rules[c.needs]) }));
}

function controlKeys(c: Control): HTMLElement {
  const range = c.keys.length === 2 && c.keys.every((k) => typeof k === "string" && /^\d$/.test(k));
  const cap = (k: KeyCap) => el("kbd", { class: "key" }, typeof k === "string" ? verbatim(k) : k);
  const caps = range ? [cap(c.keys[0]!), el("span", { class: "help-on" }, t("help.to")), cap(c.keys[1]!)] : c.keys.map(cap);
  return el("span", { class: "help-keys" }, ...caps, ...(c.on ? [el("span", { class: "help-on" }, c.on)] : []));
}

function controlGroup(group: ControlGroup): HTMLElement {
  return el(
    "div",
    { class: "help-group" },
    el("div", { class: "help-title" }, group.title),
    ...group.controls.flatMap((c) => [controlKeys(c), el("span", { class: "help-does" }, c.does)]),
  );
}

export function entryEnabled(entry: MenuEntry, busy: boolean, hasSave: boolean): boolean {
  if (entry === "help" || entry === "tips" || entry === "options" || entry === "camera" || entry === "report") return true;
  if (entry === "load") return !busy && hasSave;
  return !busy;
}

export function entryReason(entry: MenuEntry, busy: boolean, hasSave: boolean): Msg | null {
  if (entryEnabled(entry, busy, hasSave)) return null;
  return busy ? t("menu.waitForTurn") : t("save.none");
}

export class HelpPanel {
  constructor(private setup: () => WorldSetup) {}

  private root: HTMLElement | null = null;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.code === "Escape") this.close();
  };

  isOpen(): boolean {
    return this.root !== null;
  }

  open(): void {
    if (this.root) return;
    const root = panel("help dialog");
    bindAttr(root, "aria-label", t("help.title"));
    const setup = this.setup();
    const notes = [verbatim(versionLabel()), setupText(setup), ...(ERROR_REPORT_URL ? [t("help.errorsSent")] : [])];
    root.append(
      el("button", { class: "close btn-s", onclick: () => this.close() }, closeLabel()),
      el("div", { class: "help-groups" }, ...controlsFor(modeRulesOf(setup.mode), touchMode()).map(controlGroup)),
      el("div", { class: "help-notes" }, ...notes.map((note) => el("div", {}, note))),
    );
    this.root = root;
    window.addEventListener("keydown", this.onKey);
  }

  close(): void {
    if (!this.root) return;
    this.root.remove();
    this.root = null;
    window.removeEventListener("keydown", this.onKey);
  }

  toggle(): void {
    if (this.root) this.close();
    else this.open();
  }
}

export const FEEDBACK_TEXT_LIMIT = 3000;

export type FeedbackKind = "bug" | "idea";

export type FeedbackReport = { kind: FeedbackKind; text: string; build: string; context: ReportContext };

export type FeedbackResult = { status: "sent" } | { status: "failed" } | { status: "limited"; minutes: number | null };

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export function feedbackBuild(releaseFlag: string, pathname: string): string {
  if (releaseFlag === "release") return "release";
  return pathname.split("/").find((part) => part !== "") ?? "";
}

const isSent = (body: unknown): boolean => typeof body === "object" && body !== null && (body as { status?: unknown }).status === "sent";

const RATE_LIMITED = 429;

function limitMinutes(body: unknown): number | null {
  const seconds = typeof body === "object" && body !== null ? (body as { retryAfterSeconds?: unknown }).retryAfterSeconds : undefined;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds / 60) : null;
}

async function limitedResult(response: Response): Promise<FeedbackResult> {
  const body: unknown = await response.json().catch(() => null);
  return { status: "limited", minutes: limitMinutes(body) };
}

async function resultOf(response: Response): Promise<FeedbackResult> {
  if (response.status === RATE_LIMITED) return limitedResult(response);
  if (!response.ok) return { status: "failed" };
  const body: unknown = await response.json();
  return isSent(body) ? { status: "sent" } : { status: "failed" };
}

export function feedbackStatus(result: FeedbackResult): Msg {
  if (result.status === "sent") return t("feedback.sent");
  if (result.status === "failed") return t("feedback.failed");
  return result.minutes === null ? t("feedback.limitedLater") : t("feedback.limited", { n: result.minutes });
}

export async function sendFeedback(post: Fetch, url: string, report: FeedbackReport): Promise<FeedbackResult> {
  if (url === "") throw new Error("Feedback is off in this build: FEEDBACK_URL is empty");
  if (report.text.length > FEEDBACK_TEXT_LIMIT) throw new Error(`Feedback text is over ${FEEDBACK_TEXT_LIMIT} characters`);
  try {
    const response = await post(url, { method: "POST", headers: { "content-type": "application/gzip" }, body: await gzip(JSON.stringify(report)) });
    return await resultOf(response);
  } catch {
    return { status: "failed" };
  }
}

export class FeedbackForm {
  private root: HTMLElement | null = null;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.code === "Escape") this.close();
  };

  constructor(
    private readonly onSent: (text: Msg) => void,
    private readonly post: Fetch = (url, init) => fetch(url, init),
    private readonly url: string = FEEDBACK_URL,
    private readonly context: GameContext = gameContext,
  ) {}

  isOpen(): boolean {
    return this.root !== null;
  }

  open(kind: FeedbackKind): void {
    this.close();
    const root = panel("feedback-form dialog");
    bindAttr(root, "aria-label", t("feedback.title"));
    root.append(...(this.url === "" ? this.offContent() : this.formContent(kind)));
    this.root = root;
    window.addEventListener("keydown", this.onKey);
  }

  close(): void {
    if (!this.root) return;
    this.root.remove();
    this.root = null;
    window.removeEventListener("keydown", this.onKey);
  }

  private closeButton(): HTMLElement {
    return el("button", { class: "close btn-s", onclick: () => this.close() }, closeLabel());
  }

  private offContent(): HTMLElement[] {
    return [el("div", {}, t("feedback.off")), el("div", { class: "feedback-foot" }, this.closeButton())];
  }

  private formContent(first: FeedbackKind): HTMLElement[] {
    let kind = first;
    let busy = false;
    const kinds: Record<FeedbackKind, HTMLElement> = {
      bug: el("button", { onclick: () => choose("bug") }, t("feedback.bug")),
      idea: el("button", { onclick: () => choose("idea") }, t("feedback.idea")),
    };
    const box = el("textarea", { class: "feedback-text", maxlength: FEEDBACK_TEXT_LIMIT, rows: 8, "aria-label": t("feedback.title") }) as HTMLTextAreaElement;
    const count = el("span", { class: "num dim feedback-count" });
    const status = el("div", { class: "feedback-status bad", role: "status" });
    const send = el("button", { class: "feedback-send", onclick: () => submit() }, t("feedback.send"));

    const refresh = () => {
      for (const [name, button] of Object.entries(kinds)) button.classList.toggle("on", name === kind);
      setText(count, verbatim(`${box.value.length} / ${FEEDBACK_TEXT_LIMIT}`));
      if (busy) send.setAttribute("aria-disabled", "true");
      else send.removeAttribute("aria-disabled");
    };
    const choose = (next: FeedbackKind) => {
      kind = next;
      refresh();
      box.focus();
    };
    const submit = async () => {
      if (busy) return;
      if (box.value.trim() === "") return box.focus();
      busy = true;
      refresh();
      const report = { kind, text: box.value, build: feedbackBuild(ERROR_REPORT_BUILD, location.pathname), context: this.context.capture() };
      const result = await sendFeedback(this.post, this.url, report);
      busy = false;
      if (result.status === "sent") {
        this.close();
        this.onSent(feedbackStatus(result));
        return;
      }
      setText(status, feedbackStatus(result));
      refresh();
    };

    box.addEventListener("input", refresh);
    refresh();
    queueMicrotask(() => box.focus());
    return [
      el("div", { class: "tabs" }, kinds.bug, kinds.idea),
      box,
      status,
      el("div", { class: "feedback-foot" }, count, this.closeButton(), send),
    ];
  }
}

export class GameMenu {
  private root = panel("game-menu", topRight());
  private button = el(
    "button",
    { class: "menu-button", "aria-haspopup": "menu", "aria-expanded": "false", "aria-controls": "game-menu-list", onclick: () => this.toggle() },
    t("menu.menu"),
  ) as HTMLButtonElement;
  private list = el("div", { id: "game-menu-list", role: "menu", "aria-label": t("menu.menu"), hidden: true });
  private items = {} as Record<MenuEntry, HTMLButtonElement>;
  private savePanel: SavePanel;
  private help: HelpPanel;
  private options: OptionsPanel;

  private readonly onKey = (e: KeyboardEvent) => {
    if (e.code === "Escape") {
      e.stopPropagation();
      this.closeList(true);
      return;
    }
    if (isBrowserChord(e)) return;
    const move = { ArrowDown: 1, ArrowUp: -1, Home: 0, End: 0 }[e.code];
    if (move !== undefined) {
      e.preventDefault();
      this.moveFocus(e.code, move);
    }
    e.stopPropagation();
  };

  private readonly onPointer = (e: PointerEvent) => {
    if (e.target instanceof Node && this.root.contains(e.target)) return;
    this.closeList(false);
    e.stopPropagation();
    e.preventDefault();
  };

  private readonly onFocusOut = (e: FocusEvent) => {
    if (e.relatedTarget instanceof Node && !this.root.contains(e.relatedTarget)) this.closeList(false);
  };

  constructor(private actions: GameMenuActions, private isBusy: () => boolean, setup: () => WorldSetup, private tips: TipSwitch, private phone: PhoneMenuLinks, sound: SoundSettings) {
    this.options = new OptionsPanel(sound, () => this.button.focus());
    this.help = new HelpPanel(setup);
    this.savePanel = new SavePanel(actions);
    for (const { entry, label } of ENTRIES) {
      const role = entry === "tips" ? "menuitemcheckbox" : "menuitem";
      const item = el("button", { role, "data-entry": entry, onclick: () => this.choose(entry) }, label) as HTMLButtonElement;
      this.items[entry] = item;
      this.list.append(item);
    }
    this.root.append(this.button, this.list);
    this.refresh();
  }

  isOpen(): boolean {
    return !this.list.hidden || this.savePanel.isOpen() || this.options.isOpen() || isNewGameOpen();
  }

  refresh(): void {
    const busy = this.isBusy();
    const saved = this.actions.hasSave();
    for (const { entry } of ENTRIES) this.setReason(this.items[entry], entry === "unstuck" ? this.actions.unstuck.reason() : entryReason(entry, busy, saved));
    const on = this.tips.isOn();
    this.items.tips.setAttribute("aria-checked", String(on));
    setText(this.items.tips, t(on ? "menu.showTipsOn" : "menu.showTips"));
    setText(this.items.camera, this.phone.cameraLabel());
    for (const entry of PHONE_ENTRIES) this.items[entry].hidden = !phoneMode();
  }

  private setReason(item: HTMLButtonElement, reason: Msg | null): void {
    if (reason === null) {
      item.removeAttribute("aria-disabled");
      unbindAttr(item, "data-reason");
      return;
    }
    item.setAttribute("aria-disabled", "true");
    bindAttr(item, "data-reason", reason);
  }

  toggle(): void {
    if (this.list.hidden) this.openList();
    else this.closeList(true);
  }

  private allItems(): HTMLButtonElement[] {
    return ENTRIES.map((e) => this.items[e.entry]).filter((item) => !item.hidden);
  }

  private enabledItems(): HTMLButtonElement[] {
    return this.allItems().filter((b) => !b.hasAttribute("aria-disabled"));
  }

  private moveFocus(code: string, step: number): void {
    const items = this.allItems();
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = code === "Home" ? 0 : code === "End" ? items.length - 1 : (at + step + items.length) % items.length;
    items[next].focus();
  }

  private openList(): void {
    this.list.hidden = false;
    this.button.setAttribute("aria-expanded", "true");
    this.refresh();
    window.addEventListener("keydown", this.onKey, true);
    window.addEventListener("pointerdown", this.onPointer, true);
    this.root.addEventListener("focusout", this.onFocusOut);
    this.enabledItems()[0]?.focus();
  }

  private closeList(returnFocus: boolean): void {
    if (this.list.hidden) return;
    this.list.hidden = true;
    this.button.setAttribute("aria-expanded", "false");
    window.removeEventListener("keydown", this.onKey, true);
    window.removeEventListener("pointerdown", this.onPointer, true);
    this.root.removeEventListener("focusout", this.onFocusOut);
    if (returnFocus) this.button.focus();
  }

  private choose(entry: MenuEntry): void {
    if (this.items[entry].hasAttribute("aria-disabled")) return;
    this.closeList(false);
    if (entry === "save") this.savePanel.openSave();
    else if (entry === "load") this.savePanel.openLoad();
    else if (entry === "unstuck") this.actions.unstuck.run();
    else if (entry === "options") this.options.open();
    else if (entry === "tips") {
      this.tips.setOn(!this.tips.isOn());
      this.refresh();
    } else if (entry === "camera") {
      this.phone.toggleCamera();
      this.refresh();
    } else if (entry === "report") this.phone.report();
    else if (entry === "help") this.help.toggle();
    else this.newGame();
  }

  private newGame(): void {
    openNewGame(this.actions.newGame, () => this.refresh());
  }
}
