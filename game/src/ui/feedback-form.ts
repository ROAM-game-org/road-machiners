import { ERROR_REPORT_BUILD } from "../config";
import { setText, bindAttr } from "../text/language";
import { t, verbatim, type Msg } from "../text/msg";
import { gzip, type GameContext, type ReportContext } from "../three/error-report";
import { el, panel } from "./dom";
import { closeLabel } from "./input-mode";

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
    if (e.code !== "Escape") return;
    e.stopPropagation();
    this.close();
  };

  constructor(
    private readonly parent: HTMLElement,
    private readonly onSent: ((text: Msg) => void) | null,
    private readonly post: Fetch,
    private readonly url: string,
    private readonly context: GameContext,
  ) {}

  isOpen(): boolean {
    return this.root !== null;
  }

  open(kind: FeedbackKind): void {
    this.close();
    const root = panel("feedback-form dialog", this.parent);
    bindAttr(root, "aria-label", t("feedback.title"));
    root.append(...(this.url === "" ? this.offContent() : this.formContent(kind)));
    this.root = root;
    window.addEventListener("keydown", this.onKey, true);
  }

  close(): void {
    if (!this.root) return;
    this.root.remove();
    this.root = null;
    window.removeEventListener("keydown", this.onKey, true);
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
      if (result.status === "sent" && this.onSent) {
        this.close();
        this.onSent(feedbackStatus(result));
        return;
      }
      if (result.status === "sent") box.value = "";
      status.classList.toggle("good", result.status === "sent");
      status.classList.toggle("bad", result.status !== "sent");
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

export function feedbackCorner(form: FeedbackForm, host: HTMLElement): HTMLElement {
  const corner = panel("feedback", host);
  const menu = el("details", {});
  const entry = (kind: FeedbackKind, text: Msg) =>
    el(
      "button",
      {
        class: "btn-s",
        onclick: () => {
          menu.removeAttribute("open");
          form.open(kind);
        },
      },
      text,
    );
  menu.append(
    el("summary", { title: t("hud.feedbackTitle"), "aria-label": t("hud.feedbackTitle") }, t("hud.feedbackMark")),
    entry("bug", t("hud.reportBug")),
    entry("idea", t("hud.requestFeature")),
  );
  corner.append(menu);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape") menu.removeAttribute("open");
  });
  return corner;
}

export function mountReportDesk(root: HTMLElement, context: GameContext, url: string): void {
  const form = new FeedbackForm(root, null, (target, init) => fetch(target, init), url, context);
  feedbackCorner(form, root);
}
