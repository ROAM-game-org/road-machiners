import { bindAttr, say } from "../text/language";
import { t, type Msg } from "../text/msg";
import { el, panel, rightColumn } from "./dom";
import { clock, type LogLine } from "./format";
import { mergeVolleys, volleyLine } from "./volley";

export const LOG_HISTORY = 200;

export class LogBook {
  private history: LogLine[] = [];

  get lines(): readonly LogLine[] {
    return this.history;
  }

  add(turn: number, line: LogLine): LogLine {
    return this.place(turn, line).line;
  }

  place(turn: number, line: LogLine): { line: LogLine; merged: number | null } {
    const stamp = clock(turn).full;
    const at = this.sameVolleyAt(say(stamp), line);
    if (at !== null) {
      const merged = stampedLine(stamp, volleyLine(mergeVolleys(this.history[at].volley!, line.volley!)));
      this.history[at] = merged;
      return { line: merged, merged: at };
    }
    const stamped = stampedLine(stamp, line);
    this.history.unshift(stamped);
    if (this.history.length > LOG_HISTORY) this.history.length = LOG_HISTORY;
    return { line: stamped, merged: null };
  }

  private sameVolleyAt(stamp: string, line: LogLine): number | null {
    if (!line.volley) return null;
    for (let i = 0; i < this.history.length && this.history[i].stamp === stamp; i++) if (this.history[i].volley?.key === line.volley.key) return i;
    return null;
  }
}

function stampedLine(stamp: Msg, line: LogLine): LogLine {
  return {
    text: t("log.stamped", { time: stamp, line: line.text }),
    cls: line.cls,
    stamp: say(stamp),
    volley: line.volley,
    spans: [{ text: stamp, cls: "log-time" }, ...(line.spans ?? [{ text: line.text, cls: line.cls }])],
  };
}

function lineRow(l: LogLine): HTMLElement {
  const spans = l.spans ?? [{ text: l.text, cls: "" }];
  return el(
    "div",
    { class: l.cls },
    ...spans.flatMap((sp) => {
      const span = el("span", { class: sp.cls }, sp.text);
      return sp.cls === "log-time" ? [span, document.createTextNode(" ")] : [span];
    }),
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
    for (const line of lines) this.placeRow(turn, line);
    while (this.box.children.length > this.book.lines.length) this.box.lastElementChild?.remove();
    this.strip.show(this.newest()!);
    if (reading) this.box.scrollTop += this.box.scrollHeight - before;
  }

  private placeRow(turn: number, line: LogLine): void {
    const placed = this.book.place(turn, line);
    if (placed.merged === null) this.box.prepend(lineRow(placed.line));
    else this.box.children[placed.merged].replaceWith(lineRow(placed.line));
  }

  private flip(): void {
    const expanded = this.root.classList.toggle("expanded");
    const title = expanded ? t("log.shrink") : t("log.expand");
    bindAttr(this.toggle, "title", title);
    bindAttr(this.toggle, "aria-label", title);
  }
}
