import { bindAttr, say } from "../text/language";
import { t, type Msg } from "../text/msg";
import { el } from "./dom";
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

export class LogPanel {
  private book = new LogBook();
  readonly lines = el("div", { class: "log-lines", tabindex: 0 });
  readonly root = el("div", { class: "log" }, this.lines);
  private get box(): HTMLElement {
    return this.lines;
  }
  constructor() {
    bindAttr(this.lines, "aria-label", t("log.panel"));
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
    if (reading) this.box.scrollTop += this.box.scrollHeight - before;
  }

  private placeRow(turn: number, line: LogLine): void {
    const placed = this.book.place(turn, line);
    if (placed.merged === null) this.box.prepend(lineRow(placed.line));
    else this.box.children[placed.merged].replaceWith(lineRow(placed.line));
  }
}
