import { bindAttr, say } from "../text/language";
import { t } from "../text/msg";
import { el, panel, rightColumn } from "./dom";
import { clock, type LogLine } from "./format";

export const LOG_HISTORY = 200;

export class LogBook {
  private history: LogLine[] = [];

  get lines(): readonly LogLine[] {
    return this.history;
  }

  add(turn: number, line: LogLine): LogLine {
    const stamp = clock(turn).full;
    const stamped: LogLine = {
      text: t("log.stamped", { time: stamp, line: line.text }),
      cls: line.cls,
      spans: [{ text: stamp, cls: "log-time" }, ...(line.spans ?? [{ text: line.text, cls: line.cls }])],
    };
    this.history.unshift(stamped);
    if (this.history.length > LOG_HISTORY) this.history.length = LOG_HISTORY;
    return stamped;
  }
}

function lineRow(l: LogLine): HTMLElement {
  const spans = l.spans ?? [{ text: l.text, cls: "" }];
  return el(
    "div",
    { class: l.cls },
    ...spans.map((sp) => el("span", { class: sp.cls }, sp.text)),
  );
}

export class LogStrip {
  readonly root = panel("log-strip");

  constructor() {
    this.root.setAttribute("role", "button");
    this.root.setAttribute("tabindex", "0");
    bindAttr(this.root, "aria-label", t("log.panel"));
  }

  show(line: LogLine): void {
    this.root.replaceChildren(lineRow(line));
    bindAttr(this.root, "title", line.text);
  }
}

export class LogPanel {
  private book = new LogBook();
  readonly root = panel("log dock-panel", rightColumn());
  readonly strip = new LogStrip();
  private box = el("div", { class: "log-lines", tabindex: 0 });
  private toggle = el(
    "button",
    {
      class: "log-expand",
      title: t("log.expand"),
      "aria-label": t("log.expand"),
      onclick: () => this.flip(),
    },
    t("log.expandMark"),
  );

  constructor() {
    this.root.setAttribute("data-drawer-frame", "log");
    bindAttr(this.root, "aria-label", t("log.panel"));
    this.root.append(
      el("div", { class: "log-head" }, el("h3", { class: "panel-title" }, t("log.title")), this.toggle),
      this.box,
    );
  }

  newest(): LogLine | null {
    return this.book.lines[0] ?? null;
  }

  get texts(): string[] {
    return this.book.lines.map((line) => say(line.text));
  }

  add(turn: number, lines: LogLine[]): void {
    if (lines.length === 0) return;
    const reading = this.box.scrollTop > 0;
    const before = this.box.scrollHeight;
    for (const line of lines) {
      this.box.prepend(lineRow(this.book.add(turn, line)));
    }
    while (this.box.children.length > this.book.lines.length) this.box.lastElementChild?.remove();
    this.strip.show(this.newest()!);
    if (reading) this.box.scrollTop += this.box.scrollHeight - before;
  }

  private flip(): void {
    const expanded = this.root.classList.toggle("expanded");
    const title = expanded ? t("log.shrink") : t("log.expand");
    bindAttr(this.toggle, "title", title);
    bindAttr(this.toggle, "aria-label", title);
  }
}
